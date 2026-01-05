import React, { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { Clock, CheckCircle, Wifi, Users, AlertTriangle } from 'lucide-react';
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

const LiveBiometricLogs: React.FC = () => {
    const [logs, setLogs] = useState<DeviceLog[]>([]);
    const [devices, setDevices] = useState<DeviceStatus[]>([]);
    const [loading, setLoading] = useState(true);
    const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

    const fetchData = async () => {
        try {
            // We will need a new API endpoint for this: /api/biometric/dashboard.php
            // For now, I'll mock the fetch or assume the endpoint exists
            // Determine API URL based on platform
            const apiUrl = Capacitor.isNativePlatform()
                ? 'https://qssun.solar/api/biometric_stats.php'
                : '/biometric_api/biometric_stats.php';

            const res = await fetch(apiUrl);
            const data = await res.json();

            if (data.logs) setLogs(data.logs);
            if (data.devices) setDevices(data.devices);
            setLastUpdate(new Date());
        } catch (e) {
            console.error("Failed to fetch bio logs", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 5000); // Polling every 5s
        return () => clearInterval(interval);
    }, []);

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
                        مراقبة حية للحضور والانصراف من أجهزة ZKTeco
                    </p>
                </div>

                {/* Live Indicator */}
                <div className="flex items-center gap-4 bg-white dark:bg-slate-800 p-2 rounded-xl border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center gap-2 px-3">
                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></div>
                        <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">متصل</span>
                    </div>
                    <div className="w-px h-6 bg-slate-200 dark:bg-slate-700"></div>
                    <span className="text-[10px] font-mono text-slate-400 px-2">
                        Update: {lastUpdate.toLocaleTimeString('en-US', { hour12: false })}
                    </span>
                </div>
            </div>

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
                            {device.status}
                        </div>
                    </div>
                ))}
                {devices.length === 0 && !loading && (
                    <div className="col-span-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/30 rounded-2xl p-4 text-center text-amber-600 dark:text-amber-400 text-sm">
                        لا توجد أجهزة متصلة حالياً. تأكد من إعدادات ADMS في الجهاز.
                    </div>
                )}
            </div>

            {/* Live Logs Table */}
            <div className="bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl rounded-3xl border border-white/20 dark:border-slate-800 shadow-xl overflow-hidden">
                <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                    <h3 className="font-bold text-slate-700 dark:text-slate-300">آخر الحركات المستلمة</h3>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-right">
                        <thead className="bg-slate-50/50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-[11px] uppercase tracking-wider">
                            <tr>
                                <th className="p-4">الموظف (ID)</th>
                                <th className="p-4">الوقت</th>
                                <th className="p-4">الحالة</th>
                                <th className="p-4">الجهاز</th>
                                <th className="p-4">طريقة التحقق</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50 text-sm">
                            {logs.map((log) => (
                                <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors animate-slide-in">
                                    <td className="p-4 font-bold text-slate-800 dark:text-white font-mono">{log.user_id}</td>
                                    <td className="p-4 text-slate-600 dark:text-slate-400" dir="ltr">{log.check_time}</td>
                                    <td className="p-4">
                                        <span className="px-2 py-1 rounded-md bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-xs font-bold">
                                            {/* Simplified Status Mapping */}
                                            {log.status === 0 ? 'دخول' : log.status === 1 ? 'خروج' : 'حركة'}
                                        </span>
                                    </td>
                                    <td className="p-4 text-xs text-slate-400 font-mono">{log.device_sn}</td>
                                    <td className="p-4 text-xs text-slate-400">
                                        {log.verify_mode === 1 ? 'بصمة' : log.verify_mode === 15 ? 'وجه' : 'أخرى'}
                                    </td>
                                </tr>
                            ))}
                            {logs.length === 0 && !loading && (
                                <tr>
                                    <td colSpan={5} className="p-8 text-center text-slate-400 text-sm">
                                        في انتظار وصول البيانات...
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
