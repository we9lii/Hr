import React, { useState, useMemo, useEffect } from 'react';
import { AttendanceRecord, Device } from '../types';
import { fetchDeviceEmployees, fetchAttendanceLogsRange } from '../services/api';
import { Download, AlertTriangle, Clock, MapPin, Filter, Briefcase, FileBarChart, Calendar, TrendingUp, X } from 'lucide-react';
import { getDeviceConfig } from '../config/shifts';

interface ReportsProps {
  logs: AttendanceRecord[];
  devices?: Device[];
}

type ReportType = 'ALL' | 'LATE' | 'METHODS';

const Reports: React.FC<ReportsProps> = ({ logs, devices = [] }) => {
  const [reportType, setReportType] = useState<ReportType>('LATE');
  const [deviceSn, setDeviceSn] = useState<string>('');
  const [deviceEmployees, setDeviceEmployees] = useState<{ empCode: string; empName: string }[]>([]);
  const [startDate, setStartDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [rangeLogs, setRangeLogs] = useState<AttendanceRecord[]>([]);
  const [rangeLoading, setRangeLoading] = useState(false);
  const [reportPage, setReportPage] = useState(1);
  const [summaryPage, setSummaryPage] = useState(1);

  // Export Modal State
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportConfig, setExportConfig] = useState({
    type: 'DETAILED', // 'DETAILED' | 'SUMMARY'
    format: 'XLS',    // 'XLS' | 'CSV'
    start: new Date().toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });

  // Update export config when filtered range changes
  useEffect(() => {
    setExportConfig(prev => ({ ...prev, start: startDate, end: endDate }));
  }, [startDate, endDate]);

  // Helper to calculate delay based on device shifts or default
  const calculateDelay = (log: AttendanceRecord) => {
    if (log.type !== 'CHECK_IN' || log.status !== 'LATE') return 0;

    // Resolve config from Code (Static Rules)
    const deviceConfig = getDeviceConfig({
      sn: log.deviceSn || 'UNKNOWN_SN',
      alias: log.deviceAlias
    });

    const shifts = deviceConfig.shifts;
    if (!shifts || shifts.length === 0) {
      // Default fallback if no shifts in config (unlikely given DEFAULT_SHIFTS)
      const defaultStart = new Date(log.timestamp);
      defaultStart.setHours(8, 0, 0, 0);
      const diff = new Date(log.timestamp).getTime() - defaultStart.getTime();
      return Math.max(0, Math.floor(diff / 60000));
    }

    const checkInTime = new Date(log.timestamp);

    // Find closest shift start time
    let minDiff = Infinity;
    let lateMinutes = 0;

    shifts.forEach(shift => {
      const [h, m] = shift.start.split(':').map(Number);
      const shiftStart = new Date(log.timestamp);
      shiftStart.setHours(h, m, 0, 0);

      const diff = Math.abs(checkInTime.getTime() - shiftStart.getTime());

      // If this shift is closer than previous best match
      if (diff < minDiff) {
        minDiff = diff;
        const actualLate = checkInTime.getTime() - shiftStart.getTime();
        lateMinutes = Math.max(0, Math.floor(actualLate / 60000));
      }
    });

    return lateMinutes;
  };

  const filteredData = useMemo(() => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    const base = rangeLogs.length > 0 ? rangeLogs : logs;
    return base.filter(log => {
      const logDate = new Date(log.timestamp);
      if (logDate < start || logDate > end) return false;
      if (deviceSn && log.deviceSn !== deviceSn) return false;

      if (reportType === 'LATE') {
        return calculateDelay(log) > 0;
      }
      return true;
    });
  }, [logs, reportType, startDate, endDate, deviceSn, rangeLogs, devices]); // Added 'devices' dep

  useEffect(() => {
    const load = async () => {
      if (!deviceSn) { setDeviceEmployees([]); return; }
      try {
        const emps = await fetchDeviceEmployees(deviceSn);
        setDeviceEmployees(emps);
      } catch { }
    };
    load();
  }, [deviceSn]);

  useEffect(() => {
    const run = async () => {
      try {
        setRangeLoading(true);
        const s = new Date(startDate);
        const e = new Date(endDate);
        e.setHours(23, 59, 59, 999);
        const data = await fetchAttendanceLogsRange(s, e);
        setRangeLogs(data);
      } finally {
        setRangeLoading(false);
      }
    };
    run();
  }, [startDate, endDate]);

  useEffect(() => {
    setReportPage(1);
    setSummaryPage(1);
  }, [reportType, deviceSn, startDate, endDate]);

  const reportSorted = useMemo(() => {
    return [...filteredData].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [filteredData]);
  const reportTotalPages = useMemo(() => Math.max(1, Math.ceil(reportSorted.length / 10)), [reportSorted]);
  const reportPageData = useMemo(() => {
    const start = (reportPage - 1) * 10;
    return reportSorted.slice(start, start + 10);
  }, [reportSorted, reportPage]);

  const stats = useMemo(() => {
    let totalLateMinutes = 0;
    let methodCounts = { GPS: 0, FACE: 0, FINGERPRINT: 0, CARD: 0 };
    let uniqueEmployees = new Set();

    filteredData.forEach(log => {
      uniqueEmployees.add(log.employeeId);

      if (log.type === 'CHECK_IN') {
        totalLateMinutes += calculateDelay(log);
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
  }, [filteredData, devices]); // Added devices dep

  const lateSummary = useMemo(() => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    const byEmpDay = new Map<string, { firstCheckIn: Date; name: string; fullLog: AttendanceRecord }>(); // Store full log for context
    logs.forEach(log => {
      const d = new Date(log.timestamp);
      if (d < start || d > end) return;
      if (deviceSn && log.deviceSn !== deviceSn) return;
      if (log.type !== 'CHECK_IN') return;
      const key = `${log.employeeId}__${d.toDateString()}`;
      const prev = byEmpDay.get(key);
      if (!prev || d.getTime() < prev.firstCheckIn.getTime()) {
        byEmpDay.set(key, { firstCheckIn: d, name: log.employeeName, fullLog: log });
      }
    });
    const byEmpTotal = new Map<string, { name: string; totalMinutes: number; daysLate: number }>();
    byEmpDay.forEach((val, key) => {
      const [empId] = key.split('__');

      const lateMins = calculateDelay(val.fullLog);

      const prev = byEmpTotal.get(empId);
      if (!prev) {
        byEmpTotal.set(empId, { name: val.name, totalMinutes: lateMins, daysLate: lateMins > 0 ? 1 : 0 });
      } else {
        prev.totalMinutes += lateMins;
        prev.daysLate += lateMins > 0 ? 1 : 0;
      }
    });
    const rows = Array.from(byEmpTotal.entries()).map(([id, v]) => ({ id, name: v.name, totalMinutes: v.totalMinutes, daysLate: v.daysLate }))
      .sort((a, b) => b.totalMinutes - a.totalMinutes);
    return rows;
  }, [logs, startDate, endDate, deviceSn, devices]);

  const summaryTotalPages = useMemo(() => Math.max(1, Math.ceil(lateSummary.length / 10)), [lateSummary]);
  const summaryPageData = useMemo(() => {
    const start = (summaryPage - 1) * 10;
    return lateSummary.slice(start, start + 10);
  }, [lateSummary, summaryPage]);

  const formatDuration = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h} س ${m} د` : `${m} دقيقة`;
  };

  const handleExportSubmit = async () => {
    const { type, format, start, end } = exportConfig;

    // 1. Fetch Data
    const s = new Date(start);
    const e = new Date(end);
    e.setHours(23, 59, 59, 999);

    let dataForExport: AttendanceRecord[] = [];
    try {
      dataForExport = await fetchAttendanceLogsRange(s, e);
    } catch {
      dataForExport = logs;
    }

    // Filter by Device/Date
    const filteredRaw = dataForExport.filter(log => {
      const logDate = new Date(log.timestamp);
      if (logDate < s || logDate > e) return false;
      if (deviceSn && log.deviceSn !== deviceSn) return false;
      return true;
    });

    // 2. Process Data into Daily Records (Base for both reports)
    // Map key: "EmpID__DateString"
    const dailyMap = new Map<string, {
      empId: string;
      empName: string;
      date: string;
      displayDate: string;
      firstIn: Date | null;
      lastOut: Date | null;
      dailyDelay: number;
    }>();

    filteredRaw.forEach(log => {
      const d = new Date(log.timestamp);
      const key = `${log.employeeId}__${d.toDateString()}`;

      let record = dailyMap.get(key);
      if (!record) {
        record = {
          empId: log.employeeId,
          empName: log.employeeName,
          date: d.toISOString().split('T')[0],
          displayDate: d.toLocaleDateString('ar-SA'),
          firstIn: null,
          lastOut: null,
          dailyDelay: 0
        };
        dailyMap.set(key, record);
      } // No 'logs' array needed for export, saving memory

      if (log.type === 'CHECK_IN') {
        if (!record.firstIn || d < record.firstIn) record.firstIn = d;
        record.dailyDelay += calculateDelay(log);
      } else if (log.type === 'CHECK_OUT') {
        if (!record.lastOut || d > record.lastOut) record.lastOut = d;
      }
    });

    // 3. Generate Output Helper
    const generateHTML = (header: string, body: string, title: string) => `
        <!DOCTYPE html>
        <html dir="rtl">
        <head>
            <meta charset="UTF-8">
            <style>
                body { direction: rtl; font-family: 'Tajawal', 'Segoe UI', sans-serif; font-size: 12pt; }
                table { border-collapse: collapse; width: 100%; direction: rtl; margin-top: 20px; }
                thead tr { background-color: #4f46e5; color: white; }
                th { border: 1px solid #94a3b8; padding: 12px; text-align: center; font-weight: bold; background-color: #4f46e5; color: white; }
                td { border: 1px solid #cbd5e1; padding: 10px; text-align: center; color: #1e293b; }
                .missing-out { background-color: #fca5a5 !important; color: #7f1d1d; font-weight: bold; }
                .header-info { margin-bottom: 20px; font-weight: bold; font-size: 14pt; }
            </style>
        </head>
        <body>
            <div class="header-info">${title}<br>الفترة: من ${start} إلى ${end}</div>
            <table><thead>${header}</thead><tbody>${body}</tbody></table>
        </body>
        </html>`;

    if (type === 'DETAILED') {
      // --- DAILY REPORT ---
      const rows = Array.from(dailyMap.values()).sort((a, b) => b.date.localeCompare(a.date));

      if (format === 'XLS') {
        const header = `<tr><th>المعرف</th><th>الموظف</th><th>التاريخ</th><th>وقت الحضور</th><th>وقت الانصراف</th><th>التأخير</th><th>الحالة</th></tr>`;
        const body = rows.map(r => {
          const isMissingOut = r.firstIn && !r.lastOut;
          const timeIn = r.firstIn ? r.firstIn.toLocaleTimeString('ar-SA') : '--';
          // Only highlight the CELL for timeOut
          const timeOutCell = isMissingOut
            ? `<td class="missing-out">لم يسجل</td>`
            : `<td>${r.lastOut ? r.lastOut.toLocaleTimeString('ar-SA') : '--'}</td>`;

          const status = isMissingOut ? 'لم يسجل خروج' : (r.dailyDelay > 0 ? 'تأخير' : 'مكتمل');

          return `<tr>
                    <td>${r.empId}</td>
                    <td>${r.empName}</td>
                    <td>${r.displayDate}</td>
                    <td>${timeIn}</td>
                    ${timeOutCell}
                    <td>${r.dailyDelay > 0 ? formatDuration(r.dailyDelay) : '-'}</td>
                    <td>${status}</td>
                </tr>`;
        }).join('');

        downloadFile(generateHTML(header, body, 'تقرير الحضور اليومي التفصيلي'), `Daily_Report_${start}.xls`, 'application/vnd.ms-excel');
      } else {
        // CSV
        const h = ['المعرف', 'الموظف', 'التاريخ', 'وقت الحضور', 'وقت الانصراف', 'التأخير', 'الحالة'];
        const r = rows.map(row => [
          row.empId,
          row.empName,
          row.displayDate,
          row.firstIn ? row.firstIn.toLocaleTimeString('ar-SA') : '--',
          row.lastOut ? row.lastOut.toLocaleTimeString('ar-SA') : 'لم يسجل',
          row.dailyDelay > 0 ? formatDuration(row.dailyDelay) : '0',
          (row.firstIn && !row.lastOut) ? 'لم يسجل خروج' : 'مكتمل'
        ]);
        downloadCSV(h, r, `Daily_Report_${start}.csv`);
      }

    } else {
      // --- TOTAL SUMMARY REPORT (Aggregated by Employee) ---
      const empMap = new Map<string, { name: string, totalDelay: number, daysLate: number, missingOutCount: number }>();

      dailyMap.forEach(day => {
        let e = empMap.get(day.empId);
        if (!e) {
          e = { name: day.empName, totalDelay: 0, daysLate: 0, missingOutCount: 0 };
          empMap.set(day.empId, e);
        }
        e.totalDelay += day.dailyDelay;
        if (day.dailyDelay > 0) e.daysLate++;
        if (day.firstIn && !day.lastOut) e.missingOutCount++;
      });

      const rows = Array.from(empMap.entries()).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.totalDelay - a.totalDelay);

      if (format === 'XLS') {
        const header = `<tr><th>المعرف</th><th>الموظف</th><th>إجمالي مدة التأخير</th><th>أيام التأخير</th><th>حالات عدم تسجيل خروج</th></tr>`;
        const body = rows.map(r => `<tr>
                <td>${r.id}</td>
                <td>${r.name}</td>
                <td>${formatDuration(r.totalDelay)}</td>
                <td>${r.daysLate}</td>
                <td>${r.missingOutCount}</td>
            </tr>`).join('');
        downloadFile(generateHTML(header, body, 'تقرير التأخير التجميعي'), `Summary_Report_${start}.xls`, 'application/vnd.ms-excel');
      } else {
        // CSV
        const h = ['المعرف', 'الموظف', 'إجمالي مدة التأخير', 'أيام التأخير', 'حالات عدم تسجيل خروج'];
        const r = rows.map(r => [r.id, r.name, formatDuration(r.totalDelay), String(r.daysLate), String(r.missingOutCount)]);
        downloadCSV(h, r, `Summary_Report_${start}.csv`);
      }
    }

    setExportModalOpen(false);
  };

  const downloadFile = (content: string, fileName: string, mimeType: string) => {
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8;` });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadCSV = (headers: string[], rows: string[][], fileName: string) => {
    const csvContent = "\uFEFF" + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    downloadFile(csvContent, fileName, 'text/csv');
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
          <div className="flex items-center gap-2">
            <button
              onClick={() => setExportModalOpen(true)}
              className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-xl hover:bg-blue-700 transition text-sm font-bold shadow-lg shadow-blue-500/20 active:scale-95"
            >
              <Download size={18} />
              تصدير البيانات
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
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
          <div>
            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wide">الجهاز</label>
            <select
              value={deviceSn}
              onChange={(e) => setDeviceSn(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white rounded-xl focus:ring-2 focus:ring-blue-500/50 outline-none text-sm"
            >
              <option value="">الكل</option>
              {devices.map(d => (
                <option key={d.sn} value={d.sn}>{d.alias || d.sn}</option>
              ))}
            </select>
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
        {deviceSn && (
          <div className="p-4 border-b border-slate-100 dark:border-slate-800">
            <div className="text-sm font-bold mb-2">الموظفون المسجلون على الجهاز المختار</div>
            {deviceEmployees.length === 0 ? (
              <div className="text-xs text-slate-400">لا توجد بيانات</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {deviceEmployees.map(e => (
                  <span key={e.empCode} className="px-2 py-1 bg-slate-50 dark:bg-slate-800 rounded-lg text-xs border border-slate-200 dark:border-slate-700">{e.empCode} • {e.empName}</span>
                ))}
              </div>
            )}
          </div>
        )}
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
              {rangeLoading ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-slate-400">جارِ تحميل بيانات الفترة المحددة...</td>
                </tr>
              ) : filteredData.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-slate-400">
                    <Filter size={32} className="mx-auto mb-2 opacity-30" />
                    لا توجد بيانات مطابقة للفلاتر المحددة.
                  </td>
                </tr>
              ) : (
                <>
                  {reportPageData.map((log, idx) => (
                    <tr key={log.id || idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                      <td className="p-5">
                        <div className="font-bold text-slate-800 dark:text-white">{log.employeeName}</div>
                        <div className="text-xs text-slate-400 dark:text-slate-500 font-mono mt-0.5">{log.employeeId}</div>
                      </td>
                      <td className="p-5 text-slate-600 dark:text-slate-400" dir="ltr">
                        <span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-300">{new Date(log.timestamp).toLocaleTimeString('ar-SA-u-ca-gregory')}</span>
                        <br />
                        <span className="text-[10px] text-slate-400">{new Date(log.timestamp).toLocaleDateString('ar-SA-u-ca-gregory')}</span>
                      </td>
                      <td className="p-5">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${log.type === 'CHECK_IN' ? 'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400'}`}>
                          {log.type === 'CHECK_IN' ? 'دخول' : 'خروج'}
                        </span>
                      </td>
                      <td className="p-5 text-slate-500 dark:text-slate-400 text-xs font-medium">{log.method}</td>
                      <td className="p-5">
                        {reportType === 'LATE' ? (
                          <span className="font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded text-xs">+{formatDuration(calculateDelay(log))}</span>
                        ) : (
                          <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                            {log.location?.address ? log.location.address : log.location ? `${log.location.lat.toFixed(3)},${log.location.lng.toFixed(3)}` : 'موقع الجهاز'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={5} className="p-4">
                      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                        <span>عرض 10 لكل صفحة</span>
                        <div className="flex items-center gap-2">
                          <button onClick={() => setReportPage(p => Math.max(1, p - 1))} disabled={reportPage <= 1} className={`px-3 py-1 rounded-lg border ${reportPage <= 1 ? 'opacity-50 cursor-not-allowed' : ''} bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700`}>السابق</button>
                          <span>صفحة {reportPage} من {reportTotalPages}</span>
                          <button onClick={() => setReportPage(p => Math.min(reportTotalPages, p + 1))} disabled={reportPage >= reportTotalPages} className={`px-3 py-1 rounded-lg border ${reportPage >= reportTotalPages ? 'opacity-50 cursor-not-allowed' : ''} bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700`}>التالي</button>
                        </div>
                      </div>
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white dark:bg-[#1e293b] p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 transition-colors">
        <div className="text-lg font-bold mb-4 text-slate-800 dark:text-white">تقرير تجميعي: إجمالي التأخير حسب الموظف</div>
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs border-b border-slate-200 dark:border-slate-800">
                <th className="p-4">المعرف</th>
                <th className="p-4">الموظف</th>
                <th className="p-4">إجمالي التأخير</th>
                <th className="p-4">أيام التأخير</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {lateSummary.length === 0 ? (
                <tr><td colSpan={4} className="p-8 text-center text-slate-400">لا توجد بيانات في الفترة المحددة</td></tr>
              ) : (
                <>
                  {summaryPageData.map(r => (
                    <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                      <td className="p-4 text-slate-400 font-mono text-xs">{r.id}</td>
                      <td className="p-4 font-bold text-slate-800 dark:text-white">{r.name}</td>
                      <td className="p-4 text-slate-600 dark:text-slate-400">{formatDuration(r.totalMinutes)}</td>
                      <td className="p-4 text-slate-600 dark:text-slate-400">{r.daysLate}</td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={4} className="p-3">
                      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                        <span>عرض 10 لكل صفحة</span>
                        <div className="flex items-center gap-2">
                          <button onClick={() => setSummaryPage(p => Math.max(1, p - 1))} disabled={summaryPage <= 1} className={`px-3 py-1 rounded-lg border ${summaryPage <= 1 ? 'opacity-50 cursor-not-allowed' : ''} bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700`}>السابق</button>
                          <span>صفحة {summaryPage} من {summaryTotalPages}</span>
                          <button onClick={() => setSummaryPage(p => Math.min(summaryTotalPages, p + 1))} disabled={summaryPage >= summaryTotalPages} className={`px-3 py-1 rounded-lg border ${summaryPage >= summaryTotalPages ? 'opacity-50 cursor-not-allowed' : ''} bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700`}>التالي</button>
                        </div>
                      </div>
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>


      {/* Export Modal */}
      {
        exportModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setExportModalOpen(false)} />
            <div className="relative bg-white dark:bg-[#1e293b] rounded-2xl shadow-xl w-full max-w-md animate-fade-in border border-slate-200 dark:border-slate-700">
              <div className="p-5 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                <h3 className="font-bold text-lg text-slate-800 dark:text-white">خيارات التصدير</h3>
                <button onClick={() => setExportModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                  <X size={20} />
                </button>
              </div>
              <div className="p-6 space-y-6">

                {/* Type Selection */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-3">نوع البيانات</label>
                  <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl">
                    <button
                      onClick={() => setExportConfig(c => ({ ...c, type: 'DETAILED' }))}
                      className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${exportConfig.type === 'DETAILED' ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}
                    >
                      سجلات مفصلة
                    </button>
                    <button
                      onClick={() => setExportConfig(c => ({ ...c, type: 'SUMMARY' }))}
                      className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${exportConfig.type === 'SUMMARY' ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}
                    >
                      ملخص التأخير
                    </button>
                  </div>
                </div>

                {/* Date Range */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-2">من</label>
                    <input
                      type="date"
                      value={exportConfig.start}
                      onChange={(e) => setExportConfig(c => ({ ...c, start: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-blue-500 outline-none dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-2">إلى</label>
                    <input
                      type="date"
                      value={exportConfig.end}
                      onChange={(e) => setExportConfig(c => ({ ...c, end: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-blue-500 outline-none dark:text-white"
                    />
                  </div>
                </div>

                {/* Format Selection */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-3">الصيغة</label>
                  <div className="flex w-full gap-3">
                    <label className="flex items-center gap-2 cursor-pointer border border-slate-200 dark:border-slate-700 p-3 rounded-xl flex-1 hover:bg-slate-50 dark:hover:bg-slate-800 transition">
                      <input type="radio" name="format" checked={exportConfig.format === 'XLS'} onChange={() => setExportConfig(c => ({ ...c, format: 'XLS' }))} className="accent-blue-600 w-4 h-4" />
                      <span className="text-sm font-bold text-slate-700 dark:text-slate-300">Excel (XLS)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer border border-slate-200 dark:border-slate-700 p-3 rounded-xl flex-1 hover:bg-slate-50 dark:hover:bg-slate-800 transition">
                      <input type="radio" name="format" checked={exportConfig.format === 'CSV'} onChange={() => setExportConfig(c => ({ ...c, format: 'CSV' }))} className="accent-blue-600 w-4 h-4" />
                      <span className="text-sm font-bold text-slate-700 dark:text-slate-300">CSV</span>
                    </label>
                  </div>
                </div>

              </div>
              <div className="p-5 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-3">
                <button
                  onClick={() => setExportModalOpen(false)}
                  className="px-4 py-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 text-sm font-bold"
                >
                  إلغاء
                </button>
                <button
                  onClick={handleExportSubmit}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold shadow-lg shadow-blue-500/20 active:scale-95"
                >
                  تنزيل الملف
                </button>
              </div>
            </div>
          </div>
        )
      }
    </div >
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
