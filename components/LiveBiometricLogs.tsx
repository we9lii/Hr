import React, { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { Clock, CheckCircle, Wifi, Users, AlertTriangle, WifiOff, RefreshCw, UserPlus } from 'lucide-react';
import { API_CONFIG, fetchAttendanceLogsRange } from '../services/api';
import { AttendanceRecord } from '../types';
import { getDeviceConfig } from '../config/shifts';

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
    const [logs, setLogs] = useState<AttendanceRecord[]>([]);
    const [devices, setDevices] = useState<DeviceStatus[]>([]);
    const [syncedUsers, setSyncedUsers] = useState<BiometricUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
    const [error, setError] = useState<string | null>(null);

    const fetchData = async () => {
        try {
            setError(null);
            // 1. Fetch Devices & Users (Keep using efficient PHP endpoint for status)
            const apiUrl = Capacitor.isNativePlatform()
                ? 'https://qssun.solar/api/biometric_stats.php'
                : '/biometric_api/biometric_stats.php';

            const res = await fetch(apiUrl);
            if (res.ok) {
                const data = await res.json();
                if (data.status !== 'error') {
                    if (data.devices) setDevices(data.devices);
                    if (data.users) setSyncedUsers(data.users);
                }
            }

            // 2. Fetch Unified Logs (Includes Manual Absences & Correct Merging)
            const startOfDay = new Date('2024-01-01'); // Fetch all history from 2024
            const endOfDay = new Date();     // Until Now

            // Filter specifically for the filtered Device
            const unifiedLogs = await fetchAttendanceLogsRange(startOfDay, endOfDay, undefined, 'AF4C232560143');

            // Sort by time DESC
            const sorted = unifiedLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            setLogs(sorted);

            setLastUpdate(new Date());
        } catch (e: any) {
            console.error("Failed to fetch bio logs", e);
            setError("جاري إعادة الاتصال...");
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
    const getDeviceName = (sn: string, alias?: string) => {
        if (alias && alias !== 'Manual Entry') return alias; // Use alias from Unified Log if meaningful

        // Priority 1: DB Name (from Devices table)
        const device = devices.find(d => d.serial_number === sn);
        if (device?.device_name) return device.device_name;

        // Priority 2: Config Name (from shifts.ts)
        const config = getDeviceConfig({ sn });
        if (config.alias && config.alias !== `جهاز ${sn}`) return config.alias;

        return alias || sn;
    };

    return (
        <div className="space-y-6 animate-fade-in pb-20">

            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                    <h2 className="text-2xl font-black text-white flex items-center gap-3">
                        <div className="p-3 bg-blue-500/10 rounded-2xl backdrop-blur-sm border border-blue-500/20 text-blue-400">
                            <Clock size={24} />
                        </div>
                        السجل الحي للبصمة
                    </h2>
                    <p className="text-slate-400 text-sm font-medium mt-2 mr-14">
                        مراقبة حية للحضور والانصراف - مزامنة الأسماء مفعلة
                    </p>
                </div>

                {/* Live Indicator */}
                <div className="flex items-center gap-4 bg-slate-800 p-2 rounded-xl border border-slate-700">
                    <div className="flex items-center gap-2 px-3">
                        <div className={`w-2.5 h-2.5 rounded-full ${error ? 'bg-amber-500' : 'bg-emerald-500 animate-pulse'}`}></div>
                        <span className={`text-xs font-bold ${error ? 'text-amber-500' : 'text-emerald-400'}`}>
                            {error ? 'إعادة طلب...' : 'متصل'}
                        </span>
                    </div>
                    <div className="w-px h-6 bg-slate-700"></div>
                    <span className="text-[10px] font-mono text-slate-400 px-2">
                        Update: {lastUpdate.toLocaleTimeString('en-US', { hour12: false })}
                    </span>
                    {error && (
                        <button onClick={fetchData} className="p-1 hover:bg-slate-700 rounded-full text-slate-400">
                            <RefreshCw size={14} />
                        </button>
                    )}
                </div>
            </div>

            {/* Devices Status Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {devices.map(device => (
                    <div key={device.serial_number} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between shadow-sm">
                        <div className="flex items-center gap-3">
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${device.status === 'ONLINE' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-800 text-slate-400'}`}>
                                <Wifi size={20} />
                            </div>
                            <div>
                                <h3 className="font-bold text-white text-sm">{device.device_name || 'جهاز بصمة'}</h3>
                                <p className="text-xs text-slate-400 font-mono">{device.serial_number}</p>
                            </div>
                        </div>
                        <div className={`px-2 py-1 rounded-lg text-[10px] font-bold ${device.status === 'ONLINE' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'}`}>
                            {new Date(device.last_activity + ' UTC').toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                    </div>
                ))}
            </div>

            {/* Live Logs Table */}
            <div className="bg-slate-900/40 backdrop-blur-xl rounded-[32px] border border-slate-800/60 shadow-2xl overflow-hidden min-h-[500px] flex flex-col">
                <div className="p-6 border-b border-slate-800/60 flex justify-between items-center bg-gradient-to-r from-slate-900/50 to-slate-800/50">
                    <div className="flex items-center gap-3">
                        <div className="w-1.5 h-6 bg-blue-500 rounded-full shadow-[0_0_10px_rgba(59,130,246,0.5)]"></div>
                        <h3 className="font-bold text-white tracking-wide">جهاز تجربة ( فيصل )</h3>
                    </div>
                    <span className="text-xs font-mono text-slate-500 bg-slate-900/50 px-3 py-1.5 rounded-lg border border-slate-800">
                        Total: {logs.length}
                    </span>
                </div>

                <div className="overflow-x-auto flex-1 custom-scrollbar">
                    <table className="w-full text-right border-collapse">
                        <thead>
                            <tr className="bg-slate-900/80 text-slate-400 text-[11px] border-b border-slate-800 uppercase tracking-wider sticky top-0 backdrop-blur-md z-10 shadow-sm">
                                <th className="p-5 font-bold">الموظف</th>
                                <th className="p-5 font-bold">الوقت</th>
                                <th className="p-5 font-bold">الحالة</th>
                                <th className="p-5 font-bold">الموقع / الجهاز</th>
                                <th className="p-5 font-bold">التحقق</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/30 text-sm">
                            {logs.map((log, idx) => {
                                // Absence Check
                                const isAbsence = log.purpose && log.purpose.includes('غياب');
                                const timeObj = new Date(log.timestamp);

                                return (
                                    <tr key={`${log.id}-${idx}`} className="hover:bg-blue-500/5 transition-all duration-300 group hover:shadow-[inset_2px_0_0_0_#3b82f6]">
                                        <td className="p-5">
                                            <div className="flex items-center gap-4">
                                                <div className="relative">
                                                    <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center text-sm font-black text-slate-400 shadow-inner border border-slate-700/50 group-hover:scale-105 transition-transform group-hover:border-blue-500/30 group-hover:shadow-[0_0_15px_rgba(59,130,246,0.2)]">
                                                        {log.employeeName ? log.employeeName.charAt(0) : '?'}
                                                    </div>
                                                    {log.status === 'LATE' && !isAbsence && (
                                                        <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-amber-500 border-2 border-slate-900 flex items-center justify-center" title="تأخير">
                                                            <span className="w-1.5 h-1.5 bg-white rounded-full animate-ping-slow"></span>
                                                        </div>
                                                    )}
                                                </div>
                                                <div>
                                                    <div className="font-bold text-slate-200 group-hover:text-blue-400 transition-colors flex items-center gap-2 text-[15px]">
                                                        {log.employeeName}
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <div className="text-[10px] font-mono bg-slate-800/80 px-1.5 py-0.5 rounded text-slate-500 border border-slate-700/50">{log.employeeId}</div>
                                                        {isAbsence && <span className="text-[10px] bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded border border-red-500/20">غياب</span>}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-5" dir="ltr">
                                            <div className="flex flex-col items-end">
                                                <span className="font-mono text-[15px] font-bold text-white tracking-tight group-hover:text-blue-200 transition-colors">
                                                    {timeObj.toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                                <span className="text-[10px] text-slate-500 font-mono">
                                                    {timeObj.toLocaleDateString('en-GB')}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="p-5">
                                            {isAbsence ? (
                                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-500/10 text-red-500 text-xs font-bold border border-red-500/20 shadow-[0_0_10px_rgba(239,68,68,0.1)]">
                                                    <AlertTriangle size={14} />
                                                    غياب مسجل
                                                </span>
                                            ) : (
                                                <div className="flex flex-col items-start gap-1">
                                                    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border shadow-[0_0_10px_rgba(0,0,0,0.1)] ${log.type === 'CHECK_IN' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]' :
                                                        log.type === 'CHECK_OUT' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20 shadow-[0_0_10px_rgba(244,63,94,0.1)]' :
                                                            'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                                        }`}>
                                                        {log.type === 'CHECK_IN' && <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></div>}
                                                        {log.type === 'CHECK_IN' ? 'تسجيل دخول' : log.type === 'CHECK_OUT' ? 'تسجيل خروج' : 'حركة'}
                                                    </span>
                                                    {log.status === 'LATE' && log.type === 'CHECK_IN' && (
                                                        <span className="text-[10px] text-amber-500 font-bold px-1">⚠️ متأخر</span>
                                                    )}
                                                </div>
                                            )}
                                        </td>
                                        <td className="p-5 text-xs text-slate-400">
                                            {isAbsence ? (
                                                <div className="flex flex-col gap-1">
                                                    <span className="text-slate-300 font-medium italic">"{log.purpose}"</span>
                                                    <span className="text-[10px] opacity-60 flex items-center gap-1"><Users size={10} /> بواسطة المسؤول</span>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col gap-1">
                                                    <span className="text-white font-bold flex items-center gap-1.5">
                                                        {log.deviceSn?.includes('Mobile') || log.deviceAlias?.includes('تطبيق') ? <Smartphone size={14} className="text-blue-400" /> : <Wifi size={14} className="text-purple-400" />}
                                                        {getDeviceName(log.deviceSn || '', log.deviceAlias)}
                                                    </span>
                                                    <span className="text-[10px] font-mono opacity-50 bg-black/20 w-fit px-1.5 rounded">{log.deviceSn}</span>
                                                </div>
                                            )}
                                        </td>
                                        <td className="p-5 text-xs font-mono">
                                            {isAbsence ? (
                                                <span className="text-slate-600">MANUAL</span>
                                            ) : (
                                                <span className={`px-2 py-1 rounded-lg border ${log.deviceSn?.includes('Mobile') ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' : 'bg-purple-500/10 border-purple-500/20 text-purple-400'}`}>
                                                    {log.deviceSn?.includes('Mobile') ? 'APP' : 'BIO'}
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                )
                            })}
                            {logs.length === 0 && !loading && (
                                <tr>
                                    <td colSpan={6} className="p-24 text-center">
                                        <div className="flex flex-col items-center justify-center">
                                            <div className="w-24 h-24 bg-slate-800/50 rounded-full flex items-center justify-center mb-6 text-slate-600 ring-1 ring-slate-700/50">
                                                <WifiOff size={40} strokeWidth={1.5} />
                                            </div>
                                            <h3 className="text-xl font-bold text-slate-300 mb-2">لا توجد حركات اليوم</h3>
                                            <p className="text-slate-500 text-sm max-w-xs mx-auto leading-relaxed">
                                                لم يتم تسجيل أي بصمات أو حركات دخول/خروج لهذا اليوم حتى الآن.
                                            </p>
                                            <button onClick={fetchData} className="mt-6 px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-bold transition-all border border-slate-700 shadow-lg active:scale-95 flex items-center gap-2">
                                                <RefreshCw size={16} />
                                                تحديث البيانات
                                            </button>
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
