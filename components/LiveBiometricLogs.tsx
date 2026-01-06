import React, { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { Clock, CheckCircle, Wifi, Users, AlertTriangle, WifiOff, RefreshCw, UserPlus } from 'lucide-react';
import { API_CONFIG } from '../services/api';

interface DeviceLog {
    id: number;
    device_sn: string;
    user_id: string;
    check_time: string;
    status: number;
    verify_mode: number;
    created_at: string;
}

interface DeviceStatus {
    id: number;
    serial_number: string;
    device_name: string;
    status: 'ONLINE' | 'OFFLINE';
    last_activity: string;
}

interface BiometricUser {
    user_id: string;
    name: string;
    role: number;
    device_sn: string;
}

interface LiveBiometricLogsProps {
    employees: Record<string, { name: string; devices: string[] }>;
    settings?: { workStartTime: string; workEndTime: string };
}

const LiveBiometricLogs: React.FC<LiveBiometricLogsProps> = ({ employees, settings }) => {
    const [logs, setLogs] = useState<DeviceLog[]>([]);
    const [devices, setDevices] = useState<DeviceStatus[]>([]);
    const [syncedUsers, setSyncedUsers] = useState<BiometricUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
    const [error, setError] = useState<string | null>(null);

    const fetchData = async () => {
        try {
            setError(null);
            // Determine API URL based on platform
            const apiUrl = Capacitor.isNativePlatform()
                ? 'https://qssun.solar/api/biometric_stats.php'
                : '/biometric_api/biometric_stats.php';

            const res = await fetch(apiUrl);

            // Handle HTTP Errors
            if (!res.ok) {
                const text = await res.text();
                throw new Error(`Server Error: ${res.status} ${res.statusText}`);
            }

            const data = await res.json();

            // Handle API Logic Errors
            if (data.status === 'error') {
                throw new Error(data.message || 'API Logic Error');
            }

            if (data.logs) setLogs(data.logs);
            if (data.devices) setDevices(data.devices);
            if (data.users) setSyncedUsers(data.users);

            setLastUpdate(new Date());
        } catch (e: any) {
            console.error("Failed to fetch bio logs", e);
            setError(e.message || "فشل الاتصال بالخادم");
            // Keep old data on error if available
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 5000); // Polling every 5s
        return () => clearInterval(interval);
    }, []);

    // Helper to resolve device nickname
    const getDeviceName = (sn: string) => {
        const device = devices.find(d => d.serial_number === sn);
        return device?.device_name || sn; // If no name in DB, show SN
    };

    // Helper to resolve employee name (Priority: Direct DB Join > Synced User > System Exact > System Padded)
    const getEmployeeName = (userId: string, logName?: string) => {
        // Priority 0: Direct from Database (via simplified JOIN in PHP)
        if (logName) return logName;

        // Priority 1: Synced User from Device (Exact Match)
        const syncedUser = syncedUsers.find(u => u.user_id === userId);
        if (syncedUser && syncedUser.name) return syncedUser.name;

        // Priority 2: System Employee (Exact Match)
        if (employees[userId]) return employees[userId].name;

        // Priority 3: System Employee (Padded/Unpadded)
        const padded3 = userId.padStart(3, '0');
        if (employees[padded3]) return employees[padded3].name;

        const padded4 = userId.padStart(4, '0');
        if (employees[padded4]) return employees[padded4].name;

        const unpadded = parseInt(userId).toString();
        if (employees[unpadded]) return employees[unpadded].name;

        return 'موظف غير معرف';
    };

    const getStatusLabel = (log: DeviceLog) => {
        // Logic to determine Late/Regular based on time
        const timeStr = new Date((log.created_at || log.check_time) + ' UTC').toLocaleTimeString('en-US', { hour12: false });
        const startTime = settings?.workStartTime || '08:30:00';

        if (log.status === 0 || log.status === 4 || log.status === 5) { // CheckIn types
            if (timeStr > startTime) return { label: 'متأخر', color: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-900/30' };
            return { label: 'منتظم', color: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-900/30' };
        }
        return { label: '---', color: 'text-slate-400 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700' };
    };

    return (
        <div className="space-y-6 animate-fade-in pb-20">

            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                    <h2 className="text-2xl font-black text-slate-800 dark:text-white flex items-center gap-3">
                        <div className="p-3 bg-blue-500/10 rounded-2xl backdrop-blur-sm border border-blue-500/20 text-blue-600 dark:text-blue-400">
                            <Clock size={24} />
                        </div>
                        السجل الحي للبصمة
                    </h2>
                    <p className="text-slate-500 dark:text-slate-400 text-sm font-medium mt-2 mr-14">
                        مراقبة حية للحضور والانصراف - مزامنة الأسماء مفعلة
                    </p>
                </div>

                {/* Live Indicator */}
                <div className="flex items-center gap-4 bg-white dark:bg-slate-800 p-2 rounded-xl border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center gap-2 px-3">
                        <div className={`w-2.5 h-2.5 rounded-full ${error ? 'bg-red-500' : 'bg-emerald-500 animate-pulse'}`}></div>
                        <span className={`text-xs font-bold ${error ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                            {error ? 'خطأ في الاتصال' : 'متصل'}
                        </span>
                    </div>
                    <div className="w-px h-6 bg-slate-200 dark:bg-slate-700"></div>
                    <span className="text-[10px] font-mono text-slate-400 px-2">
                        Update: {lastUpdate.toLocaleTimeString('en-US', { hour12: false })}
                    </span>
                    {error && (
                        <button onClick={fetchData} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full text-slate-400">
                            <RefreshCw size={14} />
                        </button>
                    )}
                </div>
            </div>

            {/* Error Banner */}
            {error && (
                <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30 text-red-600 dark:text-red-400 p-4 rounded-xl flex items-center gap-3 text-sm font-bold">
                    <AlertTriangle size={18} />
                    {error}
                </div>
            )}

            {/* Devices Status Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {devices.map(device => (
                    <div key={device.serial_number} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex items-center justify-between shadow-sm">
                        <div className="flex items-center gap-3">
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${device.status === 'ONLINE' ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-500' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                                <Wifi size={20} />
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-800 dark:text-white text-sm">{device.device_name || 'جهاز بصمة'}</h3>
                                <p className="text-xs text-slate-400 font-mono">{device.serial_number}</p>
                            </div>
                        </div>
                        <div className={`px-2 py-1 rounded-lg text-[10px] font-bold ${device.status === 'ONLINE' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                            {new Date(device.last_activity + ' UTC').toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                    </div>
                ))}
            </div>

            {/* Live Logs Table */}
            <div className="bg-white/70 dark:bg-slate-900/70 backdrop-blur-3xl rounded-3xl border border-white/20 dark:border-slate-800 shadow-xl overflow-hidden min-h-[400px]">
                <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
                    <h3 className="font-bold text-slate-700 dark:text-slate-300">آخر الحركات المستلمة</h3>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-right border-collapse">
                        <thead>
                            <tr className="bg-slate-50/80 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 text-[11px] border-b border-slate-200 dark:border-slate-700 uppercase tracking-wider sticky top-0 bg-opacity-90 backdrop-blur">
                                <th className="p-4 font-bold">الموظف</th>
                                <th className="p-4 font-bold">التاريخ والوقت</th>
                                <th className="p-4 font-bold">نوع الحركة</th>
                                <th className="p-4 font-bold">المصدر</th>
                                <th className="p-4 font-bold">الحالة</th>
                                <th className="p-4 font-bold">الموقع / الجهاز</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50 text-sm">
                            {logs.map((log) => {
                                // Pass the direct DB name to the helper
                                const empName = getEmployeeName(log.user_id, (log as any).user_name);
                                const statusInfo = getStatusLabel(log);
                                const isNewUser = empName !== 'موظف غير معرف' && !employees[log.user_id] && !employees[parseInt(log.user_id)];

                                return (
                                    <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors animate-slide-in group">
                                        <td className="p-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-600 flex items-center justify-center text-xs font-black text-slate-400 dark:text-slate-400 shadow-inner group-hover:scale-110 transition-transform relative">
                                                    {empName.charAt(0)}
                                                    {isNewUser && <div className="absolute -bottom-1 -right-1 bg-blue-500 text-white rounded-full p-0.5"><UserPlus size={8} /></div>}
                                                </div>
                                                <div>
                                                    <div className="font-bold text-slate-800 dark:text-white group-hover:text-blue-500 transition-colors flex items-center gap-2">
                                                        {empName}
                                                    </div>
                                                    <div className="text-[10px] font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-500 w-fit mt-1">{log.user_id}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-4 text-slate-600 dark:text-slate-400" dir="ltr">
                                            <div className="flex flex-col items-end">
                                                <span className="font-mono text-sm font-bold text-slate-800 dark:text-white">
                                                    {new Date((log.created_at || log.check_time) + ' UTC').toLocaleTimeString('ar-SA-u-ca-gregory')}
                                                </span>
                                                <span className="text-[10px] text-slate-400 mt-0.5">
                                                    {new Date((log.created_at || log.check_time) + ' UTC').toLocaleDateString('ar-SA-u-ca-gregory')}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            {/* Full Status Mapping */}
                                            {(() => {
                                                switch (log.status) {
                                                    case 0: return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-bold border border-emerald-100 dark:border-emerald-500/20"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>دخول</span>;
                                                    case 1: return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 text-xs font-bold border border-rose-100 dark:border-rose-500/20"><span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>انصراف</span>;
                                                    case 2: return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-bold border border-amber-100 dark:border-amber-500/20"><span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>استراحة</span>;
                                                    case 3: return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-bold border border-blue-100 dark:border-blue-500/20"><span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>عودة</span>;
                                                    case 4: return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 text-xs font-bold border border-purple-100 dark:border-purple-500/20"><span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>إضافي دخول</span>;
                                                    case 5: return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-pink-50 dark:bg-pink-500/10 text-pink-600 dark:text-pink-400 text-xs font-bold border border-pink-100 dark:border-pink-500/20"><span className="w-1.5 h-1.5 rounded-full bg-pink-500"></span>إضافي خروج</span>;
                                                    default: return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-slate-500/10 text-slate-600 dark:text-slate-400 text-xs font-bold border border-slate-100 dark:border-slate-500/20">حركة ({log.status})</span>;
                                                }
                                            })()}
                                        </td>
                                        <td className="p-4">
                                            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
                                                {log.verify_mode === 1 ? 'بصمة إصبع' :
                                                    log.verify_mode === 15 ? 'بصمة وجه' :
                                                        log.verify_mode === 3 || log.verify_mode === 4 ? 'كلمة مرور' :
                                                            log.verify_mode === 25 ? 'راحة كف' :
                                                                'غير معروف'}
                                            </span>
                                        </td>
                                        <td className="p-4">
                                            <span className={`inline-block px-2 text-[10px] font-bold py-0.5 rounded border ${statusInfo.color}`}>
                                                {statusInfo.label}
                                            </span>
                                        </td>
                                        <td className="p-4 text-xs">
                                            <div className="font-bold text-slate-700 dark:text-slate-300">{getDeviceName(log.device_sn)}</div>
                                            {/* If device name is same as SN, show just one line */}
                                            {getDeviceName(log.device_sn) !== log.device_sn && (
                                                <div className="font-mono text-[10px] text-slate-400">{log.device_sn}</div>
                                            )}
                                        </td>
                                    </tr>
                                )
                            })}
                            {logs.length === 0 && !loading && (
                                <tr>
                                    <td colSpan={6} className="p-12 text-center">
                                        <div className="flex flex-col items-center justify-center opacity-50">
                                            <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4 text-slate-400">
                                                <WifiOff size={24} />
                                            </div>
                                            <p className="text-slate-500 dark:text-slate-400 font-medium">في انتظار وصول البيانات الحية...</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default LiveBiometricLogs;
