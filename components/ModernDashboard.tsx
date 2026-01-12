import React, { useMemo, useState } from 'react';
import {
    PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend,
    BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';
import { motion } from 'framer-motion';
import { Activity, Clock, Users, UserCheck, UserX, AlertCircle, Calendar, ArrowUpRight, ArrowDownRight, MoreHorizontal, Filter, Wifi, Radar, RefreshCw, CheckCircle, XCircle, Monitor, AlertTriangle } from 'lucide-react';
import { DashboardStats, AttendanceRecord, Device } from '../types';

interface ModernDashboardProps {
    stats: DashboardStats | null;
    logs: AttendanceRecord[];
    devices: Device[];
    loading: boolean;
    lastUpdatedAt: Date | null;
    onRefresh: () => void;
    onOpenStatsModal: (type: 'TOTAL' | 'PRESENT' | 'LATE' | 'ABSENT') => void;
    isDarkMode: boolean;
}

const COLORS = {
    present: '#10B981', // Emerald 500
    late: '#F59E0B',    // Amber 500
    absent: '#EF4444',  // Red 500
    total: '#3B82F6',   // Blue 500
    online: '#10B981',
    offline: '#94A3B8', // Slate 400
};

// Sub-component for Stat Cards (Glass)
const StatCard: React.FC<{
    title: string;
    value: number;
    icon: React.ReactNode;
    onClick: () => void;
}> = ({ title, value, icon, onClick }) => (
    <motion.button
        whileHover={{ y: -5 }}
        whileTap={{ scale: 0.98 }}
        onClick={onClick}
        className={`relative overflow-hidden rounded-3xl p-6 text-right group w-full liquid-glass transition-all hover:bg-white/10`}
    >
        <div className="relative z-10 flex flex-col items-start text-white">
            <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-white/20 rounded-xl text-white/80">
                    {icon}
                </div>
                <span className="text-sm font-medium text-white/90">{title}</span>
            </div>
            <span className="text-4xl font-extrabold tracking-tight text-white">{value}</span>
        </div>
    </motion.button>
);

const ModernDashboard: React.FC<ModernDashboardProps> = ({
    stats,
    logs,
    devices,
    loading,
    lastUpdatedAt,
    onRefresh,
    onOpenStatsModal,
    isDarkMode
}) => {

    // -- Analytical Data Prep --
    const attendanceData = useMemo(() => [
        { name: 'حضور', value: stats?.presentToday || 0, color: COLORS.present },
        { name: 'تأخير', value: stats?.lateToday || 0, color: COLORS.late },
        { name: 'غياب', value: stats?.onLeave || 0, color: COLORS.absent },
    ], [stats]);

    const [page, setPage] = useState(1);
    const pageSize = 5;
    const totalPages = Math.max(1, Math.ceil(logs.length / pageSize));
    const pageLogs = useMemo(() => {
        const start = (page - 1) * pageSize;
        const end = start + pageSize;
        return logs.slice(start, end);
    }, [logs, page]);

    // Animation variants
    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: {
                staggerChildren: 0.1
            }
        }
    };

    const itemVariants = {
        hidden: { y: 20, opacity: 0 },
        visible: { y: 0, opacity: 1 }
    };

    return (
        <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="space-y-6 pb-8"
        >
            {/* Header & Refresh */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
                <div>
                    <h1 className="text-2xl font-bold text-white bg-clip-text">
                        لوحة المراقبة والتحليلات
                    </h1>
                    <p className="text-slate-400 text-xs mt-1">
                        آخر تحديث: {lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleTimeString('ar-SA') : '--'}
                    </p>
                </div>
                <button
                    onClick={onRefresh}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-lg shadow-blue-500/30 transition-all active:scale-95"
                >
                    <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
                    <span>تحديث البيانات</span>
                </button>
            </div>

            {/* Primary Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    title="إجمالي الموظفين"
                    value={stats?.totalEmployees || 0}
                    icon={<Users className="w-6 h-6 text-blue-600 dark:text-slate-200" />}
                    onClick={() => onOpenStatsModal('TOTAL')}
                />
                <StatCard
                    title="حضور اليوم"
                    value={stats?.presentToday || 0}
                    icon={<CheckCircle className="w-6 h-6 text-emerald-600 dark:text-slate-200" />}
                    onClick={() => onOpenStatsModal('PRESENT')}
                />
                <StatCard
                    title="حالات التأخير"
                    value={stats?.lateToday || 0}
                    icon={<Clock className="w-6 h-6 text-amber-600 dark:text-slate-200" />}
                    onClick={() => onOpenStatsModal('LATE')}
                />
                <StatCard
                    title="غياب / إجازة"
                    value={stats?.onLeave || 0}
                    icon={<XCircle className="w-6 h-6 text-red-600 dark:text-slate-200" />}
                    onClick={() => onOpenStatsModal('ABSENT')}
                />
            </div>

            {/* Analytical Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* Attendance Breakdown Chart */}
                <motion.div variants={itemVariants} className="liquid-glass p-6 rounded-3xl relative overflow-hidden bg-slate-900/50 border border-slate-800/50">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-400 via-amber-400 to-red-400" />
                    <h3 className="font-bold text-lg text-white mb-6 flex items-center gap-2">
                        <Activity className="w-5 h-5 text-slate-400" />
                        تحليل الحضور
                    </h3>
                    <div className="h-[250px] w-full relative">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={attendanceData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="value"
                                    stroke="none"
                                    onClick={(e) => {
                                        const name = (e && (e as any).name) as string | undefined;
                                        if (!name) return;
                                        if (name === 'حضور') onOpenStatsModal('PRESENT');
                                        else if (name === 'تأخير') onOpenStatsModal('LATE');
                                        else if (name === 'غياب') onOpenStatsModal('ABSENT');
                                    }}
                                >
                                    {attendanceData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <RechartsTooltip
                                    contentStyle={{
                                        backgroundColor: '#1e293b',
                                        borderColor: '#334155',
                                        color: '#fff',
                                        borderRadius: '12px',
                                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
                                    }}
                                    itemStyle={{ color: '#fff' }}
                                />
                                <Legend verticalAlign="bottom" height={36} iconType="circle" />
                            </PieChart>
                        </ResponsiveContainer>
                        {/* Center Text Overlay */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-8">
                            <span className="text-3xl font-bold text-white">{stats?.presentToday || 0}</span>
                            <span className="text-xs text-slate-400">حاضر</span>
                        </div>
                    </div>
                </motion.div>



                {/* Recent Activity Table */}
                <motion.div variants={itemVariants} className="liquid-glass p-3 md:p-6 rounded-3xl flex flex-col relative overflow-hidden bg-slate-900/50 border border-slate-800/50">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-400 via-amber-400 to-red-400" />
                    <div className="flex items-center justify-between mb-4 md:mb-6">
                        <h3 className="font-bold text-base md:text-lg text-white flex items-center gap-2">
                            <Clock className="w-4 h-4 md:w-5 md:h-5 text-slate-400" />
                            آخر النشاطات
                        </h3>
                    </div>

                    <div className="overflow-x-auto">
                        {logs.length === 0 ? (
                            <div className="text-center text-slate-400 text-sm py-8">لا توجد نشاطات حديثة</div>
                        ) : (
                            <table className="w-full text-right border-collapse">
                                <thead className="border-b border-slate-700">
                                    <tr className="bg-slate-800/50 text-slate-400 text-[10px] md:text-xs">
                                        <th className="p-2 md:p-3 rounded-tl-lg rounded-bl-lg">الموظف</th>
                                        <th className="p-2 md:p-3">الجهاز</th>
                                        <th className="p-2 md:p-3">الوقت</th>
                                        <th className="p-2 md:p-3 rounded-tr-lg rounded-br-lg">النوع</th>
                                    </tr>
                                </thead>
                                <tbody className="text-sm">
                                    {pageLogs.map((log, i) => (
                                        <tr key={log.id || i} className="hover:bg-slate-800/30 border-b border-slate-800 transition-colors">
                                            <td className="p-2 md:p-3 font-bold text-white text-[10px] md:text-sm">{log.employeeName}</td>
                                            <td className="p-2 md:p-5">
                                                <span className="text-[10px] md:text-xs text-slate-400 truncate max-w-[100px] md:max-w-[200px] block" title={log.location?.address}>
                                                    {log.location?.address || log.deviceAlias || (
                                                        (log.deviceSn === 'Web' || log.deviceSn === 'Manual-Web') ? 'تطبيق الجوال' : (log.deviceSn || '-')
                                                    )}
                                                </span>
                                                {/* Accuracy Indicator */}
                                                {log.accuracy !== undefined && (
                                                    <div className="flex items-center gap-1 mt-1">
                                                        {log.accuracy < 20 ?
                                                            <Wifi size={10} className="text-emerald-500" /> :
                                                            <Radar size={10} className={log.accuracy > 50 ? "text-red-500 animate-pulse" : "text-amber-500"} />
                                                        }
                                                        <span className={`text-[9px] md:text-[10px] font-mono ${log.accuracy < 20 ? "text-emerald-500" :
                                                            log.accuracy > 50 ? "text-red-400 font-bold" : "text-amber-500"
                                                            }`}>
                                                            {log.accuracy}m
                                                        </span>
                                                    </div>
                                                )}
                                            </td>
                                            <td className="p-2 md:p-3 text-slate-400 font-mono text-[10px] md:text-xs" dir="ltr">{new Date(log.timestamp).toLocaleTimeString('ar-SA-u-ca-gregory')}</td>
                                            <td className="p-2 md:p-3">
                                                {(() => {
                                                    let label = 'غير معروف';
                                                    let color = 'bg-slate-500/20 text-slate-300 border border-slate-600/30';

                                                    switch (log.type) {
                                                        case 'CHECK_IN':
                                                            if (log.purpose && log.purpose.includes('غياب')) {
                                                                label = 'غياب';
                                                                color = 'bg-red-500/10 text-red-500 border border-red-500/20'; // Red for Absence
                                                            } else {
                                                                label = 'دخول';
                                                                color = 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
                                                            }
                                                            break;
                                                        case 'CHECK_OUT':
                                                            label = 'انصراف';
                                                            color = 'bg-rose-500/10 text-rose-400 border border-rose-500/20';
                                                            break;
                                                        case 'BREAK_IN':
                                                            label = 'عودة'; // Shortened for mobile
                                                            color = 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
                                                            break;
                                                        case 'BREAK_OUT':
                                                            label = 'استراحة'; // Shortened for mobile
                                                            color = 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
                                                            break;
                                                    }
                                                    return (
                                                        <div className="flex flex-col items-center gap-1">
                                                            <span className={`px-2 py-0.5 md:px-3 md:py-1 rounded-lg text-[10px] md:text-xs font-bold whitespace-nowrap ${color}`}>
                                                                {label}
                                                            </span>
                                                            {log.purpose && (
                                                                <span className="text-[9px] text-slate-400 max-w-[100px] truncate" title={log.purpose}>
                                                                    {log.purpose}
                                                                </span>
                                                            )}
                                                        </div>
                                                    );
                                                })()}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                        {logs.length > 0 && (
                            <div className="flex items-center justify-between mt-4 text-xs text-slate-400">
                                <span>صفحة {page} من {totalPages}</span>
                                <div className="flex items-center gap-2">
                                    <button
                                        className="px-2 py-1 rounded-lg border border-slate-700 hover:bg-slate-800 disabled:opacity-50 text-slate-300"
                                        onClick={() => setPage(p => Math.max(1, p - 1))}
                                        disabled={page === 1}
                                    >السابق</button>
                                    <button
                                        className="px-2 py-1 rounded-lg border border-slate-700 hover:bg-slate-800 disabled:opacity-50 text-slate-300"
                                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                        disabled={page === totalPages}
                                    >التالي</button>
                                </div>
                            </div>
                        )}
                    </div>
                </motion.div>

            </div>

            {/* Main Data Table Section */}
            <motion.div variants={itemVariants}>
                {/* We can incorporate the existing table here if needed, or keep passing children, 
             but typically the dashboard has its own summary table. 
             For now, we'll assume the main "Logs" view handles the full table, 
             and this dashboard focuses on "Analytics". 
             However, the user asked for a "Modern Dashboard" so we should probably 
             include a sleek version of the "Recent Movements" table here too or just leave it to the analytical parts.
          */}
            </motion.div>
        </motion.div>
    );
};

// Sub-component for Stat Cards (Glass)


export default ModernDashboard;
