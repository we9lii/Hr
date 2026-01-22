import React, { useState, useMemo, useEffect } from 'react';
import { AttendanceRecord, Device, AttendanceMethod } from '../types';
import { fetchDeviceEmployees, fetchAttendanceLogsRange, fetchBridgeLogsRange, fetchLegacyLogsRange, submitManualAttendance, fetchAllEmployees, uploadProof, deleteManualLog } from '../services/api';
import { Download, AlertTriangle, Clock, MapPin, Filter, Briefcase, FileBarChart, Calendar, TrendingUp, X, UserPlus, Printer, Search, Check, Paperclip, Trash2 } from 'lucide-react';
import { getDeviceConfig } from '../config/shifts';

interface ReportsProps {
  logs: AttendanceRecord[];
  devices?: Device[];
}

type ReportType = 'ALL' | 'LATE' | 'METHODS' | 'DAILY' | 'MANUAL';

// StatCard Component
const StatCard = ({ title, value, color, icon, bg, border }: any) => (
  <div className={`${bg} p-5 rounded-3xl border ${border} flex items-center gap-5 transition-all hover:scale-[1.02] hover:shadow-2xl group cursor-default relative overflow-hidden`}>
    <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-white/5 to-transparent rounded-bl-full pointer-events-none" />
    <div className={`p-4 rounded-2xl bg-slate-800 shadow-sm ${color} group-hover:scale-110 transition-transform duration-300 relative z-10`}>
      {React.cloneElement(icon, { size: 28 })}
    </div>
    <div className="relative z-10">
      <p className="text-slate-400 text-xs font-bold mb-1 tracking-wide uppercase">{title}</p>
      <h3 className={`text-2xl font-black ${color} tracking-tight`}>{value}</h3>
    </div>
  </div>
);

const Reports: React.FC<ReportsProps> = ({ logs, devices = [] }) => {
  const [reportType, setReportType] = useState<ReportType>('LATE');
  const [deviceSn, setDeviceSn] = useState<string>('');
  const [deviceEmployees, setDeviceEmployees] = useState<{ empCode: string; empName: string }[]>([]);
  const [allEmployees, setAllEmployees] = useState<{ code: string; name: string }[]>([]);
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

  // Manual Entry State
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [isBulk, setIsBulk] = useState(false);
  const [manualForm, setManualForm] = useState({
    empCode: '',
    date: new Date().toISOString().split('T')[0],
    time: '08:00',
    type: 'CHECK_IN' as 'CHECK_IN' | 'CHECK_OUT',
    endDate: new Date().toISOString().split('T')[0],
    startTime: '08:00',
    endTime: '16:00',
    includeWeekends: false,
    note: '',
    file: null as File | null
  });
  const [manualSubmitting, setManualSubmitting] = useState(false);

  // Export Modal State
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportConfig, setExportConfig] = useState({
    type: 'DETAILED', // 'DETAILED' | 'SUMMARY'
    format: 'XLS',    // 'XLS' | 'CSV'
    start: new Date().toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0],
    employeeId: ''
  });

  const [selectedEmployee, setSelectedEmployee] = useState<string>('');

  // Print Modal State
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [printConfig, setPrintConfig] = useState({
    start: new Date().toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0],
    employeeIds: [] as string[], // Empty = ALL result
    deviceSn: 'ALL'
  });

  // Print Modal UI State
  const [printEmpSearch, setPrintEmpSearch] = useState('');
  const [printAvailableEmployees, setPrintAvailableEmployees] = useState<{ code: string; name: string }[]>([]);

  // Always show ALL employees in the list, regardless of Device Selection
  useEffect(() => {
    setPrintAvailableEmployees(allEmployees);
  }, [allEmployees]);

  // Load All Employees on Mount
  useEffect(() => {
    fetchAllEmployees().then(setAllEmployees).catch(e => console.error("Failed to load employees", e));
  }, []);

  // Handle Manual Submit
  const handleManualSubmit = async () => {
    if (!manualForm.empCode) return alert("يرجى اختيار موظف");
    setManualSubmitting(true);
    try {
      let finalNote = manualForm.note;

      // Upload File if selected
      if (manualForm.file) {
        try {
          const url = await uploadProof(manualForm.file);
          finalNote += ` [مرفق: ${url}]`;
        } catch (e) {
          if (!confirm("فشل رفع المرفق، هل تريد المتابعة بدونه؟")) {
            setManualSubmitting(false);
            return;
          }
        }
      }

      if (isBulk) {
        // Bulk Logic
        const start = new Date(manualForm.date);
        const end = new Date(manualForm.endDate);
        let count = 0;

        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          // Weekend Check (Fri=5, Sat=6)
          if (!manualForm.includeWeekends && (d.getDay() === 5 || d.getDay() === 6)) continue;

          // Check In
          const [hOn, mOn] = manualForm.startTime.split(':').map(Number);
          const timeOn = new Date(d);
          timeOn.setHours(hOn, mOn, 0, 0);

          // Check Out
          const [hOff, mOff] = manualForm.endTime.split(':').map(Number);
          const timeOff = new Date(d);
          timeOff.setHours(hOff, mOff, 0, 0);

          await submitManualAttendance(manualForm.empCode, timeOn, 'CHECK_IN', finalNote);
          await submitManualAttendance(manualForm.empCode, timeOff, 'CHECK_OUT', finalNote);
          count++;
        }
        alert(`تم تسجيل الحضور لـ ${count} أيام عمل بنجاح`);

      } else {
        // Single Logic
        const [y, m, d] = manualForm.date.split('-').map(Number);
        const [hh, mm] = manualForm.time.split(':').map(Number);
        const timestamp = new Date(y, m - 1, d, hh, mm);

        await submitManualAttendance(manualForm.empCode, timestamp, manualForm.type, finalNote);
        alert("تم تسجيل الحركة بنجاح");
      }

      setManualModalOpen(false);

      // Reset Form partially
      setManualForm(prev => ({ ...prev, note: '', file: null }));

      // Refresh Data
      setRangeLoading(true);
      const s = new Date(startDate);
      const e = new Date(endDate);
      e.setHours(23, 59, 59, 999);
      const data = await fetchAttendanceLogsRange(s, e);
      setRangeLogs(data);
      setRangeLoading(false);

    } catch (error) {
      alert("فشل في تسجيل الحركة: " + error);
    } finally {
      setManualSubmitting(false);
    }
  };

  const handleDeleteLog = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا السجل؟')) return;
    const success = await deleteManualLog(id);
    if (success) {
      alert('تم الحذف بنجاح');
      // Refresh Data
      setRangeLoading(true);
      const s = new Date(startDate);
      const e = new Date(endDate);
      e.setHours(23, 59, 59, 999);
      const data = await fetchAttendanceLogsRange(s, e);
      setRangeLogs(data);
      setRangeLoading(false);
    } else {
      alert('فشل الحذف. تأكد أن السجل يدوي.');
    }
  };

  const handlePrintDelayReport = async () => {
    // 0. Pre-open window
    const printWindow = window.open('', '_blank');
    if (!printWindow) return alert("السماح بالنوافذ المنبثقة مطلوب");

    printWindow.document.write(`
        <div style="font-family: sans-serif; text-align: center; padding: 50px; direction: rtl;">
            <h3>جارِ تحضير التقرير...</h3>
            <p>يرجى الانتظار بينما يتم جلب البيانات ومطابقة الورديات...</p>
        </div>
    `);

    // 1. Fetch Data (Client-side filtering for accuracy)
    const s = new Date(printConfig.start);
    const e = new Date(printConfig.end);
    e.setHours(23, 59, 59, 999);

    let reportLogs = [];
    try {
      // Revert to fetching all logs to ensure we have OUT punches for finding Overtime
      reportLogs = await fetchAttendanceLogsRange(s, e);
    } catch (err) {
      printWindow.close();
      alert("فشل جلب البيانات");
      return;
    }

    // 2. Filter Client-Side - STRICTLY for Employee specific, but INCLUDE ALL DEVICES to ensure we catch Check-In/Check-Out pairs across different gates.
    const filtered = reportLogs.filter(log => {
      // Logic Update: Multi-Select Support
      const selectedIds = printConfig.employeeIds || [];
      // Empty array means ALL. specific IDs means filter.
      if (selectedIds.length > 0 && !selectedIds.includes(log.employeeId)) return false;
      return true;
    });

    // 3. Group Logs by Employee & Day (Robust Grouping)
    const groups = new Map<string, AttendanceRecord[]>();
    filtered.forEach(log => {
      const d = new Date(log.timestamp);
      const dayKey = d.toDateString();
      const key = `${log.employeeId}|${dayKey}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)?.push(log);
    });

    // 4. Process Logic (Flexible Hours with Split Shift Support)
    const empStats = new Map();

    groups.forEach((dayLogs, key) => {
      // CRITICAL FIX: Sort logs ASCENDING (Oldest First) to ensure 'firstIn' is actually the FIRST punch
      // Otherwise, since API returns DESC, 'firstIn' finds the LAST punch, causing massive delay calculations.
      dayLogs.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

      const [empId] = key.split('|');
      const firstIn = dayLogs.find(l => l.type === 'CHECK_IN');
      if (!firstIn) return; // Need at least one Check-In

      // Init Stat
      if (!empStats.has(empId)) {
        empStats.set(empId, {
          name: dayLogs[0].employeeName,
          totalLate: 0,
          lateCount: 0,
          matchedDevice: printConfig.deviceSn === 'ALL' // Default true if All
        });
      }
      const stat = empStats.get(empId);

      // Check if this day had any punch from the selected device
      if (printConfig.deviceSn !== 'ALL' && !stat.matchedDevice) {
        if (dayLogs.some(l => l.deviceSn === printConfig.deviceSn)) {
          stat.matchedDevice = true;
        }
      }

      const deviceConfig = getDeviceConfig({
        sn: firstIn.deviceSn || 'UNKNOWN',
        alias: firstIn.deviceAlias
      }, firstIn.timestamp);
      const shifts = deviceConfig.shifts || [];
      const shiftType = deviceConfig.shiftType || 'SPLIT';

      let dailyTotalLate = 0;
      let dailyTotalOvertime = 0;

      if (shifts.length === 0) {
        // Fallback
        dailyTotalLate = calculateDelay(firstIn);
      } else if (shiftType === 'ALTERNATING') {
        // SMART RECOGNITION (Alternating)
        const checkInTime = firstIn ? new Date(firstIn.timestamp) : new Date(dayLogs[0].timestamp);
        const checkInHour = checkInTime.getHours();
        let targetShift = shifts[0];
        if (shifts.length > 1 && checkInHour >= 13) targetShift = shifts[1];

        const [sh, sm] = targetShift.start.split(':').map(Number);
        const [eh, em] = targetShift.end.split(':').map(Number);

        // Delay
        const shiftStart = new Date(firstIn.timestamp);
        shiftStart.setHours(sh, sm, 0, 0);
        if (checkInTime > shiftStart) {
          dailyTotalLate = Math.floor((checkInTime.getTime() - shiftStart.getTime()) / 60000);
        }

        // Overtime
        const lastOut = [...dayLogs].reverse().find(l => l.type === 'CHECK_OUT');
        if (lastOut) {
          const shiftEnd = new Date(lastOut.timestamp);
          shiftEnd.setHours(eh, em, 0, 0);
          if (eh < sh) shiftEnd.setDate(shiftEnd.getDate() + 1); // Midnight Cross
          const outTime = new Date(lastOut.timestamp);
          if (outTime > shiftEnd) {
            dailyTotalOvertime = Math.floor((outTime.getTime() - shiftEnd.getTime()) / 60000);
          }
        }

      } else {
        const sortedShifts = [...shifts].sort((a, b) => parseInt(a.start) - parseInt(b.start));

        sortedShifts.forEach((shift, index) => {
          // Define Time Window
          const [sh, sm] = shift.start.split(':').map(Number);
          const [eh, em] = shift.end.split(':').map(Number);
          let windowStart = 0;
          let windowEnd = 24;

          if (sortedShifts.length > 1) {
            if (index === 0) {
              const nextShift = sortedShifts[index + 1];
              const [nsh, nsm] = nextShift.start.split(':').map(Number);
              windowEnd = (eh + nsh) / 2;
            } else {
              const prevShift = sortedShifts[index - 1];
              const [peh, pem] = prevShift.end.split(':').map(Number);
              windowStart = (peh + sh) / 2;
            }
          }

          // Filter logs for this shift session
          const sessionLogs = dayLogs.filter(l => {
            const h = new Date(l.timestamp).getHours();
            return h >= windowStart && h < windowEnd;
          });

          if (sessionLogs.length > 0) {
            const shiftIn = sessionLogs.find(l => l.type === 'CHECK_IN');
            const shiftOut = [...sessionLogs].reverse().find(l => l.type === 'CHECK_OUT');

            // Delay
            if (shiftIn) {
              const shiftStart = new Date(shiftIn.timestamp);
              shiftStart.setHours(sh, sm, 0, 0);
              const inTime = new Date(shiftIn.timestamp);
              if (inTime > shiftStart) {
                dailyTotalLate += Math.floor((inTime.getTime() - shiftStart.getTime()) / 60000);
              }
            }

            // Overtime
            if (shiftOut) {
              const shiftEnd = new Date(shiftOut.timestamp);
              shiftEnd.setHours(eh, em, 0, 0);
              if (eh < sh) shiftEnd.setDate(shiftEnd.getDate() + 1); // Midnight Cross

              const outTime = new Date(shiftOut.timestamp);
              if (outTime > shiftEnd) {
                dailyTotalOvertime += Math.floor((outTime.getTime() - shiftEnd.getTime()) / 60000);
              }
            }
          }
        });
      }

      // Net Calculation
      const netDelay = Math.max(0, dailyTotalLate - dailyTotalOvertime);

      if (netDelay > 0) {
        stat.totalLate += netDelay;
        stat.lateCount += 1;
      }
    });

    // Filter out employees with 0 Total Late AND respect Device Filter
    const lateEmployees = Array.from(empStats.values()).filter(s => {
      if (s.totalLate <= 0) return false;
      if (printConfig.deviceSn !== 'ALL' && !s.matchedDevice) return false;
      return true;
    });

    // Sort by most late
    lateEmployees.sort((a, b) => b.totalLate - a.totalLate);

    // 5. Generate HTML
    const rows = lateEmployees.map(stat => `
        <tr class="border-b border-gray-200">
            <td class="p-3 text-right font-bold">${stat.name}</td>
            <td class="p-3 text-center">${stat.lateCount}</td>
            <td class="p-3 text-center font-mono" dir="ltr">${Math.floor(stat.totalLate / 60)}h ${stat.totalLate % 60}m</td>
            <td class="p-3 text-center text-red-600 font-bold">${stat.totalLate} دقيقة</td>
        </tr>
    `).join('');

    const html = `
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
            <title>تقرير التأخير - QSSUN HR</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700;900&display=swap');
                body { font-family: 'Tajawal', sans-serif; background: white; }
                @media print {
                    .no-print { display: none; }
                    body { -webkit-print-color-adjust: exact; }
                    table { page-break-inside: auto; }
                    tr { page-break-inside: avoid; page-break-after: auto; }
                    thead { display: table-header-group; }
                    tfoot { display: table-footer-group; }
                }
            </style>
        </head>
        <body class="p-8">
            <div class="max-w-4xl mx-auto border-4 border-double border-slate-800 p-8 min-h-[90vh] relative">
                
                <!-- Header -->
                <div class="flex justify-between items-center mb-8 border-b-2 border-slate-800 pb-4">
                     <div>
                        <h1 class="text-3xl font-black text-slate-900 mb-2">تقرير التأخيرات (الصافي)</h1>
                        <p class="text-slate-600 font-bold">من ${printConfig.start} إلى ${printConfig.end}</p>
                     </div>
                     <div class="text-left">
                        <h2 class="text-xl font-bold text-slate-800">QSSUN ENERGY</h2>
                        <p class="text-sm text-slate-500">نظام الموارد البشرية</p>
                     </div>
                </div>

                <!-- Stats Summary -->
                <div class="grid grid-cols-3 gap-4 mb-8">
                    <div class="bg-gray-50 border border-gray-200 p-4 rounded-xl text-center">
                        <p class="text-xs font-bold text-gray-500 mb-1">الموظفين المتأخرين</p>
                        <p class="text-2xl font-black text-slate-800">${empStats.size}</p>
                    </div>
                    <div class="bg-gray-50 border border-gray-200 p-4 rounded-xl text-center">
                         <p class="text-xs font-bold text-gray-500 mb-1">صافي التأخير (بالدقائق)</p>
                        <p class="text-2xl font-black text-red-600">${Array.from(empStats.values()).reduce((a, b) => a + b.totalLate, 0)}</p>
                    </div>
                    <div class="bg-gray-50 border border-gray-200 p-4 rounded-xl text-center">
                        <p class="text-xs font-bold text-gray-500 mb-1">تاريخ التقرير</p>
                        <p class="text-lg font-bold text-slate-800">${new Date().toLocaleDateString('ar-SA')}</p>
                    </div>
                </div>

                <!-- Alert -->
                <div class="mb-6 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-info"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                    <span><strong>ملاحظة:</strong> يتم خصم دقائق العمل الإضافي (بعد نهاية الدوام) من دقائق التأخير الصباحي تلقائياً في هذا التقرير.</span>
                </div>

                <!-- Table -->
                <table class="w-full text-sm">
                    <thead>
                        <tr class="bg-slate-900 text-white">
                            <th class="p-3 text-right rounded-r-lg">الموظف</th>
                            <th class="p-3 text-center">أيام التأخير</th>
                            <th class="p-3 text-center">المدة (ساعات)</th>
                            <th class="p-3 text-center rounded-l-lg">صافي الدقائق</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>

                <!-- Footer -->
                <div class="absolute bottom-4 left-0 w-full text-center text-xs text-gray-400 font-mono">
                    Generated by QSSUN HR System • ${new Date().toLocaleString()}
                </div>
            </div>
            <script>
                setTimeout(() => { window.print(); }, 500);
            </script>
        </body>
        </html>
    `;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    setPrintModalOpen(false);
  };

  // ... rest of UseEffects ...

  // ... calculateDelay ...

  // ... filteredData ...

  // UI render...
  // (We need to inject the button and modal below)

  // Re-inserting the previous render logic but skipping to the button area for brevity in replacement?
  // No, I must be precise with StartLine/EndLine or Replace a block.
  // I will replace the imports and state declarations first (lines 3-36).

  // Wait, I can't split the file easily if I'm adding state.
  // Best strategy: Replace lines 3-36 with imports + new state + handleManualSubmit.
  // Then I will need strict context for the button insertion in a second call.


  // Update export config when filtered range changes
  useEffect(() => {
    setExportConfig(prev => ({ ...prev, start: startDate, end: endDate, employeeId: selectedEmployee }));
  }, [startDate, endDate, selectedEmployee]);

  // Helper to calculate delay based on device shifts or default
  // Optimized to minimize Date object creation
  const calculateDelay = (log: AttendanceRecord) => {
    if (log.type !== 'CHECK_IN') return 0;
    // Absences (even if marked as CHECK_IN status) should not count as Late Delay
    if (log.purpose && log.purpose.includes('غياب')) return 0;

    // Resolve config from Code (Static Rules)
    const deviceConfig = getDeviceConfig({
      sn: log.deviceSn || 'UNKNOWN_SN',
      alias: log.deviceAlias
    }, log.timestamp);

    const checkInTime = new Date(log.timestamp);
    const shifts = deviceConfig.shifts;

    // Default fallback (8:00 AM strict)
    if (!shifts || shifts.length === 0) {
      const defaultStart = new Date(log.timestamp); // Clone date
      defaultStart.setHours(8, 0, 0, 0);
      // Fast path: if before 8 AM
      if (checkInTime < defaultStart) return 0;
      return Math.floor((checkInTime.getTime() - defaultStart.getTime()) / 60000);
    }

    const checkInHour = checkInTime.getHours();

    // Find Closest Shift Start (Robust for any schedule)
    let targetShift = shifts[0];
    let minDiff = Infinity;

    for (const shift of shifts) {
      const [h, m] = shift.start.split(':').map(Number);
      const sStart = new Date(log.timestamp);
      sStart.setHours(h, m, 0, 0);

      const diff = Math.abs(checkInTime.getTime() - sStart.getTime());
      if (diff < minDiff) {
        minDiff = diff;
        targetShift = shift;
      }
    }

    // Calculate Delay against Target Shift
    let [h, m] = targetShift.start.split(':').map(Number);

    const shiftStart = new Date(log.timestamp); // Clone date
    shiftStart.setHours(h, m, 0, 0);

    const checkInMs = checkInTime.getTime();
    const startMs = shiftStart.getTime();

    if (checkInMs <= startMs) return 0;

    // Strict Diff: 
    // 08:00:00 start
    // 08:00:59 check-in -> diff 59000 -> 59000/60000 = 0.98 -> floor = 0 (On Time)
    // 08:01:00 check-in -> diff 60000 -> 60000/60000 = 1.0 -> floor = 1 (Late)
    return Math.floor((checkInMs - startMs) / 60000);
  };

  const filteredData = useMemo(() => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    const base = rangeLogs.length > 0 ? rangeLogs : logs;
    const startTime = start.getTime();
    const endTime = end.getTime();

    return base.filter(log => {
      // Opt: Reduce object allocation by parsing string directly
      const t = Date.parse(log.timestamp);
      if (t < startTime || t > endTime) return false;
      if (deviceSn && log.deviceSn !== deviceSn) return false;
      if (selectedEmployee && log.employeeId !== selectedEmployee) return false;

      if (reportType === 'LATE') {
        // calculateDelay now optimized
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
        setRangeLogs([]); // Clear old data

        const s = new Date(startDate);
        const e = new Date(endDate);
        e.setHours(23, 59, 59, 999);

        // FIX 4093: Build a Dynamic Normalization Map for ALL employees
        // This maps National IDs (or other alt IDs) -> System IDs
        const normalizationMap = new Map<string, { code: string; name: string }>();
        const nameMap = new Map<string, string>(); // Name -> Code

        (allEmployees as any[]).forEach(emp => {
          const mainId = String(emp.code);
          const mainName = String(emp.name).trim();

          if (!mainId) return;

          // 1. Map IDs
          const alts = [emp.national_id, emp.ssn, emp.identity_num, emp.identification_number, emp.other_id, emp.card_number].filter(Boolean);
          alts.forEach(alt => {
            normalizationMap.set(String(alt), { code: mainId, name: mainName });
          });

          // 2. Map Name (Fallback)
          if (mainName) {
            nameMap.set(mainName.toLowerCase(), mainId);
          }
        });

        // Add Manual Override for known issues
        normalizationMap.set('275', { code: '2562020083', name: 'Abdullah ALoqab' });

        // Streaming Callback
        const handleChunk = (chunk: AttendanceRecord[]) => {
          setRangeLogs(prev => {
            // GENERIC FIX: Normalize IDs based on Map
            const normalizedChunk = chunk.map(log => {
              const rawId = String(log.employeeId);
              const rawName = String(log.employeeName || '').trim();

              // Priority 1: ID Normalization (National ID -> Code)
              if (normalizationMap.has(rawId)) {
                const target = normalizationMap.get(rawId)!;
                if (target.code !== rawId) {
                  return { ...log, employeeId: target.code, empName: target.name || log.empName };
                }
              }

              // Priority 2: Name Normalization (If ID failed)
              // If the device sends a weird ID but correct Name, map it!
              if (rawName) {
                const normalizedName = rawName.toLowerCase();
                if (nameMap.has(normalizedName)) {
                  const targetCode = nameMap.get(normalizedName)!;
                  if (targetCode !== rawId) {
                    return { ...log, employeeId: targetCode };
                  }
                }
              }

              // Keep specifically the 275 check for safety if map didn't catch it
              if (log.employeeId === '275') {
                return { ...log, employeeId: '2562020083', empName: 'Abdullah ALoqab' };
              }
              return log;
            });

            const Combined = [...prev, ...normalizedChunk];
            const unique = new Map();
            Combined.forEach(item => unique.set(item.id, item));
            return Array.from(unique.values()).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          });
        };

        // 1. Fetch from BRIDGE (New Server)
        // FIX 3949: For 'DAILY' reports, we MUST fetch ALL devices to catch cross-device scans (In on A, Out on B).
        // We filter the RESULT later in the useMemo group logic.
        const effectiveDeviceSn = reportType === 'DAILY' ? undefined : deviceSn;

        // FIX 4022: Lookup Alt Code (National ID) for the selected employee to ensure we catch logs from New Bridge Devices
        // that might use National ID instead of System Code.
        let altCode: string | undefined = undefined;
        if (selectedEmployee) {
          const empObj = (allEmployees as any[]).find(e => e.code === selectedEmployee);
          if (empObj) {
            altCode = empObj.national_id || empObj.ssn || empObj.identity_num || empObj.identification_number || empObj.other_id;
          }
          // HARDCODE FIX: Specific mapping for Abdullah ALoqab (275) if National ID is missing in profile
          // Bidirectional mapping to ensure we catch logs regardless of which ID is selected in the dropdown
          if (selectedEmployee === '275') {
            altCode = '2562020083';
          } else if (selectedEmployee === '2562020083') {
            altCode = '275';
          }
        }

        await fetchBridgeLogsRange(s, e, selectedEmployee, effectiveDeviceSn, handleChunk, altCode);

        // 2. Fetch from LEGACY (Old Server)
        await fetchLegacyLogsRange(s, e, selectedEmployee, effectiveDeviceSn, handleChunk);

      } finally {
        setRangeLoading(false);
      }
    };
    run();
  }, [startDate, endDate, selectedEmployee, deviceSn, reportType]); // Added reportType dep

  useEffect(() => {
    setReportPage(1);
    setSummaryPage(1);
  }, [reportType, deviceSn, startDate, endDate, selectedEmployee]);

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

  const dailySummaryData = useMemo(() => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const startTime = start.getTime();
    const endTime = end.getTime();

    // 1. Group logs by Emp+Date (Cross-Device Aggregation)
    const groups = new Map<string, AttendanceRecord[]>();
    const base = rangeLogs.length > 0 ? rangeLogs : logs;

    base.forEach(log => {
      const t = Date.parse(log.timestamp);
      if (t < startTime || t > endTime) return;

      // FIX: Aggregation happens BEFORE filtering by selectedEmployee to ensure we have the data
      // But for performance loop, checking selectedEmployee here is fine IF we are sure `logs` contains it.
      if (selectedEmployee && log.employeeId !== selectedEmployee) return;

      const d = new Date(t);
      const dayKey = d.toDateString(); // "Fri Jan 22 2026"
      const key = `${log.employeeId}|${dayKey}`;

      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)?.push(log);
    });

    const rows: any[] = [];

    // 2. Determine Target Employees
    let targets = allEmployees;
    if (selectedEmployee) {
      targets = allEmployees.filter(e => e.code === selectedEmployee);
    }

    // 3. Iterate Date Range
    const loopDate = new Date(start);
    loopDate.setHours(0, 0, 0, 0); // Start of day

    while (loopDate <= end) {
      const dayKey = loopDate.toDateString();
      const isWeekend = loopDate.getDay() === 5; // Friday (Jumu'ah) usually off in KSA? Or Check Config. 
      // For now, we report ALL days. Manager can ignore Fridays.

      targets.forEach(emp => {
        const key = `${emp.code}|${dayKey}`;
        const dayLogs = groups.get(key) || [];

        // Apply Device Filter to the GROUP content if selected
        // If deviceSn is selected, we only show this day if the employee used THAT device?
        // OR do we show the day but with empty/partial data?
        // User wants "Accuracy". If I filter by Device X, I expect to see logs from Device X.
        // If employee didn't use Device X, they appear "Absent" on this report regarding Device X?
        // Or should we hide them?
        // Standard Report behavior: "Show me attendance for Device X". If absent on X, show absent?
        // Let's stick to: If deviceSn selected, filter logs. If no logs remain, count as No Show on Device X.

        let filteredDayLogs = dayLogs;
        if (deviceSn) {
          filteredDayLogs = dayLogs.filter(l => l.deviceSn === deviceSn);
        }

        if (filteredDayLogs.length === 0) {
          // ABSENCE / NO DATA
          // Only push if we are showing "ALL" or if we want to report Absences.
          // User said "Missing movement equals Absence".
          rows.push({
            id: `${emp.code}-${dayKey}-absent`,
            empId: emp.code,
            empName: emp.name,
            date: new Date(loopDate),
            firstIn: null,
            lastOut: null,
            breakMinutes: 0,
            lateMinutes: 0,
            netOvertime: 0,
            logsCount: 0,
            isAbsent: true, // Mark as Absent
            status: 'ABSENT'
          });
          return;
        }

        // PRESENCE PROCESSING
        const sortedLogs = [...filteredDayLogs].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

        // Smart In/Out Logic (Cross-Device)
        let firstIn = sortedLogs.find(l => l.type === 'CHECK_IN');
        if (!firstIn && sortedLogs.length > 0) firstIn = sortedLogs[0]; // Fallback to first log

        let lastOut = [...sortedLogs].reverse().find(l => l.type === 'CHECK_OUT');
        const lastLog = sortedLogs[sortedLogs.length - 1];
        if (!lastOut && lastLog && lastLog.id !== firstIn?.id) {
          lastOut = lastLog; // Fallback to last log if distinct
        }

        // Calculate Break
        let breakMinutes = 0;
        // (Simplified break logic for brevity within useMemo, assuming simple In/Out dominant)

        // Calculate Delay/Overtime using Device Rules
        const deviceConfig = getDeviceConfig({
          sn: firstIn?.deviceSn || 'UNKNOWN',
          alias: firstIn?.deviceAlias
        }, firstIn?.timestamp || sortedLogs[0].timestamp);

        const shifts = deviceConfig.shifts || [];
        const shiftType = deviceConfig.shiftType || 'SPLIT';

        let totalDelay = 0;
        let totalOvertimeRaw = 0;

        // --- Same Delay Logic as Before ---
        if (shifts.length === 0) {
          if (firstIn) totalDelay = calculateDelay(firstIn);
        } else if (shiftType === 'ALTERNATING') {
          const checkInTime = new Date(firstIn ? firstIn.timestamp : sortedLogs[0].timestamp);
          let targetShift = shifts[0];
          if (shifts.length > 1 && checkInTime.getHours() >= 13) targetShift = shifts[1];

          const [sh, sm] = targetShift.start.split(':').map(Number);
          const [eh, em] = targetShift.end.split(':').map(Number);

          // Delay
          if (firstIn) {
            const sStart = new Date(firstIn.timestamp);
            sStart.setHours(sh, sm, 0, 0);
            if (checkInTime > sStart) totalDelay = Math.floor((checkInTime.getTime() - sStart.getTime()) / 60000);
          }
          // Overtime
          if (lastOut) {
            const sEnd = new Date(lastOut.timestamp);
            sEnd.setHours(eh, em, 0, 0);
            if (eh < sh) sEnd.setDate(sEnd.getDate() + 1);

            const outTime = new Date(lastOut.timestamp);
            if (outTime > sEnd) totalOvertimeRaw = Math.floor((outTime.getTime() - sEnd.getTime()) / 60000);
          }
        } else {
          // Split / Multi-Shift Standard
          // Simply sum up delay for *sessions* found?
          // For Daily Report Summary, we usually just take First In vs First Shift?
          // Let's use the simplest robust match: First In vs Shift 1.
          // If user worked Split, we might need complex intersection.
          // For now, retaining "First In" logic as primary "Lateness" indicator.
          if (firstIn) {
            // Match to closest shift start?
            let closestShift = shifts[0];
            let minDiff = Infinity;
            const inTime = new Date(firstIn.timestamp);

            shifts.forEach(s => {
              const [sh, sm] = s.start.split(':').map(Number);
              const ss = new Date(inTime);
              ss.setHours(sh, sm, 0, 0);
              const diff = Math.abs(inTime.getTime() - ss.getTime());
              if (diff < minDiff) { minDiff = diff; closestShift = s; }
            });

            const [sh, sm] = closestShift.start.split(':').map(Number);
            const ss = new Date(inTime);
            ss.setHours(sh, sm, 0, 0);
            if (inTime > ss) {
              totalDelay = Math.floor((inTime.getTime() - ss.getTime()) / 60000);
            }
          }
        }

        // Net Lateness (Offset by Overtime if allowed? User wants strict Lateness)
        // User: "Errors... count as lateness".
        // Let's NOT offset lateness with overtime for now to be strict.
        // Actually earlier code did `lateMins -= overtimeOffset`.
        // Let's keep it pure. Late is Late. Overtime is Overtime.
        // But if I arrive late and stay late?
        // Usually, Manager wants to know Lateness.

        rows.push({
          id: key,
          empId: emp.code,
          empName: emp.name,
          date: new Date(loopDate),
          firstIn,
          lastOut,
          breakMinutes,
          lateMinutes: totalDelay,
          netOvertime: totalOvertimeRaw,
          logsCount: sortedLogs.length,
          isAbsent: false,
          status: totalDelay > 0 ? 'LATE' : 'ON_TIME'
        });

      });

      // Next Day
      loopDate.setDate(loopDate.getDate() + 1);
    }

    return rows.sort((a, b) => b.date.getTime() - a.date.getTime() || a.empName.localeCompare(b.empName));
  }, [logs, startDate, endDate, deviceSn, rangeLogs, selectedEmployee, allEmployees]);

  const lateSummary = useMemo(() => {
    // We already have dailySummaryData which seems correct and robust.
    // Let's aggregate FROM dailySummaryData instead of re-calculating from raw logs.
    // This ensures consistency between the "Daily View" and "Summary View".

    const byEmpTotal = new Map<string, { name: string; totalMinutes: number; totalBreakMinutes: number; daysLate: number }>();

    dailySummaryData.forEach(day => {
      const empId = day.empId;
      const prev = byEmpTotal.get(empId);
      if (!prev) {
        byEmpTotal.set(empId, {
          name: day.empName,
          totalMinutes: day.lateMinutes,
          totalBreakMinutes: day.breakMinutes,
          daysLate: day.lateMinutes > 0 ? 1 : 0
        });
      } else {
        prev.name = day.empName; // Update name just in case
        prev.totalMinutes += day.lateMinutes;
        prev.totalBreakMinutes += day.breakMinutes;
        prev.daysLate += day.lateMinutes > 0 ? 1 : 0;
      }
    });

    const rows = Array.from(byEmpTotal.entries()).map(([id, v]) => ({
      id,
      name: v.name,
      totalMinutes: v.totalMinutes,
      totalBreakMinutes: v.totalBreakMinutes,
      daysLate: v.daysLate
    })).sort((a, b) => b.totalMinutes - a.totalMinutes);

    return rows;
  }, [dailySummaryData]);

  // Merge logic for table data source
  const tableData = reportType === 'DAILY' ? dailySummaryData : filteredData;

  // Sorting for non-daily is already handled by filteredData + reportSorted logic?
  // Let's unify pagination
  const activeList = reportType === 'DAILY' ? dailySummaryData
    : (reportType === 'LATE' ? lateSummary
      : (reportType === 'MANUAL' ? reportSorted.filter(l => l.method === AttendanceMethod.MANUAL)
        : reportSorted));
  const totalPages = Math.max(1, Math.ceil(activeList.length / 10));
  const pageItems = activeList.slice((reportPage - 1) * 10, (reportPage - 1) * 10 + 10);

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

  const downloadFile = (content: string, fileName: string, mimeType: string) => {
    const blob = new Blob([content], { type: `${mimeType}; charset=utf-8;` });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadCSV = (headers: string[], rows: string[][], fileName: string) => {
    // Robust logic: Filter out nulls/empty lines manually
    const lines: string[] = [];
    if (headers && headers.length > 0) {
      lines.push(headers.join(';'));
    }

    rows.forEach(r => {
      if (Array.isArray(r)) {
        lines.push(r.map(c => `"${c || ''}"`).join(';'));
      }
    });

    const csvContent = "\uFEFF" + lines.join('\r\n');
    downloadFile(csvContent, fileName, 'text/csv');
  };

  const handleExportSubmit = async (override?: any) => {
    const { type, format, start, end, employeeId } = { ...exportConfig, ...override };

    // 1. Fetch Data (Ensure Local Full Day Range)
    const [sy, sm, sd] = start.split('-').map(Number);
    const [ey, em, ed] = end.split('-').map(Number);

    const s = new Date(sy, sm - 1, sd, 0, 0, 0, 0);
    const e = new Date(ey, em - 1, ed, 23, 59, 59, 999);

    let dataForExport: AttendanceRecord[] = [];
    try {
      dataForExport = await fetchAttendanceLogsRange(s, e);
    } catch {
      dataForExport = logs;
    }

    // Filter by Device/Date/Employee
    const filteredRaw = dataForExport.filter(log => {
      const logDate = new Date(log.timestamp);
      if (logDate < s || logDate > e) return false;
      // Note: We filter logs by employee here, but we will "fill gaps" later for the selected employee(s)
      if (employeeId && log.employeeId !== employeeId) return false;
      return true;
    });

    // 2. Process Data into Daily Records (Base for both reports)
    // Map key: "EmpID__YYYY-MM-DD"
    const dailyMap = new Map<string, {
      empId: string;
      empName: string;
      date: string;
      displayDate: string;
      firstIn: Date | null;
      lastOut: Date | null;
      dailyDelay: number;
      isAbsent: boolean;
    }>();

    filteredRaw.forEach(log => {
      const d = new Date(log.timestamp);
      const dateStr = d.toISOString().split('T')[0]; // YYYY-MM-DD (Local approx if using local time logs) -> Actually Timestamp is ISO.
      // Fix: Use local date string to avoid timezone shifts on day boundaries
      const localDateStr = d.toLocaleDateString('en-CA'); // YYYY-MM-DD

      const key = `${log.employeeId}__${localDateStr}`;

      let record = dailyMap.get(key);
      if (!record) {
        record = {
          empId: log.employeeId,
          empName: log.employeeName,
          date: localDateStr,
          displayDate: d.toLocaleDateString('ar-SA'),
          firstIn: null,
          lastOut: null,
          dailyDelay: 0,
          isAbsent: false
        };
        dailyMap.set(key, record);
      }

      // Explicit Absence Check
      if (log.purpose && log.purpose.includes('غياب')) {
        record.isAbsent = true;
      }

      if (log.type === 'CHECK_IN') {
        if (!record.firstIn || d < record.firstIn) record.firstIn = d;
        record.dailyDelay += calculateDelay(log);
      } else if (log.type === 'CHECK_OUT') {
        if (!record.lastOut || d > record.lastOut) record.lastOut = d;
      }
    });

    // 2.5 FILL MISSING DAYS (Absence Logic)
    // Iterate from Start Date to End Date
    const currentDate = new Date(s);
    const endDateObj = new Date(e);

    // Determine list of employees to check
    // If specific employee selected, only check them. Else, check ALL employees known to system.
    let targetEmployees = [];
    if (employeeId) {
      const found = allEmployees.find(e => e.code === employeeId);
      if (found) targetEmployees.push(found);
    } else {
      targetEmployees = allEmployees;
    }

    if (targetEmployees.length > 0) {
      while (currentDate <= endDateObj) {
        // Skip Fridays (5) and Saturdays (6) if weekend? User didn't specify, but usually absences are working days.
        // For now, I'll list all days, or maybe skip Friday? 
        // User request: "عند غياب الموظف ليوم يتم حذف حقل هذا اليوم وهذا يبدو لي غلط" -> Implies they want to see it.
        const dayOfWeek = currentDate.getDay(); // 0=Sun, 1=Mon... 5=Fri, 6=Sat
        // Assuming Friday is weekend in Saudi, maybe Saturday too.
        // Let's include everything for now to be safe, or maybe skip Friday only?
        // Safe bet: Include all days, highlight Absence.

        const dStr = currentDate.toLocaleDateString('en-CA');
        const dDisplay = currentDate.toLocaleDateString('ar-SA');

        if (dayOfWeek !== 5) { // Skip Friday Only (Common in SA)
          targetEmployees.forEach(emp => {
            const key = `${emp.code}__${dStr}`;
            if (!dailyMap.has(key)) {
              dailyMap.set(key, {
                empId: emp.code,
                empName: emp.name,
                date: dStr,
                displayDate: dDisplay,
                firstIn: null,
                lastOut: null,
                dailyDelay: 0,
                isAbsent: true // Mark as absent
              });
            }
          });
        }

        currentDate.setDate(currentDate.getDate() + 1);
      }
    }

    // 3. Generate Output Helper
    const tableStyle = `width: 100%; border-collapse: collapse; font-family: 'Tajawal', sans-serif; font-size: 10pt; direction: rtl;`;
    const thStyle = `background-color: #2c3e50; color: white; padding: 10px; text-align: center; font-weight: bold; border: 1px solid #ddd;`;
    const tdStyle = `padding: 8px; border: 1px solid #ddd; text-align: center; color: #333;`;
    const missingStyle = `background-color: #fca5a5; color: #7f1d1d; font-weight: bold;`;

    const formatDurationEn = (mins: number) => {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return `${h}:${m.toString().padStart(2, '0')}`;
    };

    const generateHTML = (header: string, body: string, title: string) => `
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <title>${title}</title>
        <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700&display=swap" rel="stylesheet">
        <style>
          @media print {
            @page { size: A4; margin: 10mm; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
          body { font-family: 'Tajawal', sans-serif; margin: 0; padding: 20px; background: white; }
          .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #eee; padding-bottom: 20px; }
          .title { font-size: 24px; font-weight: bold; color: #1e293b; margin-bottom: 10px; }
          .meta { font-size: 14px; color: #64748b; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; }
          th { background-color: #f1f5f9; color: #334155; padding: 12px; font-weight: bold; border: 1px solid #e2e8f0; text-align: right; }
          td { padding: 10px; border: 1px solid #e2e8f0; color: #334155; text-align: right; }
          .status-late { color: #dc2626; font-weight: bold; }
          .status-missing { background-color: #fef2f2; color: #dc2626; } 
          .status-absent { background-color: #fee2e2; color: #b91c1c; font-weight: bold; }
          .footer { margin-top: 40px; text-align: center; font-size: 10px; color: #94a3b8; }
        </style>
    </head>
    <body>
        <div class="header">
           <div class="title">${title} ${employeeId ? ` - ${targetEmployees[0]?.name}` : ''}</div>
           <div class="meta">الفترة: من ${start} إلى ${end}</div>
           <div class="meta" style="margin-top:5px">تاريخ الطباعة: ${new Date().toLocaleDateString('ar-SA')}</div>
        </div>
        <table>
            <thead>${header}</thead>
            <tbody>${body}</tbody>
        </table>
        <div class="footer">تم استخراج التقرير آلياً من نظام QSSUN HR</div>
        <script>window.onload = () => window.print();</script>
    </body>
    </html>`;

    // Shared logic to prepare rows
    const prepareRows = () => {
      // Sort: Date DESC, Name ASC
      const rows = Array.from(dailyMap.values()).sort((a, b) => b.date.localeCompare(a.date) || a.empName.localeCompare(b.empName));
      const header = `<tr>
           <th>الموظف</th>
           <th>التاريخ</th>
           <th>وقت الحضور</th>
           <th>وقت الانصراف</th>
           <th>التأخير (س:د)</th>
           <th>الحالة</th>
         </tr>`;

      const body = rows.map(r => {
        if (r.isAbsent) {
          return `<tr class="row-absent">
                <td>${r.empName}</td>
                <td style="direction:ltr; text-align:right">${r.displayDate}</td>
                <td colspan="2" style="text-align:center">-</td>
                <td style="text-align:center">-</td>
                <td><span class="tag tag-absent">لم يحضر</span></td>
            </tr>`;
        }

        const isMissingOut = r.firstIn && !r.lastOut;
        const timeIn = r.firstIn ? r.firstIn.toLocaleTimeString('en-US', { hour12: false }) : '--';
        const timeOut = r.lastOut ? r.lastOut.toLocaleTimeString('en-US', { hour12: false }) : '--';

        let rowClass = '';
        if (isMissingOut) rowClass = 'row-missing';
        // if (r.dailyDelay > 0) rowClass = 'row-late'; // Optional: highlight late rows?

        const statusLabel = isMissingOut ? '<span class="tag" style="background:#fff7ed; color:#c2410c">لم يسجل خروج</span>' :
          (r.dailyDelay > 0 ? `<span class="tag tag-late">تأخير ${formatDurationEn(r.dailyDelay)}</span>` : '<span class="tag tag-ok">مكتمل</span>');

        const delayText = r.dailyDelay > 0 ? `<span style="color:#dc2626; font-weight:bold">${formatDurationEn(r.dailyDelay)}</span>` : '-';

        return `<tr class="${rowClass}">
                <td style="font-weight:700">${r.empName}</td>
                <td style="direction:ltr; text-align:right">${r.displayDate}</td>
                <td style="direction:ltr; text-align:right; font-family:monospace">${timeIn}</td>
                <td style="direction:ltr; text-align:right; font-family:monospace">${timeOut}</td>
                <td style="direction:ltr; text-align:right">${delayText}</td>
                <td>${statusLabel}</td>
            </tr>`;
      }).join('');

      return { header, body };
    };

    const prepareSummaryRows = () => {
      const empMap = new Map<string, { name: string, totalDelay: number, daysLate: number, missingOutCount: number, absentCount: number }>();
      dailyMap.forEach(day => {
        let e = empMap.get(day.empId);
        if (!e) { e = { name: day.empName, totalDelay: 0, daysLate: 0, missingOutCount: 0, absentCount: 0 }; empMap.set(day.empId, e); }

        if (day.isAbsent) {
          e.absentCount++;
        } else {
          e.totalDelay += day.dailyDelay;
          if (day.dailyDelay > 0) e.daysLate++;
          if (day.firstIn && !day.lastOut) e.missingOutCount++;
        }
      });
      const rows = Array.from(empMap.entries()).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.totalDelay - a.totalDelay);

      const header = `<tr>
           <th>الموظف</th>
           <th>ساعات التأخير</th>
           <th>أيام التأخير</th>
           <th>أيام الغياب</th>
           <th>حماية (لم يسجل خروج)</th>
         </tr>`;

      const body = rows.map(r => `<tr>
                 <td>${r.name}</td>
                 <td style="direction:ltr; text-align:right">${formatDurationEn(r.totalDelay)}</td>
                 <td>${r.daysLate}</td>
                 <td>${r.absentCount}</td>
                 <td>${r.missingOutCount}</td>
             </tr>`).join('');
      return { header, body };
    };

    if (type === 'DETAILED') {
      const { header, body } = prepareRows();
      if (format === 'PRINT') {
        // High-fidelity Print Styling
        const customStyle = `
          @media print {
            @page { size: A4 landscape; margin: 10mm; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
          body { font-family: 'Tajawal', sans-serif; background: #fff; color: #1f2937; }
          .container { width: 100%; max-width: 100%; margin: 0 auto; }
          .header { text-align: center; margin-bottom: 2rem; }
          .header h1 { color: #111827; font-size: 24px; font-weight: 800; margin-bottom: 0.5rem; }
          .meta { color: #6b7280; font-size: 12px; font-weight: 500; }
          
          table { width: 100%; border-collapse: separate; border-spacing: 0; width: 100%; font-size: 11px; }
          th { 
            background-color: #f8fafc; 
            color: #475569; 
            font-weight: 800; 
            padding: 12px 8px; 
            text-align: right; 
            border-bottom: 2px solid #e2e8f0;
            white-space: nowrap;
          }
          td { 
            padding: 12px 8px; 
            border-bottom: 1px solid #f1f5f9; 
            vertical-align: middle;
            color: #334155;
          }
          tr:last-child td { border-bottom: none; }
          
          /* Row Variants */
          .row-absent { background-color: #fef2f2; }
          .row-absent td { color: #991b1b; }
          
          .row-missing { background-color: #fff7ed; }
          .row-late { }
          
          .tag { padding: 4px 8px; border-radius: 6px; font-weight: 700; font-size: 10px; display: inline-block; }
          .tag-late { color: #dc2626; background: #fef2f2; }
          .tag-absent { color: #991b1b; background: #fee2e2; }
          .tag-ok { color: #166534; background: #f0fdf4; }
        `;

        const printHTML = `
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
          <meta charset="UTF-8">
          <title>تقرير الحضور</title>
          <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap" rel="stylesheet">
          <style>${customStyle}</style>
        </head>
        <body>
          <div class="header">
            <h1>${title} ${employeeId ? `- ${targetEmployees[0]?.name}` : ''}</h1>
            <div class="meta">الفترة: ${start} - ${end}</div>
            <div class="meta">تاريخ الطباعة: ${new Date().toLocaleDateString('ar-SA')}</div>
          </div>
          <table>
            <thead>${header}</thead>
            <tbody>${body}</tbody>
          </table>
          <script>window.onload = () => window.print();</script>
        </body>
        </html>`;

        const win = window.open('', '_blank');
        win?.document.write(printHTML);
        win?.document.close();

      } else if (format === 'XLS') {
        const tableStyle = `width: 100%; border-collapse: collapse; font-family: 'Tajawal', sans-serif, Arial; font-size: 10pt; direction: rtl;`;

        // Header Style (Light Blue Background, Dark Text)
        const thStyle = `background-color: #f8fafc; color: #1e293b; padding: 12px; text-align: center; font-weight: bold; border: 1px solid #e2e8f0;`;

        // Cell Style (Padding, Border, Dark Text)
        const tdStyle = `padding: 10px; border: 1px solid #e2e8f0; text-align: center; color: #334155; vertical-align: middle;`;

        const metaHTML = `
          <div style="font-family: 'Tajawal', sans-serif; text-align: center; margin-bottom: 20px; direction: rtl;">
            <h2 style="color: #1e293b; margin: 5px 0; font-size: 16pt;">${title} ${employeeId ? `- ${targetEmployees[0]?.name}` : ''}</h2>
            <p style="color: #64748b; margin: 2px 0; font-size: 10pt;">الفترة: ${start} إلى ${end}</p>
            <p style="color: #64748b; margin: 2px 0; font-size: 10pt;">تاريخ الاستخراج: ${new Date().toLocaleDateString('ar-SA')}</p>
          </div>
        `;

        const xlsBody = Array.from(dailyMap.values()).sort((a, b) => b.date.localeCompare(a.date) || a.empName.localeCompare(b.empName)).map(r => {
          if (r.isAbsent) {
            // ABSENT ROW: Light Red Background, Dark Red Text
            return `<tr style="background-color: #fef2f2;">
                <td style="${tdStyle} color:#991b1b; font-weight:bold;">${r.empName}</td>
                <td style="${tdStyle}">${r.displayDate}</td>
                <td style="${tdStyle}">-</td>
                <td style="${tdStyle}">-</td>
                <td style="${tdStyle}">-</td>
                <td style="${tdStyle} color:#991b1b; font-weight:bold;">لم يحضر</td>
             </tr>`;
          }

          // LATE TEXT: Red Color if dailyDelay > 0
          const delayStyle = r.dailyDelay > 0 ? 'color: #dc2626; font-weight: bold;' : '';

          // MISSING CHECKOUT: Light Orange Row Background (optional, but let's keep it simple as requested)
          // User asked for "Match the picture", picture showed Absent rows clearly.

          const timeIn = r.firstIn ? r.firstIn.toLocaleTimeString('en-US', { hour12: false }) : '--';
          const timeOut = r.lastOut ? r.lastOut.toLocaleTimeString('en-US', { hour12: false }) : '--';

          return `<tr>
                <td style="${tdStyle} font-weight:bold;">${r.empName}</td>
                <td style="${tdStyle}">${r.displayDate}</td>
                <td style="${tdStyle}">${timeIn}</td>
                <td style="${tdStyle}">${timeOut}</td>
                <td style="${tdStyle} ${delayStyle}">${r.dailyDelay > 0 ? formatDurationEn(r.dailyDelay) : '-'}</td>
                <td style="${tdStyle}">${r.dailyDelay > 0 ? 'تأخير' : 'منتظم'}</td>
             </tr>`;
        }).join('');

        const xlsHeader = `<tr>
            <th style="${thStyle}">الموظف</th>
            <th style="${thStyle}">التاريخ</th>
            <th style="${thStyle}">دخول</th>
            <th style="${thStyle}">خروج</th>
            <th style="${thStyle}">تأخير</th>
            <th style="${thStyle}">الحالة</th>
        </tr>`;

        downloadFile(`
            <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
            <head>
            <meta charset="UTF-8">
            <!--[if gte mso 9]>
            <xml>
            <x:ExcelWorkbook>
            <x:ExcelWorksheets>
            <x:ExcelWorksheet>
            <x:Name>Report</x:Name>
            <x:WorksheetOptions>
            <x:DisplayRightToLeft/>
            </x:WorksheetOptions>
            </x:ExcelWorksheet>
            </x:ExcelWorksheets>
            </x:ExcelWorkbook>
            </xml>
            <![endif]-->
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700&display=swap');
                body { font-family: 'Tajawal', sans-serif, Arial; }
                table { border-collapse: collapse; width: 100%; }
                td, th { border: 1px solid #e2e8f0; }
            </style>
            </head>
            <body>
            ${metaHTML}
            <table style="${tableStyle}">${xlsHeader}${xlsBody}</table>
            </body></html>
        `, `Daily_Report_${start}.xls`, 'application/vnd.ms-excel');

      } else {
        // IMPROVED CSV FORMAT
        const rows = Array.from(dailyMap.values()).sort((a, b) => b.date.localeCompare(a.date) || a.empName.localeCompare(b.empName));

        // Metadata Rows
        const metaRows = [
          [`تقرير الحضور اليومي - ${employeeId ? targetEmployees[0]?.name : 'شامل'}`],
          [`الفترة: من ${start} إلى ${end}`],
          [`تاريخ الاستخراج: ${new Date().toLocaleDateString('ar-SA')}`],
          [] // Empty spacer
        ];

        const h = ['المعرف', 'الموظف', 'التاريخ', 'وقت الحضور', 'وقت الانصراف', 'التأخير (دقيقة)', 'الحالة'];

        const r = rows.map(row => {
          if (row.isAbsent) {
            return [row.empId, row.empName, row.displayDate, '-', '-', '0', 'لم يحضر'];
          }
          return [
            row.empId,
            row.empName,
            row.displayDate,
            row.firstIn ? row.firstIn.toLocaleTimeString('en-US', { hour12: false }) : '--',
            row.lastOut ? row.lastOut.toLocaleTimeString('en-US', { hour12: false }) : '--',
            row.dailyDelay > 0 ? row.dailyDelay.toString() : '0',
            (row.firstIn && !row.lastOut) ? 'لم يسجل خروج' : (row.dailyDelay > 0 ? 'تأخير' : 'منتظم')
          ];
        });

        // Combine Meta + Headers + Data
        // downloadCSV expects string[][], so we just pass everything
        // But headers is string[], we need to make it string[][] for consistency if we merge manualy, 
        // OR update downloadCSV to handle it? 
        // Let's manually construct the full array passed to downloadCSV, rename args?
        // downloadCSV signature: (headers: string[], rows: string[][], filename)
        // I will overload columns? No, let's keep headers separate but pass meta in rows? No headers stays as "First real header".
        // Actually, let's allow downloadCSV to take a single "Data 2D Array" instead of Header+Rows split if possible, OR just hack the headers.

        // Let's pass empty headers and put everything in 'rows'
        const fullData = [...metaRows, h, ...r];
        downloadCSV([], fullData as string[][], `Daily_Report_${start}.csv`);
      }
    } else {
      // SUMMARY
      const { header, body } = prepareSummaryRows();
      if (format === 'PRINT') {
        const win = window.open('', '_blank');
        win?.document.write(generateHTML(header, body, 'تقرير التأخير التجميعي'));
        win?.document.close();
      } else if (format === 'XLS') {
        const tableStyle = `width: 100%; border-collapse: collapse; font-family: 'Tajawal', Arial, sans-serif; font-size: 9pt; direction: rtl;`;
        const thStyle = `background-color: #f3f4f6; color: #000; padding: 5px; text-align: center; font-weight: bold; border: 1px solid #999;`;
        const tdStyle = `padding: 5px; border: 1px solid #999; text-align: center; color: #000;`;

        const metaHTML = `
          <div style="font-family: 'Tajawal', sans-serif; text-align: center; margin-bottom: 20px; direction: rtl;">
            <h3 style="margin: 5px 0;">تقرير التأخير التجميعي - ${employeeId ? targetEmployees[0]?.name : 'شامل'}</h3>
            <p style="margin: 2px 0; font-size: 9pt;">الفترة: من ${start} إلى ${end}</p>
            <p style="margin: 2px 0; font-size: 9pt;">تاريخ الاستخراج: ${new Date().toLocaleDateString('ar-SA')}</p>
          </div>
        `;

        const empMap = new Map<string, any>();
        dailyMap.forEach(day => {
          let e = empMap.get(day.empId);
          if (!e) { e = { name: day.empName, totalDelay: 0, daysLate: 0, absentCount: 0 }; empMap.set(day.empId, e); }
          if (day.isAbsent) e.absentCount++;
          else { e.totalDelay += day.dailyDelay; if (day.dailyDelay > 0) e.daysLate++; }
        });
        const summaryRows = Array.from(empMap.values()).sort((a: any, b: any) => b.totalDelay - a.totalDelay);

        const xlsBody = summaryRows.map((r: any) => `<tr><td style="${tdStyle}">${r.name}</td><td style="${tdStyle}">${formatDurationEn(r.totalDelay)}</td><td style="${tdStyle}">${r.daysLate}</td><td style="${tdStyle}">${r.absentCount}</td></tr>`).join('');
        const xlsHeader = `<tr><th style="${thStyle}">الموظف</th><th style="${thStyle}">ساعات التأخير</th><th style="${thStyle}">أيام التأخير</th><th style="${thStyle}">أيام الغياب</th></tr>`;

        downloadFile(`
            <html dir="rtl">
            <head>
            <meta charset="UTF-8">
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700&display=swap');
                body { font-family: 'Tajawal', sans-serif; }
            </style>
            </head>
            <body>
            ${metaHTML}
            <table style="${tableStyle}">${xlsHeader}${xlsBody}</table>
            </body></html>`, 'Summary.xls', 'application/vnd.ms-excel');
      } else {
        // CSV SUMMARY
        const empMap = new Map<string, any>();
        dailyMap.forEach(day => {
          let e = empMap.get(day.empId);
          if (!e) { e = { name: day.empName, totalDelay: 0, daysLate: 0, absentCount: 0 }; empMap.set(day.empId, e); }
          if (day.isAbsent) e.absentCount++;
          else { e.totalDelay += day.dailyDelay; if (day.dailyDelay > 0) e.daysLate++; }
        });
        const summaryRows = Array.from(empMap.values()).sort((a: any, b: any) => b.totalDelay - a.totalDelay);

        const metaRows = [
          [`تقرير الملخص التجميعي - ${employeeId ? targetEmployees[0]?.name : 'شامل'}`],
          [`الفترة: من ${start} إلى ${end}`],
          [`تاريخ الاستخراج: ${new Date().toLocaleDateString('ar-SA')}`],
          []
        ];

        const h = ['الموظف', 'ساعات التأخير', 'أيام التأخير', 'أيام الغياب'];
        const r = summaryRows.map((row: any) => [row.name, formatDurationEn(row.totalDelay), row.daysLate, row.absentCount]);

        const fullData = [...metaRows, h, ...r];
        downloadCSV([], fullData as string[][], `Summary_Report_${start}.csv`);
      }
    }

    setExportModalOpen(false);
  };

  return (
    <div className="animate-fade-in space-y-8 relative z-10 pb-20">

      {/* Header & Controls Section */}
      <div className="relative overflow-hidden bg-slate-900/80 backdrop-blur-2xl p-4 md:p-8 rounded-3xl border border-white/10 shadow-2xl">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 opacity-80" />

        <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 md:gap-6 mb-6 md:mb-8 flex-wrap">
          <div className="flex-1 min-w-[300px]">
            <h2 className="text-xl md:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-300 flex items-center gap-3">
              <div className="p-2 md:p-3 bg-blue-500/10 rounded-2xl backdrop-blur-sm border border-blue-500/20 text-blue-400">
                <FileBarChart size={20} className="md:w-7 md:h-7" />
              </div>
              مركز التقارير الذكي
            </h2>
            <p className="text-slate-400 text-xs md:text-sm font-medium mt-2 mr-12 md:mr-14 max-w-lg leading-relaxed">
              تحليل شامل لبيانات الحضور والانصراف مع إمكانية التصدير المتقدم وتخصيص الفلاتر للحصول على أدق النتائج.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 w-full xl:w-auto flex-wrap">
            <button
              onClick={() => setManualModalOpen(true)}
              className="w-full sm:flex-1 xl:flex-none flex items-center justify-center gap-2 bg-slate-800 text-slate-200 px-4 md:px-6 py-2.5 md:py-3 rounded-2xl hover:bg-slate-700/80 transition-all font-bold border border-slate-700 active:scale-95 text-sm md:text-base shadow-sm hover:shadow-md whitespace-nowrap"
            >
              <Briefcase size={16} className="md:w-[18px] text-blue-500" />
              <span>تسجيل حركة يدوية</span>
            </button>
            <button
              onClick={() => setPrintModalOpen(true)}
              className="w-full sm:flex-1 xl:flex-none flex items-center justify-center gap-2 bg-slate-800 text-slate-200 px-4 md:px-6 py-2.5 md:py-3 rounded-2xl hover:bg-slate-700/80 transition-all font-bold border border-slate-700 active:scale-95 text-sm md:text-base shadow-sm hover:shadow-md whitespace-nowrap"
            >
              <Printer size={16} className="md:w-[18px] text-purple-500" />
              <span>طباعة تقرير التأخير</span>
            </button>
            <button
              onClick={() => setExportModalOpen(true)}
              className="w-full sm:flex-1 xl:flex-none flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 md:px-8 py-2.5 md:py-3 rounded-2xl hover:shadow-lg hover:shadow-blue-500/25 transition-all font-bold active:scale-95 text-sm md:text-base whitespace-nowrap"
            >
              <Download size={18} className="md:w-5" />
              <span>تصدير البيانات</span>
            </button>
          </div>
        </div>

        {/* Filters Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-4 items-end bg-slate-800/50 p-4 md:p-6 rounded-2xl border border-slate-700/50">


          {/* Report Type */}
          <div className="xl:col-span-4">
            <label className="block text-[10px] md:text-[11px] font-bold text-slate-500 mb-2 uppercase tracking-wider">نوع التقرير</label>
            <div className="grid grid-cols-4 md:grid-cols-3 xl:grid-cols-5 gap-1.5 md:gap-2 p-1 bg-slate-900/50 rounded-xl border border-slate-700/50">
              <button
                onClick={() => setReportType('ALL')}
                className={`py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${reportType === 'ALL' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-300'}`}
              >
                شامل
              </button>
              <button
                onClick={() => setReportType('LATE')}
                className={`py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${reportType === 'LATE' ? 'bg-red-900/20 text-red-400 shadow-sm' : 'text-slate-400 hover:text-slate-300'}`}
              >
                <AlertTriangle size={14} />
                التأخير
              </button>
              <button
                onClick={() => setReportType('METHODS')}
                className={`py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${reportType === 'METHODS' ? 'bg-purple-900/20 text-purple-400 shadow-sm' : 'text-slate-400 hover:text-slate-300'}`}
              >
                المصادر
              </button>
              <button
                onClick={() => setReportType('DAILY')}
                className={`py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 md:gap-2 ${reportType === 'DAILY' ? 'bg-blue-900/20 text-blue-400 shadow-sm' : 'text-slate-400 hover:text-slate-300'}`}
              >
                <Calendar size={12} className="hidden sm:block" />
                يومي
              </button>
              <button
                onClick={() => setReportType('MANUAL')}
                className={`py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 md:gap-2 ${reportType === 'MANUAL' ? 'bg-emerald-900/20 text-emerald-400 shadow-sm' : 'text-slate-400 hover:text-slate-300'}`}
              >
                <Check size={12} className="hidden sm:block" />
                يدوي
              </button>
            </div>
          </div>

          {/* Date Range */}
          <div className="xl:col-span-5 grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-2 uppercase tracking-wider">من تاريخ</label>
              <div className="relative group">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full pl-3 pr-4 py-2.5 border border-slate-700 bg-slate-900 text-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-sm font-medium transition-all shadow-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-2 uppercase tracking-wider">إلى تاريخ</label>
              <div className="relative group">
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full pl-3 pr-4 py-2.5 border border-slate-700 bg-slate-900 text-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-sm font-medium transition-all shadow-sm"
                />
              </div>
            </div>
          </div>

          {/* Employee Filter */}
          <div className="xl:col-span-3">
            <label className="block text-[11px] font-bold text-slate-500 mb-2 uppercase tracking-wider">فلترة حسب الموظف</label>
            <div className="relative">
              <select
                value={selectedEmployee}
                onChange={(e) => setSelectedEmployee(e.target.value)}
                className="w-full pl-3 pr-8 py-2.5 border border-slate-700 bg-slate-900 text-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-sm font-medium transition-all shadow-sm appearance-none"
              >
                <option value="">-- جميع الموظفين --</option>
                {allEmployees.map(emp => (
                  <option key={emp.code} value={emp.code}>{emp.name}</option>
                ))}
              </select>
              <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                <UserPlus size={16} />
              </div>
            </div>
          </div>
        </div>

        {/* Device Select */}
        <div className="mt-4 xl:col-span-12">
          <label className="block text-[11px] font-bold text-slate-500 mb-2 uppercase tracking-wider">الجهاز</label>
          <div className="relative">
            <select
              value={deviceSn}
              onChange={(e) => setDeviceSn(e.target.value)}
              className="w-full pl-3 pr-10 py-2.5 border border-slate-700 bg-slate-900 text-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-sm font-medium appearance-none shadow-sm"
            >
              <option value="">كافة الأجهزة</option>
              {devices.map(d => (
                <option key={d.sn} value={d.sn}>{d.alias || d.sn}</option>
              ))}
            </select>
            <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
              <Filter size={14} />
            </div>
          </div>
        </div>
      </div >

      {/* Stats Grid */}
      < div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6" >
        {reportType === 'LATE' && (
          <>
            <StatCard
              title="إجمالي دقائق التأخير"
              value={formatDuration(stats.totalLateMinutes)}
              icon={<Clock />}
              color="text-red-500"
              bg="bg-red-900/10"
              border="border-red-500/10"
            />
            <StatCard
              title="عدد المتأخرين"
              value={stats.count}
              icon={<AlertTriangle />}
              color="text-amber-500"
              bg="bg-amber-900/10"
              border="border-amber-500/10"
            />
            <StatCard
              title="الموظفين المتأثرين"
              value={stats.employees}
              icon={<Briefcase />}
              color="text-slate-300"
              bg="bg-slate-800/60"
              border="border-white/5"
            />
          </>
        )}
        {
          reportType === 'METHODS' && (
            <>
              <StatCard
                title="عن طريق GPS"
                value={stats.methodCounts.GPS}
                icon={<MapPin />}
                color="text-purple-500"
                bg="bg-purple-900/10"
                border="border-purple-500/10"
              />
              <StatCard
                title="بصمة الوجه/الإصبع"
                value={stats.methodCounts.FACE + stats.methodCounts.FINGERPRINT}
                icon={<Filter />}
                color="text-blue-500"
                bg="bg-blue-900/10"
                border="border-blue-500/10"
              />
              <StatCard
                title="إجمالي الحركات"
                value={stats.count}
                icon={<TrendingUp />}
                color="text-emerald-500"
                bg="bg-emerald-900/10"
                border="border-emerald-500/10"
              />
            </>
          )
        }
        {
          reportType === 'ALL' && (
            <>
              <StatCard
                title="إجمالي السجلات"
                value={stats.count}
                icon={<FileBarChart />}
                color="text-blue-600"
                bg="bg-blue-900/10"
                border="border-blue-500/10"
              />
              <StatCard
                title="الحضور (GPS)"
                value={stats.methodCounts.GPS}
                icon={<MapPin />}
                color="text-slate-300"
                bg="bg-slate-800/60"
                border="border-white/5"
              />
              <StatCard
                title="الحضور (أجهزة)"
                value={stats.methodCounts.FACE + stats.methodCounts.FINGERPRINT}
                icon={<Briefcase />}
                color="text-slate-300"
                bg="bg-slate-800/60"
                border="border-white/5"
              />
            </>
          )
        }

        {
          reportType === 'DAILY' && (
            <>
              <StatCard
                title="إجمالي ساعات التأخير"
                value={formatDuration(dailySummaryData.reduce((acc, curr) => acc + curr.lateMinutes, 0))}
                icon={<Clock />}
                color="text-red-500"
                bg="bg-red-900/10"
                border="border-red-500/10"
              />
              <StatCard
                title="أيام العمل"
                value={dailySummaryData.length}
                icon={<FileBarChart />}
                color="text-emerald-500"
                bg="bg-emerald-900/10"
                border="border-emerald-500/10"
              />
            </>
          )
        }
      </div >

      {/* Data Table */}
      < div className="bg-slate-900/70 backdrop-blur-3xl rounded-3xl border border-slate-800 shadow-xl overflow-hidden" >
        {deviceSn && (
          <div className="p-5 border-b border-slate-800/50 bg-slate-800/30">
            <div className="text-sm font-bold mb-3 text-slate-200">الموظفون المسجلون على الجهاز المختار</div>
            {deviceEmployees.length === 0 ? (
              <div className="text-xs text-slate-400">لا توجد بيانات</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {deviceEmployees.map(e => (
                  <span key={e.empCode} className="px-2.5 py-1.5 bg-slate-700/50 rounded-lg text-xs font-mono border border-slate-600 text-slate-300 shadow-sm">{e.empCode} • {e.empName}</span>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="bg-slate-800/80 text-slate-400 text-[11px] border-b border-slate-700 uppercase tracking-wider backdrop-blur-sm">
                {reportType === 'LATE' ? (
                  <>
                    <th className="p-2 md:p-6 font-bold">المعرف</th>
                    <th className="p-2 md:p-6 font-bold">الموظف</th>
                    <th className="p-2 md:p-6 font-bold">إجمالي التأخير</th>
                    <th className="p-2 md:p-6 font-bold">أيام التأخير</th>
                  </>
                ) : reportType === 'MANUAL' ? (
                  <>
                    <th className="p-2 md:p-6 font-bold">الموظف</th>
                    <th className="p-2 md:p-6 font-bold">الوقت</th>
                    <th className="p-2 md:p-6 font-bold">الحالة</th>
                    <th className="p-2 md:p-6 font-bold">السبب / المرفق</th>
                    <th className="p-2 md:p-6 font-bold">حالة الاعتماد</th>
                    <th className="p-2 md:p-6 font-bold">إجراءات</th>
                  </>
                ) : (
                  <>
                    <th className="p-2 md:p-6 font-bold">الموظف</th>
                    <th className="p-2 md:p-6 font-bold">التاريخ والوقت</th>
                    <th className="p-2 md:p-6 font-bold">النوع</th>
                    <th className="p-2 md:p-6 font-bold hidden md:table-cell">المصدر</th>
                    <th className="p-2 md:p-6 font-bold">
                      {reportType === 'DAILY' ? 'التفاصيل' : 'الموقع'}
                    </th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-slate-800/50">
              {rangeLoading ? (
                <tr>
                  <td colSpan={5} className="p-16 text-center text-slate-400">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin opacity-50" />
                      <span className="text-xs tracking-widest uppercase">جارِ تحميل البيانات...</span>
                    </div>
                  </td>
                </tr>
              ) : activeList.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-16 text-center text-slate-400">
                    <div className="flex flex-col items-center gap-4">
                      <div className="p-4 bg-slate-800 rounded-full text-slate-600">
                        <Filter size={32} />
                      </div>
                      <p>لا توجد بيانات مطابقة للفلاتر المحددة</p>
                    </div>
                  </td>
                </tr>
              ) : (
                <>
                  {pageItems.map((log: any, idx) => {
                    // LATE View (Summary Row)
                    if (reportType === 'LATE') {
                      return (
                        <tr key={log.id} className="group hover:bg-red-900/10 transition-colors duration-200">
                          <td className="p-2 md:p-5 text-slate-400 font-mono text-[10px] md:text-xs">{log.id}</td>
                          <td className="p-2 md:p-5">
                            <div className="font-bold text-white text-xs md:text-base">{log.name}</div>
                          </td>
                          <td className="p-2 md:p-5">
                            <span className="font-bold text-red-400 bg-red-900/20 px-2 py-0.5 md:px-3 md:py-1 rounded-lg text-[10px] md:text-xs border border-red-900/30 whitespace-nowrap">
                              {formatDuration(log.totalMinutes)}
                            </span>
                          </td>
                          <td className="p-2 md:p-5 text-slate-400 font-medium text-[10px] md:text-base">{log.daysLate} يوم</td>
                        </tr>
                      );
                    }

                    // MANUAL Log View
                    if (reportType === 'MANUAL') {
                      return (
                        <tr key={log.id || idx} className="group hover:bg-emerald-900/10 transition-colors duration-200">
                          <td className="p-5">
                            <div className="font-bold text-white">{log.employeeName}</div>
                            <div className="text-xs text-slate-500">{log.employeeId}</div>
                          </td>
                          <td className="p-5 text-slate-300 text-sm" dir="ltr">
                            {new Date(log.timestamp).toLocaleString('ar-SA')}
                          </td>
                          <td className="p-5">
                            <span className={`px-2 py-1 rounded text-xs font-bold ${log.type === 'CHECK_IN' ? 'text-emerald-400 bg-emerald-900/20' : 'text-amber-400 bg-amber-900/20'}`}>
                              {log.type === 'CHECK_IN' ? 'دخول' : 'خروج'}
                            </span>
                          </td>
                          <td className="p-5">
                            {/* Note & Attachment */}
                            {(() => {
                              const addr = log.location?.address || log.deviceAlias || '';
                              const attachMatch = addr.match(/(.*)\[مرفق:\s*([^\]]+)\](.*)/);
                              if (attachMatch) {
                                // Fix URL: If relative path, prepend qssun.solar/api or qssun.solar based on standard
                                // The User uploads to /attachment/manuallog/... relative to upload_proof.php
                                // And upload_proof.php returns "../attachment/manuallog/..."
                                // But wait, in Step 1924 I saw it returned "publicUrl".
                                // Step 1977 viewed file showed it returns "../attachment/..."?
                                // Let's assume the string in DB is relative "../attachment..." or "attachment/..."
                                let fileUrl = attachMatch[2].trim();
                                if (!fileUrl.startsWith('http')) {
                                  // Remove leading dots or slashes
                                  fileUrl = fileUrl.replace(/^(\.\.\/|\/)+/, '');
                                  fileUrl = "https://qssun.solar/" + fileUrl;
                                }

                                return (
                                  <div className="flex flex-col gap-1">
                                    <span className="text-sm text-slate-300">{attachMatch[1]}</span>
                                    <a href={fileUrl} target="_blank" rel="noopener noreferrer"
                                      className="flex items-center gap-2 w-fit bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700 text-blue-400 hover:text-blue-300 transition-colors">
                                      <Paperclip size={14} />
                                      <span className="text-xs font-bold">عرض المرفق</span>
                                    </a>
                                    {attachMatch[3] && <span className="text-sm text-slate-300">{attachMatch[3]}</span>}
                                  </div>
                                );
                              }
                              return <span className="text-slate-400 text-sm">{(addr || '-').replace(/(\s+0\s*|\s*0\s+)$/, '')}</span>;
                            })()}
                          </td>
                          <td className="p-5">
                            <div className="flex items-center gap-1.5 text-emerald-400 bg-emerald-900/20 px-3 py-1 rounded-full w-fit border border-emerald-500/20">
                              <Check size={14} />
                              <span className="text-xs font-bold">معتمد تلقائياً</span>
                            </div>
                          </td>
                          <td className="p-5">
                            <button onClick={() => handleDeleteLog(log.id)} className="text-red-400 hover:text-red-300 transition-colors bg-red-900/10 hover:bg-red-900/20 p-2 rounded-lg" title="حذف السجل">
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      );
                    }

                    // Standard & Daily Rows
                    return (
                      <tr key={log.id || idx} className="group hover:bg-blue-900/10 transition-colors duration-200">
                        <td className="p-5">
                          <div className="flex items-center gap-2 md:gap-3">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-700 to-slate-600 flex items-center justify-center text-[10px] md:text-xs font-bold text-slate-300 shadow-inner">
                              {(log.employeeName || log.empName)?.charAt(0) || '?'}
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-white group-hover:text-blue-400 transition-colors text-xs md:text-base truncate max-w-[80px] md:max-w-none">{log.employeeName || log.empName}</div>
                              <div className="text-[9px] md:text-[10px] text-slate-500 font-mono mt-0.5 tracking-wider hidden md:block">{log.employeeId || log.empId}</div>
                            </div>
                          </div>
                        </td>
                        <td className="p-2 md:p-5 text-slate-400" dir="ltr">
                          {reportType === 'DAILY' ? (
                            <div className="flex flex-col items-end">
                              <span className="font-bold text-[10px] md:text-xs text-slate-300">{new Date(log.date).toLocaleDateString('ar-SA')}</span>
                              <span className="text-[9px] md:text-[10px] text-slate-400 hidden md:block">{new Date(log.date).toLocaleDateString('en-US')}</span>
                            </div>
                          ) : (
                            <div className="flex flex-col items-end">
                              <span className="font-mono text-[10px] md:text-xs font-bold text-slate-300 bg-slate-800 px-1.5 py-0.5 md:px-2 md:py-0.5 rounded">{new Date(log.timestamp).toLocaleTimeString('ar-SA-u-ca-gregory')}</span>
                              <span className="text-[9px] md:text-[10px] text-slate-400 mt-1">{new Date(log.timestamp).toLocaleDateString('ar-SA-u-ca-gregory')}</span>
                            </div>
                          )}
                        </td>
                        <td className="p-2 md:p-5">
                          {reportType === 'DAILY' ? (
                            <div className="flex flex-col gap-1">
                              {log.firstIn ? (
                                <span className="text-[9px] md:text-[11px] text-emerald-400 bg-emerald-900/20 px-1 rounded flex items-center gap-1 border border-emerald-900/30 whitespace-nowrap">
                                  دخول: {new Date(log.firstIn.timestamp).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              ) : <span className="text-[9px] md:text-[11px] text-rose-400 whitespace-nowrap">بدون دخول</span>}
                              {log.lastOut ? (
                                <span className="text-[9px] md:text-[11px] text-orange-400 bg-orange-900/20 px-1 rounded flex items-center gap-1 border border-orange-900/30 whitespace-nowrap">
                                  خروج: {new Date(log.lastOut.timestamp).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              ) : <span className="text-[9px] md:text-[11px] text-slate-500 whitespace-nowrap">لم يخرج</span>}
                            </div>
                          ) : (
                            <span className={`px-2 py-0.5 md:px-3 md:py-1.5 rounded-lg text-[9px] md:text-[10px] font-bold border whitespace-nowrap ${(log.purpose && log.purpose.includes('غياب'))
                              ? 'bg-red-500/10 text-red-500 border-red-500/20'
                              : log.type === 'CHECK_IN'
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                              }`}>
                              {(log.purpose && log.purpose.includes('غياب')) ? 'غياب' : log.type === 'CHECK_IN' ? 'دخول' : 'خروج'}
                            </span>
                          )}
                        </td>
                        <td className="p-2 md:p-5 hidden md:table-cell">
                          {reportType === 'DAILY' ? (
                            <div className="text-[11px] text-slate-500">
                              {formatDuration(log.breakMinutes)} راحة
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 text-slate-400 text-xs font-medium bg-slate-800/50 px-3 py-1 rounded-lg w-fit">
                              {log.method === 'تطبيق جوال (GPS)' ? <MapPin size={12} /> : <Briefcase size={12} />}
                              {log.method}
                            </div>
                          )}
                        </td>
                        <td className="p-2 md:p-5">
                          {reportType === 'DAILY' ? (
                            <div className="flex flex-col items-start gap-1">
                              {log.lateMinutes > 0 ? (
                                <span className="text-red-400 text-[10px] md:text-xs font-bold bg-red-900/20 px-2 py-0.5 rounded border border-red-900/30 whitespace-nowrap">{formatDuration(log.lateMinutes)} تأخير</span>
                              ) : log.netOvertime > 0 ? (
                                <span className="text-purple-400 text-[10px] md:text-xs font-bold bg-purple-900/20 px-2 py-0.5 rounded border border-purple-900/30 whitespace-nowrap flex items-center gap-1">
                                  + {formatDuration(log.netOvertime)} إضافي
                                </span>
                              ) : (
                                <span className="text-emerald-400 text-[10px] bg-emerald-900/10 px-2 py-0.5 rounded border border-emerald-900/20">منتظم</span>
                              )}
                            </div>
                          ) : (
                            <div className="text-[10px] md:text-xs text-slate-400 font-mono truncate max-w-[150px] md:max-w-none block" title={(log.location?.address || '').replace(/^0\s*|\s*0$/g, '')}>
                              {(() => {
                                // 👑 VIP Rule: Faisal + Web/Mobile => Administration
                                if (log.employeeName &&
                                  (log.employeeName.toLowerCase().includes('faisal') || log.employeeName.includes('فيصل')) &&
                                  (log.deviceSn === 'Web' || log.deviceSn === 'Manual-Web' || log.deviceAlias === 'الجوال')) {
                                  return 'الإدارة';
                                }

                                // 1. Use getDeviceConfig to resolve Alias (Handles overrides, partial matches, etc)
                                const config = getDeviceConfig({
                                  sn: log.deviceSn,
                                  alias: log.deviceAlias
                                }, log.timestamp);

                                let displayAddr = config.alias;

                                // 2. Fallback to API alias if config returned generic default (and API had something better? unlikely)
                                // Actually getDeviceConfig returns `device.alias` fallback, so this is fine.

                                // Attachment Link Logic (Manual - usually has 'Manual' alias or custom note)
                                const attachMatch = displayAddr?.match(/(.*)\[مرفق:\s*([^\]]+)\](.*)/);
                                if (attachMatch) {
                                  let fileUrl = attachMatch[2].trim();
                                  if (!fileUrl.startsWith('http')) {
                                    fileUrl = fileUrl.replace(/^(\.\.\/|\/)+/, '');
                                    fileUrl = "https://qssun.solar/" + fileUrl;
                                  }
                                  return (
                                    <div className="flex items-center gap-2">
                                      <span>{attachMatch[1]}</span>
                                      <a href={fileUrl} target="_blank" rel="noopener noreferrer"
                                        className="flex items-center gap-1 bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded border border-blue-500/30 hover:bg-blue-500/20 transition-colors">
                                        <Paperclip size={12} />
                                        <span className="font-bold">عرض المرفق</span>
                                      </a>
                                      {attachMatch[3] && <span>{attachMatch[3]}</span>}
                                    </div>
                                  );
                                }

                                // Default Display
                                return (
                                  <div className="flex items-center gap-2">
                                    <span className="truncate">{(displayAddr || '-').replace(/^0\s*|\s*0$/g, '').replace('0 undefined', 'Device')}</span>
                                    {log.location?.lat && log.location?.lng && (
                                      <a
                                        href={`https://www.google.com/maps?q=${log.location.lat},${log.location.lng}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-emerald-400 hover:text-emerald-300 bg-emerald-900/20 p-1 rounded transition-colors flex-shrink-0"
                                        title="عرض الموقع على الخريطة"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <MapPin size={12} />
                                      </a>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                  <tr>
                    <td colSpan={5} className="p-4 bg-slate-800/30 border-t border-slate-800">
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span>عرض 10 سجلات من أصل {activeList.length}</span>
                        <div className="flex items-center gap-2">
                          <button onClick={() => setReportPage(p => Math.max(1, p - 1))} disabled={reportPage <= 1} className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-800 border border-slate-700 hover:bg-slate-700 disabled:opacity-50 transition-colors">
                            <span className="sr-only">Previous</span>
                            ‹
                          </button>
                          <span className="font-mono bg-slate-900 px-3 py-1 rounded-md border border-slate-800">{reportPage} / {totalPages}</span>
                          <button onClick={() => setReportPage(p => Math.min(totalPages, p + 1))} disabled={reportPage >= totalPages} className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-800 border border-slate-700 hover:bg-slate-700 disabled:opacity-50 transition-colors">
                            <span className="sr-only">Next</span>
                            ›
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div >




      {/* Export Modal */}
      {
        exportModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setExportModalOpen(false)} />
            <div className="relative bg-slate-900 rounded-3xl shadow-2xl w-full max-w-md animate-fade-in border border-slate-700 overflow-hidden">
              <div className="p-6 border-b border-slate-700 flex items-center justify-between bg-slate-800/50 backdrop-blur-xl">
                <h3 className="font-bold text-lg text-white">خيارات التصدير</h3>
                <button onClick={() => setExportModalOpen(false)} className="text-slate-400 hover:text-slate-200 transition-colors">
                  <X size={20} />
                </button>
              </div>
              <div className="p-6 space-y-6 bg-slate-900/40 backdrop-blur-md">

                {/* Type Selection */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-3 uppercase tracking-wider">نوع البيانات</label>
                  <div className="flex bg-slate-800/50 p-1.5 rounded-2xl border border-slate-700/50">
                    <button
                      onClick={() => setExportConfig(c => ({ ...c, type: 'DETAILED' }))}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${exportConfig.type === 'DETAILED' ? 'bg-slate-700 text-blue-400 shadow-sm' : 'text-slate-400'}`}
                    >
                      سجلات مفصلة
                    </button>
                    <button
                      onClick={() => setExportConfig(c => ({ ...c, type: 'SUMMARY' }))}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${exportConfig.type === 'SUMMARY' ? 'bg-slate-700 text-blue-400 shadow-sm' : 'text-slate-400'}`}
                    >
                      ملخص التأخير
                    </button>
                  </div>
                </div>

                {/* Date Range */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">من تاريخ</label>
                    <input
                      type="date"
                      value={exportConfig.start}
                      onChange={(e) => setExportConfig({ ...exportConfig, start: e.target.value })}
                      className="w-full p-2 rounded-lg border border-slate-700 bg-slate-900 text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">إلى تاريخ</label>
                    <input
                      type="date"
                      value={exportConfig.end}
                      onChange={(e) => setExportConfig({ ...exportConfig, end: e.target.value })}
                      className="w-full p-2 rounded-lg border border-slate-700 bg-slate-900 text-slate-200"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">تحديد موظف (اختياري)</label>
                  <select
                    value={exportConfig.employeeId}
                    onChange={(e) => setExportConfig({ ...exportConfig, employeeId: e.target.value })}
                    className="w-full p-2 rounded-lg border border-slate-700 bg-slate-900 text-slate-200"
                  >
                    <option value="">-- تقرير شامل لجميع الموظفين --</option>
                    {allEmployees.map(emp => (
                      <option key={emp.code} value={emp.code}>{emp.name}</option>
                    ))}
                  </select>
                </div>
                {/* Format Selection */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-3 uppercase tracking-wider">الصيغة</label>
                  <div className="flex w-full gap-3">
                    <label className="flex items-center gap-3 cursor-pointer border border-slate-700 p-4 rounded-xl flex-1 hover:bg-slate-800/50 transition bg-slate-800/30">
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${exportConfig.format === 'XLS' ? 'border-blue-500' : 'border-slate-600'}`}>
                        {exportConfig.format === 'XLS' && <div className="w-2.5 h-2.5 bg-blue-500 rounded-full" />}
                      </div>
                      <input type="radio" name="format" checked={exportConfig.format === 'XLS'} onChange={() => setExportConfig(c => ({ ...c, format: 'XLS' }))} className="hidden" />
                      <span className="text-sm font-bold text-slate-300">Excel (XLS)</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer border border-slate-700 p-4 rounded-xl flex-1 hover:bg-slate-800/50 transition bg-slate-800/30">
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${exportConfig.format === 'CSV' ? 'border-blue-500' : 'border-slate-600'}`}>
                        {exportConfig.format === 'CSV' && <div className="w-2.5 h-2.5 bg-blue-500 rounded-full" />}
                      </div>
                      <input type="radio" name="format" checked={exportConfig.format === 'CSV'} onChange={() => setExportConfig(c => ({ ...c, format: 'CSV' }))} className="hidden" />
                      <span className="text-sm font-bold text-slate-300">CSV</span>
                    </label>
                  </div>
                </div>

              </div>
              <div className="p-5 border-t border-slate-700 bg-slate-800/50 flex justify-end gap-3 backdrop-blur-xl">
                <button
                  onClick={() => setExportModalOpen(false)}
                  className="px-6 py-2.5 text-slate-400 hover:text-slate-200 text-sm font-bold transition-colors"
                >
                  إلغاء
                </button>
                <button
                  onClick={handleExportSubmit}
                  className="px-8 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-500/20 active:scale-95 transition-all"
                >
                  تنزيل الملف
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* Print Modal */}
      {
        printModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 animate-scale-in">
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900">
                <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                  <Printer className="text-blue-500" />
                  طباعة تقرير التأخير
                </h3>
                <button onClick={() => setPrintModalOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-400 transition-colors">
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-600 dark:text-slate-400">من تاريخ</label>
                    <input
                      type="date"
                      value={printConfig.start}
                      onChange={e => setPrintConfig({ ...printConfig, start: e.target.value })}
                      className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold text-slate-700 dark:text-white focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-600 dark:text-slate-400">إلى تاريخ</label>
                    <input
                      type="date"
                      value={printConfig.end}
                      onChange={e => setPrintConfig({ ...printConfig, end: e.target.value })}
                      className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold text-slate-700 dark:text-white focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Employee Multi-Select & Search */}
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-600 dark:text-slate-400">الموظفين</label>
                  <div className="border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 overflow-hidden">
                    {/* Search Header */}
                    <div className="p-2 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2 bg-white dark:bg-slate-900">
                      <Search size={16} className="text-slate-400" />
                      <input
                        type="text"
                        placeholder="بحث عن موظف..."
                        value={printEmpSearch}
                        onChange={e => setPrintEmpSearch(e.target.value)}
                        className="w-full bg-transparent text-sm outline-none text-slate-700 dark:text-white placeholder:text-slate-400"
                      />
                    </div>

                    {/* Options List */}
                    <div className="max-h-48 overflow-y-auto p-1 custom-scrollbar">
                      {/* Select All Option */}
                      <label className="flex items-center gap-2 p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg cursor-pointer transition-colors border-b border-transparent hover:border-slate-200 dark:hover:border-slate-600">
                        <input
                          type="checkbox"
                          checked={printConfig.employeeIds.length === 0}
                          onChange={() => setPrintConfig(c => ({ ...c, employeeIds: [] }))}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
                        />
                        <span className="text-sm font-bold text-slate-700 dark:text-slate-200">جميع الموظفين ({printAvailableEmployees.length})</span>
                      </label>

                      {/* Filtered List */}
                      <div className="space-y-0.5 mt-1">
                        {printAvailableEmployees
                          .filter(e => e.name.toLowerCase().includes(printEmpSearch.toLowerCase()) || e.code.includes(printEmpSearch))
                          .map(emp => {
                            const isSelected = printConfig.employeeIds.includes(emp.code);
                            return (
                              <label key={emp.code} className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-slate-100 dark:hover:bg-slate-700'}`}>
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={(e) => {
                                    setPrintConfig(prev => {
                                      const current = prev.employeeIds;
                                      if (e.target.checked) {
                                        // Add logic: If we are adding, we are no longer in "ALL" mode, so just push.
                                        // If current was empty (ALL), and we click one, implies we want ONLY that one?
                                        // NO. Standard UX: If "All" is selected (empty logic), and I select "Ahmed", usually it means "Only Ahmed".
                                        // So logic:
                                        // If current.length === 0 (ALL mode) -> new set is [id].
                                        // Else -> [...current, id].
                                        return { ...prev, employeeIds: [...current, emp.code] };
                                      } else {
                                        // Remove
                                        const newVal = current.filter(id => id !== emp.code);
                                        // If newVal becomes empty, does it mean ALL?
                                        // If I deselect the last person, do I want NO ONE or EVERYONE?
                                        // Usually NONE. But my logic says Empty=ALL.
                                        // This is a UX conflict.
                                        // Let's keep strict: Empty = ALL.
                                        // If user deselects last one -> Goes back to ALL.
                                        return { ...prev, employeeIds: newVal };
                                      }
                                    });
                                  }}
                                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
                                />
                                <div className="flex flex-col">
                                  <span className="text-xs md:text-sm font-medium text-slate-700 dark:text-slate-200">{emp.name}</span>
                                  <span className="text-[10px] text-slate-400 font-mono">{emp.code}</span>
                                </div>
                              </label>
                            );
                          })}
                        {printAvailableEmployees.length === 0 && (
                          <p className="text-center text-xs text-slate-400 py-4">لا يوجد موظفين لهذا الجهاز</p>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-between items-center px-1">
                    <span className="text-[10px] text-slate-400">
                      {printConfig.employeeIds.length === 0 ? 'يتم عرض تقرير لجميع الموظفين' : `تم تحديد ${printConfig.employeeIds.length} موظف`}
                    </span>
                    {printConfig.employeeIds.length > 0 && (
                      <button
                        onClick={() => setPrintConfig(c => ({ ...c, employeeIds: [] }))}
                        className="text-[10px] text-blue-500 hover:text-blue-400 font-bold"
                      >
                        إلغاء التحديد
                      </button>
                    )}
                  </div>
                </div>

                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-900/30 flex items-start gap-3">
                  <AlertTriangle size={18} className="text-blue-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-blue-600 dark:text-blue-300 font-medium leading-relaxed">
                    سيتم توليد تقرير PDF يحتوي فقط على ساعات ودقائق التأخير للموظفين المحددين في الفترة المختارة، جاهز للطباعة المباشرة.
                  </p>
                </div>
              </div>

              <div className="p-6 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3 bg-slate-50/50 dark:bg-slate-900">
                <button
                  onClick={() => setPrintModalOpen(false)}
                  className="px-6 py-2.5 rounded-xl font-bold text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors"
                >
                  إلغاء
                </button>
                <button
                  onClick={handlePrintDelayReport}
                  className="px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold shadow-lg shadow-slate-900/20 active:scale-95 transition-all flex items-center gap-2"
                >
                  <Printer size={18} />
                  طباعة التقرير
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* Manual Entry Modal */}
      {
        manualModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setManualModalOpen(false)} />
            <div className="relative bg-slate-900 rounded-3xl shadow-2xl w-full max-w-md animate-fade-in border border-slate-700 overflow-hidden">
              <div className="p-6 border-b border-slate-700 flex items-center justify-between bg-slate-800/50 backdrop-blur-xl">
                <h3 className="font-bold text-lg text-white">تسجيل حركة يدوية</h3>
                <button onClick={() => setManualModalOpen(false)} className="text-slate-400 hover:text-slate-200 transition-colors">
                  <X size={20} />
                </button>
              </div>
              <div className="p-6 space-y-5 bg-slate-900/40 backdrop-blur-md">

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-2 uppercase tracking-wider">الموظف</label>
                  <select
                    value={manualForm.empCode}
                    onChange={(e) => setManualForm(f => ({ ...f, empCode: e.target.value }))}
                    className="w-full px-4 py-3 border border-slate-700 bg-slate-800/50 rounded-xl text-sm outline-none focus:ring-2 focus:ring-purple-500 text-white transition-shadow"
                  >
                    <option value="">اختر الموظف...</option>
                    {allEmployees.map(e => (
                      <option key={e.code} value={e.code}>{e.name}</option>
                    ))}
                  </select>
                </div>

                {/* Mode Toggle */}
                <div className="flex bg-slate-800/50 p-1 rounded-2xl border border-slate-700/50 mb-4">
                  <button
                    onClick={() => setIsBulk(false)}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${!isBulk ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-slate-300'}`}
                  >
                    حركة واحدة
                  </button>
                  <button
                    onClick={() => setIsBulk(true)}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${isBulk ? 'bg-purple-900/30 text-purple-400 border border-purple-500/30 shadow' : 'text-slate-400 hover:text-slate-300'}`}
                  >
                    فترة (أيام متعددة)
                  </button>
                </div>

                {isBulk ? (
                  /* BULK MODE INPUTS */
                  <div className="space-y-4 animate-fade-in">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-500 mb-2 uppercase tracking-wider">من تاريخ</label>
                        <input
                          type="date"
                          value={manualForm.date}
                          onChange={(e) => setManualForm(f => ({ ...f, date: e.target.value }))}
                          className="w-full px-4 py-3 border border-slate-700 rounded-xl bg-slate-800/50 text-sm focus:ring-2 focus:ring-purple-500 outline-none text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-500 mb-2 uppercase tracking-wider">إلى تاريخ</label>
                        <input
                          type="date"
                          value={manualForm.endDate}
                          onChange={(e) => setManualForm(f => ({ ...f, endDate: e.target.value }))}
                          className="w-full px-4 py-3 border border-slate-700 rounded-xl bg-slate-800/50 text-sm focus:ring-2 focus:ring-purple-500 outline-none text-white"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-500 mb-2 uppercase tracking-wider">وقت الدخول</label>
                        <input
                          type="time"
                          value={manualForm.startTime}
                          onChange={(e) => setManualForm(f => ({ ...f, startTime: e.target.value }))}
                          className="w-full px-4 py-3 border border-slate-700 rounded-xl bg-slate-800/50 text-sm focus:ring-2 focus:ring-purple-500 outline-none text-white ltr"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-500 mb-2 uppercase tracking-wider">وقت الخروج</label>
                        <input
                          type="time"
                          value={manualForm.endTime}
                          onChange={(e) => setManualForm(f => ({ ...f, endTime: e.target.value }))}
                          className="w-full px-4 py-3 border border-slate-700 rounded-xl bg-slate-800/50 text-sm focus:ring-2 focus:ring-purple-500 outline-none text-white ltr"
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pt-2">
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded bg-slate-800 border-slate-600 text-purple-600 focus:ring-purple-500"
                        checked={manualForm.includeWeekends}
                        onChange={(e) => setManualForm(f => ({ ...f, includeWeekends: e.target.checked }))}
                        id="weekendCheck"
                      />
                      <label htmlFor="weekendCheck" className="text-xs text-slate-300 font-bold cursor-pointer select-none">
                        تضمين أيام العطلة الأسبوعية (الجمعة/السبت)
                      </label>
                    </div>
                  </div>
                ) : (
                  /* SINGLE MODE INPUTS */
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-500 mb-2 uppercase tracking-wider">التاريخ</label>
                        <input
                          type="date"
                          value={manualForm.date}
                          onChange={(e) => setManualForm(f => ({ ...f, date: e.target.value }))}
                          className="w-full px-4 py-3 border border-slate-700 rounded-xl bg-slate-800/50 text-sm focus:ring-2 focus:ring-purple-500 outline-none text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-500 mb-2 uppercase tracking-wider">الوقت</label>
                        <input
                          type="time"
                          value={manualForm.time}
                          onChange={(e) => setManualForm(f => ({ ...f, time: e.target.value }))}
                          className="w-full px-4 py-3 border border-slate-700 rounded-xl bg-slate-800/50 text-sm focus:ring-2 focus:ring-purple-500 outline-none text-white"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 mb-2 uppercase tracking-wider">نوع الحركة</label>
                      <div className="flex bg-slate-800/50 p-1.5 rounded-2xl border border-slate-700/50">
                        <button
                          onClick={() => setManualForm(f => ({ ...f, type: 'CHECK_IN' }))}
                          className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${manualForm.type === 'CHECK_IN' ? 'bg-slate-700 text-green-400 shadow-sm' : 'text-slate-400'}`}
                        >
                          تسجيل دخول
                        </button>
                        <button
                          onClick={() => setManualForm(f => ({ ...f, type: 'CHECK_OUT' }))}
                          className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${manualForm.type === 'CHECK_OUT' ? 'bg-slate-700 text-red-400 shadow-sm' : 'text-slate-400'}`}
                        >
                          تسجيل خروج
                        </button>
                      </div>
                    </div>
                  </>
                )}

                {/* Reason & File (Shared) */}
                <div className="space-y-4 pt-2 border-t border-slate-700/50">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-2 uppercase tracking-wider">السبب / ملاحظات</label>
                    <textarea
                      value={manualForm.note}
                      onChange={(e) => setManualForm(f => ({ ...f, note: e.target.value }))}
                      placeholder="اكتب سبب التعديل أو تفاصيل المهمة..."
                      className="w-full px-4 py-3 border border-slate-700 rounded-xl bg-slate-800/50 text-sm focus:ring-2 focus:ring-purple-500 outline-none text-white h-20 resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-2 uppercase tracking-wider">مرفقات (اختياري)</label>
                    <div className="relative">
                      <input
                        type="file"
                        onChange={(e) => setManualForm(f => ({ ...f, file: e.target.files ? e.target.files[0] : null }))}
                        className="hidden"
                        id="manualFile"
                      />
                      <label
                        htmlFor="manualFile"
                        className={`flex items-center justify-center gap-2 p-3 border border-dashed rounded-xl cursor-pointer transition-all ${manualForm.file ? 'border-purple-500 bg-purple-500/10 text-purple-400' : 'border-slate-700 hover:border-slate-600 text-slate-400 hover:text-slate-300'}`}
                      >
                        {manualForm.file ? (
                          <>
                            <Check size={16} />
                            <span className="text-xs font-bold truncate max-w-[200px]">{manualForm.file.name}</span>
                          </>
                        ) : (
                          <>
                            <Briefcase size={16} />
                            <span className="text-xs font-bold">رفع ملف (عذر طبي / خطاب)</span>
                          </>
                        )}
                      </label>
                    </div>
                  </div>
                </div>

              </div>
              <div className="p-5 border-t border-slate-700 bg-slate-800/50 flex justify-end gap-3 backdrop-blur-xl">
                <button
                  onClick={() => setManualModalOpen(false)}
                  className="px-6 py-2.5 text-slate-400 hover:text-slate-200 text-sm font-bold transition-colors"
                >
                  إلغاء
                </button>
                <button
                  onClick={handleManualSubmit}
                  disabled={manualSubmitting}
                  className="px-8 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-purple-500/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {manualSubmitting ? 'جارِ الحفظ...' : 'حفظ الحركة'}
                </button>
              </div>
            </div>
          </div>
        )
      }
    </div >
  );
};



export default Reports;
