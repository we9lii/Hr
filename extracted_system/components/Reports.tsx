import React, { useState, useMemo } from 'react';
import { AttendanceRecord } from '../types';
import { 
  Clock, 
  Download, 
  FileBarChart, 
  Calendar, 
  Filter, 
  TrendingUp, 
  AlertTriangle, 
  MapPin, 
  Briefcase
} from 'lucide-react';

interface ReportsProps {
  logs: AttendanceRecord[];
}

type ReportType = 'ALL' | 'LATE' | 'METHODS';

const Reports: React.FC<ReportsProps> = ({ logs }) => {
  const [reportType, setReportType] = useState<ReportType>('LATE');
  const [startDate, setStartDate] = useState<string>(
    new Date(new Date().setDate(1)).toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState<string>(
    new Date().toISOString().split('T')[0] 
  );

  const filteredData = useMemo(() => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999); 

    return logs.filter(log => {
      const logDate = new Date(log.timestamp);
      if (logDate < start || logDate > end) return false;

      if (reportType === 'LATE') {
        if (log.type !== 'CHECK_IN') return false;
        const h = logDate.getHours();
        const m = logDate.getMinutes();
        return h > 8 || (h === 8 && m > 0);
      }
      return true;
    });
  }, [logs, reportType, startDate, endDate]);

  const stats = useMemo(() => {
    let totalLateMinutes = 0;
    let methodCounts = { GPS: 0, FACE: 0, FINGERPRINT: 0, CARD: 0 };
    let uniqueEmployees = new Set();

    filteredData.forEach(log => {
      const date = new Date(log.timestamp);
      uniqueEmployees.add(log.employeeId);

      if (log.type === 'CHECK_IN') {
         const target = new Date(date);
         target.setHours(8, 0, 0, 0);
         if (date > target) {
             totalLateMinutes += Math.floor((date.getTime() - target.getTime()) / 60000);
         }
      }

      if (log.method === 'تطبيق جوال (GPS)') methodCounts.GPS++;
      else if (log.method === 'بصمة وجه') methodCounts.FACE++;
      else if (log.method === 'بصمة إصبع') methodCounts.FINGERPRINT++;
      else methodCounts.CARD++;
    });

    return {
        count: filteredData.length,
        employees: uniqueEmployees.size,
        totalLateMinutes,
        methodCounts
    };
  }, [filteredData]);

  const formatDuration = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h} س ${m} د` : `${m} دقيقة`;
  };

  const handleExport = () => {
    const headers = ['المعرف', 'الموظف', 'الوقت', 'النوع', 'الحالة', 'الملاحظات'];
    const rows = filteredData.map(log => [
        log.employeeId,
        log.employeeName,
        new Date(log.timestamp).toLocaleString('ar-SA'),
        log.type === 'CHECK_IN' ? 'دخول' : 'خروج',
        log.status,
        reportType === 'LATE' ? `تأخير ${formatDuration(Math.floor((new Date(log.timestamp).getTime() - new Date(log.timestamp).setHours(8,0,0))/60000))} ` : ''
    ]);

    const csvContent = "\uFEFF" + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `${reportType}_Report_${startDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="animate-fade-in space-y-6">
      
      <div className="bg-white dark:bg-[#1e293b] p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 transition-colors">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 border-b border-slate-100 dark:border-slate-800 pb-6">
            <div>
                <h2 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                    <div className="p-2 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-lg">
                        <FileBarChart size={24} />
                    </div>
                    مركز التقارير الذكي
                </h2>
                <p className="text-slate-500 dark:text-slate-400 text-sm mt-1 mr-12">تحليل وتصدير بيانات الحضور بدقة</p>
            </div>
            <button 
                onClick={handleExport}
                className="flex items-center gap-2 bg-emerald-600 text-white px-5 py-2.5 rounded-xl hover:bg-emerald-700 transition text-sm font-bold shadow-lg shadow-emerald-500/20 active:scale-95"
            >
                <Download size={18} />
                تصدير ملف CSV
            </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div className="col-span-2">
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wide">نوع التقرير</label>
                <div className="grid grid-cols-3 gap-2 bg-slate-50 dark:bg-slate-900 p-1.5 rounded-xl border border-slate-200 dark:border-slate-800">
                    <button 
                        onClick={() => setReportType('ALL')}
                        className={`px-3 py-2.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${reportType === 'ALL' ? 'bg-white dark:bg-slate-700 shadow-sm text-blue-600 dark:text-blue-300' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                    >
                        شامل
                    </button>
                    <button 
                        onClick={() => setReportType('LATE')}
                        className={`px-3 py-2.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${reportType === 'LATE' ? 'bg-white dark:bg-slate-700 shadow-sm text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                    >
                        <AlertTriangle size={14} />
                        التأخير
                    </button>
                    <button 
                        onClick={() => setReportType('METHODS')}
                        className={`px-3 py-2.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${reportType === 'METHODS' ? 'bg-white dark:bg-slate-700 shadow-sm text-purple-600 dark:text-purple-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                    >
                        المصادر
                    </button>
                </div>
            </div>

            <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wide">من تاريخ</label>
                <div className="relative group">
                    <Calendar className="absolute right-3 top-3 text-slate-400 w-4 h-4 group-hover:text-blue-500 transition-colors" />
                    <input 
                        type="date" 
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full pl-3 pr-10 py-2.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white rounded-xl focus:ring-2 focus:ring-blue-500/50 outline-none text-sm transition-shadow"
                    />
                </div>
            </div>
            <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wide">إلى تاريخ</label>
                <div className="relative group">
                    <Calendar className="absolute right-3 top-3 text-slate-400 w-4 h-4 group-hover:text-blue-500 transition-colors" />
                    <input 
                        type="date" 
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-full pl-3 pr-10 py-2.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white rounded-xl focus:ring-2 focus:ring-blue-500/50 outline-none text-sm transition-shadow"
                    />
                </div>
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
         {reportType === 'LATE' && (
             <>
                <StatCard title="إجمالي دقائق التأخير" value={formatDuration(stats.totalLateMinutes)} color="text-red-600 dark:text-red-400" icon={<Clock />} bg="bg-red-50 dark:bg-red-900/20" border="border-red-100 dark:border-red-900/30" />
                <StatCard title="عدد المتأخرين" value={`${stats.count} عملية`} color="text-slate-800 dark:text-white" icon={<AlertTriangle />} bg="bg-white dark:bg-[#1e293b]" border="border-slate-200 dark:border-slate-800" />
                <StatCard title="الموظفين المتأثرين" value={`${stats.employees} موظف`} color="text-slate-800 dark:text-white" icon={<Briefcase />} bg="bg-white dark:bg-[#1e293b]" border="border-slate-200 dark:border-slate-800" />
             </>
         )}
         {reportType === 'METHODS' && (
             <>
                <StatCard title="عن طريق GPS" value={stats.methodCounts.GPS} color="text-purple-600 dark:text-purple-400" icon={<MapPin />} bg="bg-purple-50 dark:bg-purple-900/20" border="border-purple-100 dark:border-purple-900/30" />
                <StatCard title="بصمة الوجه/الإصبع" value={stats.methodCounts.FACE + stats.methodCounts.FINGERPRINT} color="text-blue-600 dark:text-blue-400" icon={<Filter />} bg="bg-blue-50 dark:bg-blue-900/20" border="border-blue-100 dark:border-blue-900/30" />
                <StatCard title="إجمالي الحركات" value={stats.count} color="text-slate-800 dark:text-white" icon={<TrendingUp />} bg="bg-white dark:bg-[#1e293b]" border="border-slate-200 dark:border-slate-800" />
             </>
         )}
         {reportType === 'ALL' && (
             <>
                <StatCard title="إجمالي السجلات" value={stats.count} color="text-blue-600 dark:text-blue-400" icon={<FileBarChart />} bg="bg-blue-50 dark:bg-blue-900/20" border="border-blue-100 dark:border-blue-900/30" />
                <StatCard title="الحضور (GPS)" value={stats.methodCounts.GPS} color="text-slate-600 dark:text-slate-300" icon={<MapPin />} bg="bg-white dark:bg-[#1e293b]" border="border-slate-200 dark:border-slate-800" />
                <StatCard title="الحضور (أجهزة)" value={stats.methodCounts.FACE + stats.methodCounts.FINGERPRINT} color="text-slate-600 dark:text-slate-300" icon={<Briefcase />} bg="bg-white dark:bg-[#1e293b]" border="border-slate-200 dark:border-slate-800" />
             </>
         )}
      </div>

      <div className="bg-white dark:bg-[#1e293b] rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden min-h-[400px] transition-colors">
        <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
                <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs border-b border-slate-200 dark:border-slate-800 uppercase tracking-wider">
                        <th className="p-5 font-bold">الموظف</th>
                        <th className="p-5 font-bold">التاريخ والوقت</th>
                        <th className="p-5 font-bold">النوع</th>
                        <th className="p-5 font-bold">المصدر</th>
                        <th className="p-5 font-bold">
                            {reportType === 'LATE' ? 'مدة التأخير' : 'الموقع / الملاحظات'}
                        </th>
                    </tr>
                </thead>
                <tbody className="text-sm divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredData.length === 0 ? (
                        <tr>
                            <td colSpan={5} className="p-12 text-center text-slate-400">
                                <Filter size={32} className="mx-auto mb-2 opacity-30" />
                                لا توجد بيانات مطابقة للفلاتر المحددة.
                            </td>
                        </tr>
                    ) : (
                        filteredData.map((log, idx) => {
                            const date = new Date(log.timestamp);
                            let dynamicCell = <span className="text-slate-300 dark:text-slate-600">-</span>;
                            
                            if (reportType === 'LATE') {
                                const target = new Date(date); target.setHours(8,0,0,0);
                                const diff = Math.floor((date.getTime() - target.getTime())/60000);
                                dynamicCell = <span className="font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded text-xs">+{formatDuration(diff)}</span>;
                            } else {
                                dynamicCell = <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">{log.location?.address || log.location ? `${log.location?.lat.toFixed(3)}...` : 'موقع الجهاز'}</span>
                            }

                            return (
                                <tr key={log.id || idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                                    <td className="p-5">
                                        <div className="font-bold text-slate-800 dark:text-white">{log.employeeName}</div>
                                        <div className="text-xs text-slate-400 dark:text-slate-500 font-mono mt-0.5">{log.employeeId}</div>
                                    </td>
                                    <td className="p-5 text-slate-600 dark:text-slate-400" dir="ltr">
                                        <span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-300">{date.toLocaleTimeString('ar-SA-u-ca-gregory')}</span>
                                        <br/>
                                        <span className="text-[10px] text-slate-400">{date.toLocaleDateString('ar-SA-u-ca-gregory')}</span>
                                    </td>
                                    <td className="p-5">
                                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${log.type === 'CHECK_IN' ? 'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400'}`}>
                                            {log.type === 'CHECK_IN' ? 'دخول' : 'خروج'}
                                        </span>
                                    </td>
                                    <td className="p-5 text-slate-500 dark:text-slate-400 text-xs font-medium">{log.method}</td>
                                    <td className="p-5">
                                        {dynamicCell}
                                    </td>
                                </tr>
                            )
                        })
                    )}
                </tbody>
            </table>
        </div>
      </div>
    </div>
  );
};

const StatCard = ({ title, value, color, icon, bg, border }: any) => (
    <div className={`${bg} p-4 rounded-2xl border ${border} flex items-center gap-4 transition-all hover:shadow-md group`}>
        <div className={`p-3 rounded-xl bg-white dark:bg-slate-800 shadow-sm ${color} group-hover:scale-110 transition-transform`}>
            {React.cloneElement(icon, { size: 24 })}
        </div>
        <div>
            <p className="text-slate-500 dark:text-slate-400 text-xs font-bold mb-0.5">{title}</p>
            <h3 className={`text-xl font-extrabold ${color}`}>{value}</h3>
        </div>
    </div>
);

export default Reports;