import React, { useState, useEffect } from 'react';
import { Device } from '../types';
import { fetchDevices } from '../services/api';
import { getDeviceConfig, DEVICE_RULES } from '../config/shifts';
import { Settings, Smartphone, Clock, Code2, AlertCircle } from 'lucide-react';

interface DeviceManagerProps {
    onDevicesUpdated?: (devices: Device[]) => void;
}

const DeviceManager: React.FC<DeviceManagerProps> = ({ onDevicesUpdated }) => {
    const [devices, setDevices] = useState<Device[]>([]);
    const [loading, setLoading] = useState(false);
    const [expandedDevice, setExpandedDevice] = useState<string | null>(null);

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
            // We check specifically for our manual Test Device since it has a known SN in the config
            const testDeviceSN = 'AF4C232560143';
            const exists = merged.find(d => d.serial_number === testDeviceSN);

            if (!exists) {
                const config = getDeviceConfig({ sn: testDeviceSN });
                merged.push({
                    id: 9999, // Dummy ID
                    serial_number: testDeviceSN,
                    device_name: config.alias || 'Unknown',
                    status: 'OFFLINE',
                    last_activity: new Date().toISOString(),
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

    return (
        <div className="space-y-6 animate-fade-in max-w-6xl mx-auto">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-xl shadow-lg shadow-purple-500/20 text-white">
                        <Code2 size={20} />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-slate-800 dark:text-white">إعدادات الأجهزة (Code Mode)</h2>
                        <p className="text-slate-500 dark:text-slate-400 text-xs mt-1">يتم إدارة الورديات والمسميات مركزياً عبر ملف <code>config/shifts.ts</code></p>
                    </div>
                </div>
                <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30 px-3 py-1.5 rounded-lg flex items-center gap-2 text-amber-700 dark:text-amber-400 text-xs font-bold">
                    <AlertCircle size={14} />
                    وضع القراءة فقط
                </div>
            </div>

            {loading ? (
                <div className="text-center py-12 text-slate-400 bg-white dark:bg-[#1e293b] rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800">جاري تحميل بيانات الأجهزة...</div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {devices.map(device => {
                        // Re-calculate config to ensure UI is in sync
                        const config = getDeviceConfig(device);
                        const isExpanded = expandedDevice === device.sn;

                        return (
                            <div
                                key={device.sn}
                                className={`bg-white dark:bg-[#1e293b] rounded-2xl border transition-all duration-300 relative overflow-hidden group ${isExpanded
                                    ? 'col-span-1 md:col-span-2 lg:col-span-3 border-purple-500 shadow-xl shadow-purple-500/10 ring-1 ring-purple-500/50 z-10'
                                    : 'border-slate-200 dark:border-slate-800 hover:border-purple-400/50 hover:shadow-md'
                                    }`}
                            >
                                {/* Header / Summary View */}
                                <div
                                    className="p-4 flex items-center justify-between cursor-pointer"
                                    onClick={() => setExpandedDevice(isExpanded ? null : device.sn)}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${isExpanded ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/30' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'
                                            }`}>
                                            <Smartphone size={18} />
                                        </div>
                                        <div>
                                            <div className="font-bold text-sm text-slate-800 dark:text-white flex items-center gap-2">
                                                {config.alias || device.alias || `جهاز ${device.sn}`}
                                                {/* Badge if matched by rule vs default */}
                                                {config.alias && config.alias !== device.alias && config.alias !== `جهاز ${device.sn}` && (
                                                    <span className="text-[9px] bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-300 px-1.5 py-0.5 rounded-md">Matched</span>
                                                )}
                                            </div>
                                            <div className="text-[10px] text-slate-400 font-mono">{device.sn}</div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3">
                                        <div className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${config.shifts.length > 0
                                            ? 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-900/20 dark:border-emerald-900/30 dark:text-emerald-400'
                                            : 'bg-slate-50 text-slate-400 border-slate-100 dark:bg-slate-800 dark:border-slate-700'
                                            }`}>
                                            {config.shifts.length > 0 ? (config.shifts.length === 2 ? 'فترتين' : 'فترة واحدة') : 'غير محدد'}
                                        </div>
                                    </div>
                                </div>

                                {/* Expanded View (Read Only) */}
                                {isExpanded && (
                                    <div className="border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 p-5 animate-fade-in backdrop-blur-sm">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                            {/* Column 1: Info */}
                                            <div>
                                                <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-4 block">تفاصيل الجهاز</h4>
                                                <div className="space-y-3">
                                                    <div className="flex justify-between p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                                                        <span className="text-xs text-slate-500">الاسم المعرف (Code):</span>
                                                        <span className="text-xs font-bold font-mono text-slate-700 dark:text-slate-200">{config.alias}</span>
                                                    </div>
                                                    <div className="p-3 bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800/20 rounded-xl text-[11px] text-blue-700 dark:text-blue-300 leading-relaxed">
                                                        هذا الجهاز يتبع قواعد التكوين في الملف المصدري. لتعديل الإعدادات، يرجى مراجعة المبرمج أو تعديل ملف <code>config/shifts.ts</code>.
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Column 2: Shifts (Read Only) */}
                                            <div>
                                                <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-4 flex items-center gap-2">
                                                    <Clock size={14} />
                                                    أوقات العمل المعتمدة
                                                </h4>
                                                <div className="space-y-2">
                                                    {config.shifts.map((shift, idx) => (
                                                        <div key={idx} className="flex items-center gap-3 bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                                                            <div className={`w-1.5 self-stretch rounded-full ${idx === 0 ? 'bg-orange-400' : 'bg-indigo-400'}`}></div>
                                                            <div className="flex-1">
                                                                <div className="text-[10px] text-slate-400 font-bold mb-1">{idx === 0 ? 'الفترة الأولى' : 'الفترة الثانية'}</div>
                                                                <div className="flex items-center justify-between text-sm font-bold text-slate-700 dark:text-white">
                                                                    <span>{shift.start}</span>
                                                                    <span className="text-slate-300 mx-2">←</span>
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
