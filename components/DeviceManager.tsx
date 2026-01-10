import React, { useState, useEffect } from 'react';
import { Device } from '../types';
import { fetchDevices, API_CONFIG, LEGACY_API_CONFIG, getHeaders } from '../services/api';
import { getDeviceConfig, DEVICE_RULES } from '../config/shifts';
import { Settings, Smartphone, Clock, Code2, AlertCircle, RefreshCw, CheckCircle, UploadCloud } from 'lucide-react';
import { Capacitor } from '@capacitor/core';

interface DeviceManagerProps {
    onDevicesUpdated?: (devices: Device[]) => void;
}

const DeviceManager: React.FC<DeviceManagerProps> = ({ onDevicesUpdated }) => {
    const [devices, setDevices] = useState<Device[]>([]);
    const [loading, setLoading] = useState(false);
    const [expandedDevice, setExpandedDevice] = useState<string | null>(null);
    const [syncing, setSyncing] = useState(false);
    const [syncStatus, setSyncStatus] = useState<string | null>(null);

    useEffect(() => {
        loadDevices();
    }, []);

    const loadDevices = async () => {
        setLoading(true);
        try {
            const apiDevices = await fetchDevices();

            // Merge with Static Code Configuration
            const merged = apiDevices.map(d => {
                const config = getDeviceConfig(d);
                return {
                    ...d,
                    alias: config.alias,
                    shifts: config.shifts
                };
            });

            // Inject Config-Only Devices (e.g. Developer Device) if not in DB
            const testDeviceSN = 'AF4C232560143';
            const exists = merged.find(d => d.sn === testDeviceSN);

            if (!exists) {
                const config = getDeviceConfig({ sn: testDeviceSN });
                merged.push({
                    id: '9999', // String ID as per type
                    sn: testDeviceSN,
                    device_name: config.alias || 'Unknown',
                    status: 'OFFLINE',
                    lastActivity: new Date().toISOString(), // Match 'lastActivity' type
                    alias: config.alias,
                    shifts: config.shifts
                } as any);
            }

            setDevices(merged);
            if (onDevicesUpdated) onDevicesUpdated(merged);

        } catch (error) {
            console.error("Failed to load devices", error);
        } finally {
            setLoading(false);
        }
    };

    const handleSyncEmployees = async (targetSn: string) => {
        setSyncing(true);
        setSyncStatus('Fetching from Legacy...');
        try {
            // 1. Fetch from LEGACY (Proxy) using the correct 'personnel' endpoint
            const headers = await getHeaders(); // Use shared auth logic

            const legacyUrl = Capacitor.isNativePlatform()
                ? 'http://qssun.dyndns.org:8085/personnel/api/employees/?page_size=2000'
                : '/legacy_personnel/api/employees/?page_size=2000';

            const legacyRes = await fetch(legacyUrl, {
                headers // Use headers with JWT
            });

            // Note: If auth is needed, we might need a fixed token or skipping auth if query is public/cookie-based
            // Fallback for demo: Assuming we can get list. If not, we might need to use a hardcoded list or admin credentials.
            // Assuming basic auth or public for 'get'.

            if (!legacyRes.ok) throw new Error('Failed to fetch from Legacy Server');
            const legacyData = await legacyRes.json();
            const employees = Array.isArray(legacyData) ? legacyData : (legacyData.data || legacyData.results || []);

            setSyncStatus(`Syncing ${employees.length} Users...`);

            // 2. Push to NEW Server (sync_user.php)
            // Also check if Employee Object contains biometric data inline (Common in some API versions)
            let inlineFingerprints: any[] = [];
            let syncedCount = 0;

            for (const emp of employees) {
                const payload = {
                    device_sn: targetSn,
                    user_id: emp.emp_code,
                    name: `${emp.first_name || ''} ${emp.last_name || ''}`.trim(),
                    role: 0,
                    card_number: emp.card_number || '',
                    password: emp.password || ''
                };

                // Check for inline biometrics
                if (emp.fingerprints && Array.isArray(emp.fingerprints)) {
                    inlineFingerprints.push(...emp.fingerprints);
                } else if (emp.biometric && Array.isArray(emp.biometric)) {
                    inlineFingerprints.push(...emp.biometric);
                }

                await fetch(`${API_CONFIG.baseUrl}/iclock/sync_user.php`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                syncedCount++;
                if (syncedCount % 5 === 0) setSyncStatus(`Synced Users ${syncedCount}/${employees.length}...`);
            }

            // 3. Sync Fingerprints
            // Strategy A: Use Inline Found FPs
            let templates = inlineFingerprints;
            let source = 'Inline';

            // Strategy B: If no inline, try Fetching from Endpoints (Reduced List)
            if (templates.length === 0) {
                const validPaths = [
                    '/personnel/api/emp_finger/?page_size=5000',
                    '/biometric/api/template/?page_size=5000'
                ];

                for (const path of validPaths) {
                    let tryUrl = '';
                    if (path.startsWith('/personnel')) {
                        tryUrl = Capacitor.isNativePlatform() ? `http://qssun.dyndns.org:8085${path}` : `/legacy_personnel${path.replace('/personnel', '')}`;
                    } else {
                        tryUrl = Capacitor.isNativePlatform() ? `http://qssun.dyndns.org:8085${path}` : `/legacy_biometric${path.replace('/biometric', '').replace('/api', '')}`;
                    }

                    try {
                        const res = await fetch(tryUrl, { headers: legacyHeaders });
                        if (res.ok) {
                            const fpData = await res.json();
                            templates = Array.isArray(fpData) ? fpData : (fpData.data || fpData.results || []);
                            if (templates.length > 0) {
                                source = 'Endpoint';
                                break;
                            }
                        }
                    } catch (e) { }
                }
            }

            if (templates.length > 0) {
                setSyncStatus(`Syncing ${templates.length} Fingerprints (${source})...`);
                let fpCount = 0;
                for (const t of templates) {
                    const payload = {
                        user_id: t.user_code || t.pin || t.user_id,
                        finger_id: t.finger_id || t.fid || 0,
                        template_data: t.template || t.tmp || t.fingerprint, // Cover all naming cases
                        device_sn: targetSn
                    };

                    await fetch(`${API_CONFIG.baseUrl}/iclock/sync_fingerprint.php`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    fpCount++;
                    if (fpCount % 10 === 0) setSyncStatus(`Synced FPs ${fpCount}/${templates.length}...`);
                }
            } else {
                console.warn("No Fingerprints found (Inline or Endpoint)");
                setSyncStatus(`Note: Users Synced. Fingerprints Not Found.`);
            }

            // 4. Trigger Force User & FP Sync Command
            await fetch(`${API_CONFIG.baseUrl}/iclock/force_sync`);
            // Trigger Node.js (via local proxy) to start feeding FPs to device
            await fetch(`/local_iclock/trigger_fp_sync?sn=${targetSn}`);

            setSyncStatus(`Success! Synced ${syncedCount} Employees.`);
            setTimeout(() => {
                setSyncStatus(null);
                setSyncing(false);
            }, 3000);

        } catch (e: any) {
            console.error(e);
            setSyncStatus(`Error: ${e.message}`);
            setSyncing(false);
        }
    };

    return (
        <div className="space-y-6 animate-fade-in max-w-6xl mx-auto">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-xl shadow-lg shadow-purple-500/20 text-white">
                        <Code2 size={20} />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-white">إعدادات الأجهزة (Code Mode)</h2>
                        <p className="text-slate-400 text-xs mt-1">يتم إدارة الورديات والمسميات مركزياً عبر ملف <code>config/shifts.ts</code></p>
                    </div>
                </div>
                <div className="bg-amber-900/10 border border-amber-800/30 px-3 py-1.5 rounded-lg flex items-center gap-2 text-amber-400 text-xs font-bold">
                    <AlertCircle size={14} />
                    وضع القراءة فقط
                </div>
            </div>

            {loading ? (
                <div className="text-center py-12 text-slate-400 bg-slate-800 rounded-2xl shadow-sm border border-slate-800">جاري تحميل بيانات الأجهزة...</div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {devices.map(device => {
                        // Re-calculate config to ensure UI is in sync
                        const config = getDeviceConfig(device);
                        const isExpanded = expandedDevice === device.sn;
                        const isTargetDevice = device.sn === 'AF4C232560143'; // Only show sync for this device

                        return (
                            <div
                                key={device.sn}
                                className={`bg-slate-900 rounded-2xl border transition-all duration-300 relative overflow-hidden group ${isExpanded
                                    ? 'col-span-1 md:col-span-2 lg:col-span-3 border-purple-500 shadow-xl shadow-purple-500/10 ring-1 ring-purple-500/50 z-10'
                                    : 'border-slate-800 hover:border-purple-500/50 hover:shadow-md'
                                    }`}
                            >
                                {/* Header / Summary View */}
                                <div className="p-4">
                                    <div
                                        className="flex items-center justify-between cursor-pointer mb-4"
                                        onClick={() => setExpandedDevice(isExpanded ? null : device.sn)}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${isExpanded ? 'bg-purple-900/30 text-purple-400' : 'bg-slate-800 text-slate-400'
                                                }`}>
                                                <Smartphone size={18} />
                                            </div>
                                            <div>
                                                <div className="font-bold text-sm text-white flex items-center gap-2">
                                                    {config.alias || device.alias || `جهاز ${device.sn}`}
                                                    {config.alias && config.alias !== device.alias && config.alias !== `جهاز ${device.sn}` && (
                                                        <span className="text-[9px] bg-purple-900/40 text-purple-300 px-1.5 py-0.5 rounded-md">Matched</span>
                                                    )}
                                                </div>
                                                <div className="text-[10px] text-slate-400 font-mono">{device.sn}</div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3">
                                            <div className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${config.shifts.length > 0
                                                ? 'bg-emerald-900/20 border-emerald-900/30 text-emerald-400'
                                                : 'bg-slate-800 border-slate-700 text-slate-400'
                                                }`}>
                                                {config.shifts.length > 0 ? (config.shifts.length === 2 ? 'فترتين' : 'فترة واحدة') : 'غير محدد'}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Sync Button (Only for Target Device) */}
                                    {isTargetDevice && (
                                        <div className="mt-2 border-t border-slate-800 pt-3 flex justify-between items-center">
                                            <span className="text-[10px] text-slate-500">ادوات المزامنة</span>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleSyncEmployees(device.sn); }}
                                                disabled={syncing}
                                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${syncing
                                                    ? 'bg-blue-900/20 border-blue-800/30 text-blue-400 cursor-wait'
                                                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-blue-600 hover:text-white hover:border-blue-500'}`}
                                            >
                                                {syncing ? <RefreshCw size={14} className="animate-spin" /> : <UploadCloud size={14} />}
                                                {syncStatus || 'مزامنة الموظفين'}
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* Expanded View (Read Only) */}
                                {isExpanded && (
                                    <div className="border-t border-slate-800 bg-slate-900/50 p-5 animate-fade-in backdrop-blur-sm">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                            {/* Column 1: Info */}
                                            <div>
                                                <h4 className="text-xs font-bold text-slate-400 mb-4 block">تفاصيل الجهاز</h4>
                                                <div className="space-y-3">
                                                    <div className="flex justify-between p-3 bg-slate-800 rounded-xl border border-slate-700">
                                                        <span className="text-xs text-slate-500">الاسم المعرف (Code):</span>
                                                        <span className="text-xs font-bold font-mono text-slate-200">{config.alias}</span>
                                                    </div>
                                                    <div className="p-3 bg-blue-900/10 border border-blue-800/20 rounded-xl text-[11px] text-blue-300 leading-relaxed">
                                                        هذا الجهاز يتبع قواعد التكوين في الملف المصدري. لتعديل الإعدادات، يرجى مراجعة المبرمج أو تعديل ملف <code>config/shifts.ts</code>.
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Column 2: Shifts (Read Only) */}
                                            <div>
                                                <h4 className="text-xs font-bold text-slate-400 mb-4 flex items-center gap-2">
                                                    <Clock size={14} />
                                                    أوقات العمل المعتمدة
                                                </h4>
                                                <div className="space-y-2">
                                                    {config.shifts.map((shift, idx) => (
                                                        <div key={idx} className="flex items-center gap-3 bg-slate-800 p-3 rounded-xl border border-slate-700 shadow-sm">
                                                            <div className={`w-1.5 self-stretch rounded-full ${idx === 0 ? 'bg-orange-400' : 'bg-indigo-400'}`}></div>
                                                            <div className="flex-1">
                                                                <div className="text-[10px] text-slate-400 font-bold mb-1">{idx === 0 ? 'الفترة الأولى' : 'الفترة الثانية'}</div>
                                                                <div className="flex items-center justify-between text-sm font-bold text-white">
                                                                    <span>{shift.start}</span>
                                                                    <span className="text-slate-500 mx-2">←</span>
                                                                    <span>{shift.end}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default DeviceManager;
