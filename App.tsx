import React, { useState, useEffect, useMemo } from 'react';
import { Capacitor } from '@capacitor/core';
import Layout from './components/Layout';
import { LOCATIONS } from './config/locations';
import { fetchAttendanceLogs, loginUser, fetchDevices, fetchEmployeeCount, fetchDeviceEmployees, fetchAllEmployees, fetchEmployeeLogs, bindDevice } from './services/api';

// GPSAttendance page disabled temporarily
import EmployeePortal from './components/EmployeePortal';
import LoginScreen from './components/LoginScreen';
import LocationManager from './components/LocationManager';
import Reports from './components/Reports';
import { AttendanceRecord, DashboardStats, User, UserRole, LocationConfig, Device } from './types';
import { getStats } from './services/api';
import { MapPin, Clock, CheckCircle, XCircle, RefreshCw, Users as UsersIcon, Sparkles, WifiOff, AlertTriangle, ArrowUpRight, ShieldCheck } from 'lucide-react';
import ModernDashboard from './components/ModernDashboard';
import Employees from './components/Employees';
import DeviceManager from './components/DeviceManager';
import MobilePunch from './components/MobilePunch'; // New GPS Component


const App: React.FC = () => {

  // Auth State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [bindModalOpen, setBindModalOpen] = useState(false);
  const [pendingBind, setPendingBind] = useState<any>(null);

  // Theme State
  // Theme State (Forced Dark)
  const isDarkMode = true;

  // Data State
  const [activeTab, setActiveTab] = useState('dashboard');
  const [logs, setLogs] = useState<AttendanceRecord[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshIntervalMs, setRefreshIntervalMs] = useState(15000);
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDeviceSns, setSelectedDeviceSns] = useState<string[]>([]);
  const [deviceFilterOpen, setDeviceFilterOpen] = useState(false);
  const [latestPage, setLatestPage] = useState(1);
  const [statsModalOpen, setStatsModalOpen] = useState(false);
  const [statsModalType, setStatsModalType] = useState<'TOTAL' | 'PRESENT' | 'LATE' | 'ABSENT' | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [employeesIndex, setEmployeesIndex] = useState<Record<string, { name: string; devices: string[] }>>({});
  const [modalPage, setModalPage] = useState(1);



  // Location State
  const [locations, setLocations] = useState<LocationConfig[]>(LOCATIONS);

  // Logs Filter State
  const [logSearchTerm, setLogSearchTerm] = useState('');
  const [logStartDate, setLogStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [logEndDate, setLogEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [logFilterType, setLogFilterType] = useState<string>('ALL');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);

  // Settings State
  const [settings, setSettings] = useState({
    workStartTime: '08:30:00',
    workEndTime: '17:30:00'
  });

  // Derived Filtered Logs
  const filteredLogs = logs.filter(log => {
    const matchesSearch = log.employeeName.toLowerCase().includes(logSearchTerm.toLowerCase()) ||
      log.employeeId.includes(logSearchTerm);

    // Date Range Check (Simple string comparison for YYYY-MM-DD)
    const logDate = new Date(log.timestamp).toISOString().split('T')[0];
    const matchesDate = logDate >= logStartDate && logDate <= logEndDate;

    const matchesType = logFilterType === 'ALL' || log.type === logFilterType;

    return matchesSearch && matchesDate && matchesType;
  });

  // Initialization: Enforce Dark Mode
  useEffect(() => {
    document.documentElement.classList.add('dark');
    localStorage.setItem('theme', 'dark');

    // Auto Login
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
      try {
        setCurrentUser(JSON.parse(savedUser));
      } catch (e) {
        localStorage.removeItem('currentUser');
      }
    }

    // Request Location Permission immediately
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => console.log("Location Access Granted", position.coords),
        (error) => console.warn("Location Access Denied/Error", error),
        { enableHighAccuracy: true }
      );
    }
  }, []);

  const toggleTheme = () => { }; // Disabled

  const loadData = async () => {
    setLoading(true);
    setDataError(null);
    try {
      const data = await fetchAttendanceLogs();
      if (data.length === 0) {
        setDataError("لا توجد سجلات. تأكد من أن الجهاز متصل وأنه توجد حركات مسجلة.");
      }
      setLogs(data);
      setStats(getStats(data));
      try {
        const count = await fetchEmployeeCount();
        setStats(prev => prev ? {
          ...prev,
          totalEmployees: count,
          onLeave: Math.max(count - prev.presentToday, 0)
        } : prev);
      } catch { }
      setLastUpdatedAt(new Date());
    } catch (err: any) {
      console.error(err);
      setLogs([]); // Clear logs on error
      setDataError("فشل الاتصال بالخادم. يرجى التأكد من تشغيل API والاتصال بالشبكة.");
    } finally {
      setLoading(false);
    }
  };

  const loadDevices = async () => {
    try {
      const list = await fetchDevices();
      // Merge with local config
      const localConfigStr = localStorage.getItem('device_configs');
      const localConfig = localConfigStr ? JSON.parse(localConfigStr) : {};

      const merged = list.map(d => ({
        ...d,
        alias: localConfig[d.sn]?.alias || d.alias,
        shifts: localConfig[d.sn]?.shifts || []
      }));

      setDevices(merged);
    } catch { }
  };

  useEffect(() => {
    if (currentUser?.role === 'ADMIN') {
      loadData();
      loadDevices();
    }
  }, [currentUser]);

  useEffect(() => {
    if (currentUser?.role === 'ADMIN' && autoRefresh) {
      const id = setInterval(() => {
        loadData();
      }, refreshIntervalMs);
      return () => clearInterval(id);
    }
  }, [currentUser, autoRefresh, refreshIntervalMs]);

  const handleLogin = async (username: string, password: string, rememberMe: boolean) => {
    setLoginError(null);
    try {
      const user = await loginUser(username, password);

      // RESTRICTION: Employees can only login via Native App (Android/iOS)
      // Exception for Developer (Faisal) by Name or ID
      const isDev = user.name === 'Faisal ALnutayfi' || user.id === '1093394672' || user.name.includes('Faisal');
      if (user.role === 'EMPLOYEE' && !Capacitor.isNativePlatform() && !isDev) {
        throw new Error("يرجى الدخول عن طريق التطبيق ، في حال عدم توفر التطبيق يرجى تواصل مع الدعم للحصول على نسختك");
      }

      setCurrentUser(user);
      if (rememberMe) {
        localStorage.setItem('currentUser', JSON.stringify(user));
      }
    } catch (err: any) {
      if (err.code === 'BIND_REQUIRED') {
        setPendingBind({ ...err.details, password, rememberMe });
        setBindModalOpen(true);
        return;
      }
      setLoginError(err.message || "بيانات الدخول غير صحيحة");
    }
  };

  const handleConfirmBind = async () => {
    if (!pendingBind) return;
    try {
      setLoading(true);
      await bindDevice(pendingBind.emp_id, pendingBind.device_uuid, pendingBind.device_model);
      setBindModalOpen(false);
      // Auto-login after bind
      await handleLogin(pendingBind.emp_id, pendingBind.password, pendingBind.rememberMe);
      alert("تم ربط الجهاز بنجاح ✅");
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);

    setActiveTab('dashboard');
    setLoginError(null);
    localStorage.removeItem('currentUser');
  };





  // Location Handlers
  const handleAddLocation = (loc: LocationConfig) => {
    setLocations([...locations, loc]);
  };

  const handleDeleteLocation = (id: string) => {
    setLocations(locations.filter(l => l.id !== id));
  };

  const handleSelectAllDevices = () => {
    if (selectedDeviceSns.length === 0) {
      setSelectedDeviceSns(devices.map(d => d.sn));
    } else {
      setSelectedDeviceSns([]);
    }
  };

  useEffect(() => {
    setLatestPage(1);
  }, [selectedDeviceSns]);

  const loadAllDeviceEmployees = async () => {
    try {
      setModalLoading(true);
      const results = await Promise.all(
        devices.map(async (d) => {
          try {
            const arr = await fetchDeviceEmployees(d.sn);
            return { sn: d.sn, alias: d.alias, arr };
          } catch {
            return { sn: d.sn, alias: d.alias, arr: [] };
          }
        })
      );
      const map: Record<string, { name: string; devices: string[] }> = {};
      results.forEach((r) => {
        r.arr.forEach((e) => {
          if (map[e.empCode]) {
            if (!map[e.empCode].devices.includes(r.alias || r.sn)) {
              map[e.empCode].devices.push(r.alias || r.sn);
            }
          } else {
            map[e.empCode] = { name: e.empName, devices: [r.alias || r.sn] };
          }
        });
      });
      setEmployeesIndex(map);
    } finally {
      setModalLoading(false);
    }
  };

  const loadAllEmployeesRoster = async () => {
    try {
      setModalLoading(true);
      const arr = await fetchAllEmployees();
      const map: Record<string, { name: string; devices: string[] }> = {};
      arr.forEach((e) => {
        if (!map[e.code]) {
          map[e.code] = { name: e.name, devices: [] };
        }
      });
      setEmployeesIndex(map);
    } finally {
      setModalLoading(false);
    }
  };

  const openStatsModal = async (type: 'TOTAL' | 'PRESENT' | 'LATE' | 'ABSENT') => {
    setStatsModalType(type);
    setStatsModalOpen(true);
    setModalPage(1);
    if (type === 'TOTAL' || type === 'ABSENT') {
      await loadAllEmployeesRoster();
    }
  };

  const closeStatsModal = () => {
    setStatsModalOpen(false);
  };

  // Main Render Wrapper for Dark Mode
  return (
    <div className={isDarkMode ? 'dark' : ''}>
      <div className="min-h-screen liquid-bg text-slate-900 dark:text-slate-100 transition-colors duration-300 font-sans">

        {!currentUser ? (
          <div className="relative">
            {loginError && (
              <div className="absolute top-4 left-0 right-0 z-50 flex justify-center animate-bounce">
                <div className="bg-red-500/90 backdrop-blur text-white px-6 py-3 rounded-full shadow-lg flex items-center gap-2 text-sm font-bold border border-red-400">
                  <AlertTriangle size={18} />
                  {loginError}
                </div>
              </div>
            )}
            <LoginScreen onLogin={handleLogin} />

            {/* Device Binding Confirmation Modal */}
            {bindModalOpen && (
              <div className="absolute inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
                <div className="bg-[#0f172a] border border-blue-500/30 rounded-3xl p-6 max-w-sm w-full shadow-2xl relative overflow-hidden text-center">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-purple-500"></div>

                  <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-blue-500/20">
                    <ShieldCheck size={32} className="text-blue-400" />
                  </div>

                  <h3 className="text-xl font-bold text-white mb-2">ربط جهاز جديد</h3>
                  <p className="text-slate-400 text-sm mb-6 leading-relaxed">
                    هذا الجهاز غير مرتبط بحسابك. هل أنت متأكد من رغبتك في ربط الحساب بهذا الجهاز؟
                    <br />
                    <span className="text-yellow-500/80 text-xs mt-2 block">ملاحظة: لن تتمكن من الدخول من جهاز آخر بعد الموافقة.</span>
                  </p>

                  <div className="flex gap-3">
                    <button
                      onClick={handleConfirmBind}
                      disabled={loading}
                      className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-colors shadow-lg shadow-blue-500/20"
                    >
                      {loading ? 'جاري الربط...' : 'نعم، اربط الجهاز'}
                    </button>
                    <button
                      onClick={() => setBindModalOpen(false)}
                      className="px-4 py-3 bg-slate-800 text-slate-400 hover:text-white rounded-xl transition-colors border border-slate-700"
                    >
                      إلغاء
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : currentUser.role === 'EMPLOYEE' ? (
          <EmployeePortal
            user={currentUser}
            onLogout={handleLogout}
            isDarkMode={isDarkMode}
            toggleTheme={toggleTheme}
          />
        ) : (
          <Layout
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onLogout={handleLogout}
            isDarkMode={isDarkMode}
            toggleTheme={toggleTheme}
            user={currentUser!}
          >
            {statsModalOpen && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeStatsModal} />
                <div className="relative liquid-glass rounded-2xl shadow-xl w-full max-w-2xl">
                  <div className="p-5 border-b border-white/10 flex items-center justify-between">
                    <h3 className="font-bold text-lg text-white">
                      {statsModalType === 'TOTAL' && 'جميع الموظفين'}
                      {statsModalType === 'PRESENT' && 'المتواجدون اليوم'}
                      {statsModalType === 'LATE' && 'المتأخرون اليوم'}
                      {statsModalType === 'ABSENT' && 'غير الحاضرين اليوم'}
                    </h3>
                    <button onClick={closeStatsModal} className="px-3 py-1 rounded-lg bg-white/10 text-white hover:bg-white/20">إغلاق</button>
                  </div>
                  <div className="p-5 max-h-[60vh] overflow-y-auto">
                    {modalLoading ? (
                      <div className="text-center text-slate-400">جاري التحميل...</div>
                    ) : (
                      <table className="w-full text-right border-collapse">
                        <thead>
                          <tr className="bg-white/5 text-slate-400 text-xs border-y border-white/10">
                            <th className="p-3">المعرف</th>
                            <th className="p-3">الموظف</th>
                            <th className="p-3">الجهاز/المصدر</th>
                            <th className="p-3">الوقت</th>
                          </tr>
                        </thead>
                        <tbody className="text-sm">
                          {(() => {
                            const todayStr = new Date().toDateString();
                            const todays = logs.filter(l => new Date(l.timestamp).toDateString() === todayStr);
                            const presentMap = new Map<string, AttendanceRecord>();
                            todays.forEach(l => {
                              if (l.type === 'CHECK_IN' && !presentMap.has(l.employeeId)) presentMap.set(l.employeeId, l);
                            });
                            const pageSize = 10;
                            const toRows: { id: string; name: string; device?: string; time?: string }[] = [];
                            if (statsModalType === 'PRESENT') {
                              const arr = Array.from(presentMap.values()).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
                              arr.forEach(l => toRows.push({ id: l.employeeId, name: l.employeeName, device: l.deviceAlias || l.deviceSn || (l.method as any), time: new Date(l.timestamp).toLocaleTimeString('ar-SA-u-ca-gregory') }));
                            } else if (statsModalType === 'LATE') {
                              const arr = todays.filter(l => l.type === 'CHECK_IN' && l.status === 'LATE').sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
                              arr.forEach(l => toRows.push({ id: l.employeeId, name: l.employeeName, device: l.deviceAlias || l.deviceSn || (l.method as any), time: new Date(l.timestamp).toLocaleTimeString('ar-SA-u-ca-gregory') }));
                            } else if (statsModalType === 'TOTAL') {
                              const arr = Object.entries(employeesIndex);
                              arr.forEach(([code, info]) => toRows.push({ id: code, name: info.name, device: (info.devices && info.devices[0]) || '-' }));
                            } else if (statsModalType === 'ABSENT') {
                              const presentIds = new Set(Array.from(presentMap.keys()));
                              const arr = Object.entries(employeesIndex).filter(([code]) => !presentIds.has(code));
                              arr.forEach(([code, info]) => toRows.push({ id: code, name: info.name, device: (info.devices && info.devices[0]) || '-' }));
                            }
                            const start = (modalPage - 1) * pageSize;
                            const end = start + pageSize;
                            return toRows.slice(start, end).map((r, i) => (
                              <tr key={r.id + i} className="hover:bg-white/5 border-b border-white/10 transition-colors">
                                <td className="p-3 text-slate-400 font-mono text-xs">{r.id}</td>
                                <td className="p-3 font-bold text-white">{r.name}</td>
                                <td className="p-3 text-slate-400 text-xs">{r.device || '-'}</td>
                                <td className="p-3 text-slate-400 font-mono text-xs" dir="ltr">{r.time || '--'}</td>
                              </tr>
                            ));
                          })()}
                        </tbody>
                      </table>
                    )}
                  </div>
                  <div className="p-4 border-t border-white/10 flex items-center justify-between text-xs text-slate-400">
                    <span>صفحة {modalPage}</span>
                    <div className="flex items-center gap-2">
                      <button className="px-2 py-1 rounded-lg border border-white/10 hover:bg-white/10" onClick={() => setModalPage(p => Math.max(1, p - 1))}>السابق</button>
                      <button className="px-2 py-1 rounded-lg border border-white/10 hover:bg-white/10" onClick={() => setModalPage(p => p + 1)}>التالي</button>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {activeTab === 'dashboard' && (
              <ModernDashboard
                stats={stats}
                logs={logs}
                devices={devices}
                loading={loading}
                lastUpdatedAt={lastUpdatedAt}
                onRefresh={loadData}
                onOpenStatsModal={openStatsModal}
                isDarkMode={isDarkMode}
              />
            )}
            {/* صفحة إدارة المواقع معطلة مؤقتًا */}
            {activeTab === 'reports' && <Reports logs={logs} devices={devices} />}
            {/* صفحة اختبار GPS معطلة مؤقتًا */}
            {activeTab === 'logs' && (
              <div className="space-y-6 relative z-10 animate-fade-in pb-20">

                {/* Header & Controls */}
                <div className="bg-slate-900/80 backdrop-blur-2xl p-6 rounded-3xl border border-white/10 shadow-2xl relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 opacity-80" />

                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8">
                    <div>
                      <h2 className="text-2xl font-black text-white flex items-center gap-3">
                        <div className="p-3 bg-emerald-500/10 rounded-2xl backdrop-blur-sm border border-emerald-500/20 text-emerald-400">
                          <CheckCircle size={24} />
                        </div>
                        سجل الحركات الكامل
                      </h2>
                      <p className="text-slate-400 text-sm font-medium mt-2 mr-14">
                        عرض وتصفية جميع حركات الدخول والخروج المسجلة في النظام
                      </p>
                    </div>
                    <div className="bg-emerald-900/20 px-4 py-2 rounded-xl border border-emerald-500/20 flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-xs font-bold text-emerald-400">تم التحديث: {lastUpdatedAt ? lastUpdatedAt.toLocaleTimeString('ar-SA') : '-'}</span>
                    </div>
                  </div>

                  {/* Filters Toolbar */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end bg-slate-800/50 p-4 rounded-2xl border border-slate-700/50">

                    {/* Search */}
                    <div className="md:col-span-4">
                      <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-wider">بحث عن موظف</label>
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="اسم الموظف أو الرقم الوظيفي..."
                          value={logSearchTerm}
                          onChange={(e) => setLogSearchTerm(e.target.value)}
                          className="w-full pl-3 pr-10 py-2.5 border border-slate-700 bg-slate-900 text-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none text-sm font-medium transition-all shadow-sm"
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                          <UsersIcon size={16} />
                        </div>
                      </div>
                    </div>

                    {/* Date Range */}
                    <div className="md:col-span-4 grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-wider">من</label>
                        <input
                          type="date"
                          value={logStartDate}
                          onChange={(e) => setLogStartDate(e.target.value)}
                          className="w-full px-3 py-2.5 border border-slate-700 bg-slate-900 text-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none text-sm font-medium transition-all shadow-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-wider">إلى</label>
                        <input
                          type="date"
                          value={logEndDate}
                          onChange={(e) => setLogEndDate(e.target.value)}
                          className="w-full px-3 py-2.5 border border-slate-700 bg-slate-900 text-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none text-sm font-medium transition-all shadow-sm"
                        />
                      </div>
                    </div>

                    {/* Type Filter */}
                    <div className="md:col-span-4">
                      <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-wider">نوع الحركة</label>
                      <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-700 shadow-sm">
                        <button onClick={() => setLogFilterType('ALL')} className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${logFilterType === 'ALL' ? 'bg-slate-800 text-white' : 'text-slate-400'}`}>الكل</button>
                        <button onClick={() => setLogFilterType('CHECK_IN')} className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${logFilterType === 'CHECK_IN' ? 'bg-emerald-900/30 text-emerald-400' : 'text-slate-400'}`}>دخول</button>
                        <button onClick={() => setLogFilterType('CHECK_OUT')} className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${logFilterType === 'CHECK_OUT' ? 'bg-rose-900/30 text-rose-400' : 'text-slate-400'}`}>خروج</button>
                      </div>
                    </div>

                  </div>
                </div>

                {/* Main Table */}
                <div className="bg-slate-900/70 backdrop-blur-3xl rounded-3xl border border-slate-800 shadow-xl overflow-hidden min-h-[500px]">
                  {dataError ? (
                    <div className="flex flex-col items-center justify-center h-[400px] text-center px-4">
                      <div className="p-4 bg-red-900/10 rounded-full text-red-500 mb-4 animate-bounce">
                        <AlertTriangle size={32} />
                      </div>
                      <h3 className="text-xl font-bold text-white mb-2">حدث خطأ في تحميل البيانات</h3>
                      <p className="text-slate-500">{dataError}</p>
                    </div>
                  ) : filteredLogs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-[400px] text-center px-4">
                      <div className="p-6 bg-slate-800 rounded-full text-slate-600 mb-4">
                        <WifiOff size={48} strokeWidth={1.5} />
                      </div>
                      <h3 className="text-lg font-bold text-slate-300 mb-2">لا توجد سجلات مطابقة</h3>
                      <p className="text-slate-400 text-sm max-w-sm">لم يتم العثور على أي حركات تطابق معايير البحث او الفلترة الحالية. جرب تغيير التاريخ او البحث.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-right border-collapse">
                        <thead>
                          <tr className="bg-slate-800/80 text-slate-400 text-[11px] border-b border-slate-700 uppercase tracking-wider backdrop-blur-sm sticky top-0 z-10">
                            <th className="p-2 md:p-5 font-bold">الموظف</th>
                            <th className="p-2 md:p-5 font-bold">التاريخ والوقت</th>
                            <th className="p-2 md:p-5 font-bold">النوع</th>
                            <th className="p-2 md:p-5 font-bold hidden md:table-cell">المصدر</th>
                            <th className="p-2 md:p-5 font-bold hidden md:table-cell">الحالة</th>
                            <th className="p-2 md:p-5 font-bold">الموقع / الجهاز</th>
                          </tr>
                        </thead>
                        <tbody className="text-sm divide-y divide-slate-800/50">
                          {filteredLogs.slice(0, 100).map((log) => (
                            <tr
                              key={log.id}
                              onClick={() => setSelectedEmployeeId(log.employeeId)}
                              className="group hover:bg-emerald-900/10 transition-colors duration-200 cursor-pointer"
                            >
                              <td className="p-2 md:p-5">
                                <div className="flex items-center gap-2 md:gap-4">
                                  <div className="w-8 h-8 md:w-10 md:h-10 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-600 flex items-center justify-center text-xs md:text-sm font-black text-slate-400 shadow-inner group-hover:scale-110 transition-transform">
                                    {log.employeeName.charAt(0)}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="font-bold text-white group-hover:text-emerald-400 transition-colors text-xs md:text-base truncate max-w-[80px] md:max-w-none">{log.employeeName}</div>
                                    <div className="text-[9px] md:text-xs text-slate-400 font-mono mt-0.5 bg-slate-800 px-1.5 py-0.5 rounded w-fit hidden md:block">{log.employeeId}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="p-2 md:p-5 text-slate-400" dir="ltr">
                                <div className="flex flex-col items-end">
                                  <span className="font-mono text-[10px] md:text-sm font-bold text-white">{new Date(log.timestamp).toLocaleTimeString('ar-SA-u-ca-gregory')}</span>
                                  <span className="text-[9px] md:text-[11px] text-slate-400 mt-0 md:mt-0.5">{new Date(log.timestamp).toLocaleDateString('ar-SA-u-ca-gregory')}</span>
                                </div>
                              </td>
                              <td className="p-2 md:p-5">
                                {(() => {
                                  let label = 'غير معروف';
                                  let colorClass = 'bg-slate-500/10 text-slate-400 border-slate-500/20';
                                  let dotClass = 'bg-slate-500';

                                  switch (log.type) {
                                    case 'CHECK_IN':
                                      label = 'دخول';
                                      colorClass = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
                                      dotClass = 'bg-emerald-500';
                                      break;
                                    case 'CHECK_OUT':
                                      label = 'خروج';
                                      colorClass = 'bg-rose-500/10 text-rose-400 border-rose-500/20';
                                      dotClass = 'bg-rose-500';
                                      break;
                                    case 'BREAK_IN':
                                      label = 'عودة'; // Shortened
                                      colorClass = 'bg-blue-500/10 text-blue-400 border-blue-500/20';
                                      dotClass = 'bg-blue-500';
                                      break;
                                    case 'BREAK_OUT':
                                      label = 'استراحة'; // Shortened
                                      colorClass = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
                                      dotClass = 'bg-amber-500';
                                      break;
                                  }

                                  return (
                                    <span className={`px-2 py-1 md:px-3 md:py-1.5 rounded-lg text-[9px] md:text-xs font-bold border flex items-center gap-1 md:gap-2 w-fit whitespace-nowrap ${colorClass}`}>
                                      <div className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
                                      {label}
                                    </span>
                                  );
                                })()}
                              </td>
                              <td className="p-2 md:p-5 hidden md:table-cell">
                                <span className="text-xs font-semibold text-slate-400 bg-slate-800/80 px-2.5 py-1.5 rounded-lg border border-slate-700">
                                  {log.method}
                                </span>
                              </td>
                              <td className="p-2 md:p-5 hidden md:table-cell">
                                {log.status === 'LATE' && (
                                  <div className="flex items-center gap-1.5 text-amber-400 bg-amber-900/20 px-3 py-1.5 rounded-lg border border-amber-900/30 w-fit">
                                    <AlertTriangle size={14} />
                                    <span className="text-xs font-bold">متأخر</span>
                                  </div>
                                )}
                                {log.status === 'ON_TIME' && (
                                  <div className="flex items-center gap-1.5 text-emerald-400 bg-emerald-900/20 px-3 py-1.5 rounded-lg border border-emerald-900/30 w-fit">
                                    <CheckCircle size={14} />
                                    <span className="text-xs font-bold">منتظم</span>
                                  </div>
                                )}
                              </td>
                              <td className="p-2 md:p-5">
                                <span className="text-[9px] md:text-xs text-slate-400 truncate max-w-[80px] md:max-w-[200px] block" title={log.location?.address}>
                                  {(() => {
                                    // 👑 VIP Rule: Faisal + Web/Mobile => Administration
                                    if (log.employeeName &&
                                      (log.employeeName.toLowerCase().includes('faisal') || log.employeeName.includes('فيصل')) &&
                                      (log.deviceSn === 'Web' || log.deviceSn === 'Manual-Web' || log.deviceAlias === 'الجوال')) {
                                      return 'الإدارة';
                                    }
                                    // Default Logic
                                    const locText = log.deviceAlias || (log.deviceSn ? (log.deviceSn === 'Web' ? 'الجوال' : `${log.deviceSn}`) : (log.location ? (log.location.address || `${log.location.lat.toFixed(4)}...`) : '-'));

                                    return (
                                      <div className="flex items-center gap-2">
                                        <span>{locText}</span>
                                        {log.location && log.location.lat !== 0 && (
                                          <a
                                            href={`https://www.google.com/maps?q=${log.location.lat},${log.location.lng}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="p-1 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-full transition-colors"
                                            title="عرض الموقع على الخريطة"
                                            onClick={(e) => e.stopPropagation()} // Prevent row click
                                          >
                                            <MapPin size={12} />
                                          </a>
                                        )}
                                      </div>
                                    );
                                  })()}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {filteredLogs.length > 100 && (
                        <div className="p-4 text-center text-xs text-slate-400 border-t border-slate-800">
                          يتم عرض آخر 100 نتيجة فقط من أصل {filteredLogs.length} لتحسين الأداء
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
            {activeTab === 'settings' && (
              <DeviceManager onDevicesUpdated={setDevices} />
            )}


            {activeTab === 'mobile_punch' && currentUser && (
              <MobilePunch currentUser={currentUser} locations={locations} />
            )}

            {activeTab === 'locations' && <LocationManager />}

            {activeTab === 'employees' && <Employees />}

            {selectedEmployeeId && (
              <EmployeeProfileModal
                employeeId={selectedEmployeeId}
                logs={logs}
                onClose={() => setSelectedEmployeeId(null)}
              />
            )}
          </Layout>
        )}
      </div>
    </div>
  );
};

// ... existing imports

// Employee Profile Modal Component
const EmployeeProfileModal: React.FC<{
  employeeId: string;
  logs: AttendanceRecord[];
  onClose: () => void;
}> = ({ employeeId, logs: initialLogs, onClose }) => {
  // State
  const [searchTerm, setSearchTerm] = useState('');

  // Date State
  // Default to First Day of Current Month to Today
  const [startDate, setStartDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toLocaleDateString('en-CA');
  });
  const [endDate, setEndDate] = useState(new Date().toLocaleDateString('en-CA'));

  const [filterType, setFilterType] = useState<'ALL' | 'CHECK_IN' | 'CHECK_OUT' | 'ABSENT'>('ALL');
  const [fetchedLogs, setFetchedLogs] = useState<AttendanceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // 1. Fetch Logs on Mount or Date Change
  useEffect(() => {
    const loadProfileLogs = async () => {
      setIsLoading(true);
      try {
        const start = new Date(startDate);
        const end = new Date(endDate);
        // Fix: Set end date to end of day to include logs on that day
        end.setHours(23, 59, 59, 999);

        const data = await fetchEmployeeLogs(employeeId, start, end);
        setFetchedLogs(data);
      } catch (e) {
        console.error("Failed to load employee profile logs", e);
      } finally {
        setIsLoading(false);
      }
    };

    const timer = setTimeout(loadProfileLogs, 300); // Debounce slightly
    return () => clearTimeout(timer);
  }, [employeeId, startDate, endDate]);

  // Use fetched logs for display
  const displayLogs = fetchedLogs;
  const employeeName = displayLogs[0]?.employeeName || initialLogs.find(l => l.employeeId === employeeId)?.employeeName || 'Unknown';

  // 2. Generate Timeline Data (Logs + Absences)
  const timelineData = useMemo(() => {
    const data: { id: string, type: string, timestamp: Date, method?: string, location?: any, status?: string }[] = [];
    const dateSet = new Set<string>();

    // Add existing logs
    displayLogs.forEach(l => {
      const d = new Date(l.timestamp);
      const dateStr = d.toLocaleDateString('en-CA'); // Local YYYY-MM-DD
      if (dateStr >= startDate && dateStr <= endDate) {
        if (filterType === 'ALL' || filterType === l.type) {
          data.push({ ...l, timestamp: d });
        }
        dateSet.add(dateStr);
      }
    });

    // Generate Absences
    if (filterType === 'ALL' || filterType === 'ABSENT') {
      const start = new Date(startDate);
      const end = new Date(endDate);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const day = d.getDay();
        if (day === 5 || day === 6) continue;
        if (d > new Date()) continue;

        const dateStr = d.toLocaleDateString('en-CA');
        if (!dateSet.has(dateStr)) {
          data.push({
            id: `absent-${dateStr}`,
            type: 'ABSENT',
            timestamp: new Date(d),
            status: 'ABSENT'
          });
        }
      }
    }

    // Sort by timestamp descending
    return data.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  }, [displayLogs, startDate, endDate, filterType]);

  // 3. Apply Search Filter
  const filteredTimeline = timelineData.filter(item => {
    const dateStr = item.timestamp.toLocaleDateString('ar-SA-u-ca-gregory');
    const matchesSearch =
      item.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
      dateStr.includes(searchTerm);

    // If filterType is specific, we already filtered in step 2, but double check
    if (filterType !== 'ALL' && item.type !== filterType) return false;

    return matchesSearch;
  });

  // Calculate Stats
  const totalLogs = displayLogs.length;
  const lateCount = displayLogs.filter(l => l.status === 'LATE').length;
  const presentDays = new Set(displayLogs.map(l => new Date(l.timestamp).toDateString())).size;
  const absenceCount = timelineData.filter(l => l.type === 'ABSENT').length; // Correct count for selected range

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Custom Scrollbar Styles */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #475569; }
      `}</style>

      <div className="relative bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-fade-in border border-white/10 dark:border-slate-800">

        {/* Header */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-white/50 dark:bg-slate-800/50 backdrop-blur-xl shrink-0">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-5">
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-3xl font-black text-white shadow-lg shadow-blue-500/30">
                {employeeName.charAt(0)}
              </div>
              <div>
                <h2 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight">{employeeName}</h2>
                <div className="flex items-center gap-2 mt-2">
                  <span className="bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-3 py-1 rounded-lg text-sm font-mono border border-slate-200 dark:border-slate-700">{employeeId}</span>
                  <span className="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 px-3 py-1 rounded-lg text-xs font-bold border border-emerald-100 dark:border-emerald-900/30">نشط</span>
                </div>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-slate-400">
              <XCircle size={24} />
            </button>
          </div>

          <div className="grid grid-cols-4 gap-4 mt-8">
            <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-700/50">
              <div className="text-slate-400 text-xs font-bold mb-1">أيام الحضور (الكلي)</div>
              <div className="text-2xl font-black text-slate-800 dark:text-white">{presentDays} <span className="text-xs text-slate-400 font-normal">يوم</span></div>
            </div>
            <div className="bg-red-50 dark:bg-red-900/10 p-4 rounded-2xl border border-red-100 dark:border-red-900/20">
              <div className="text-red-400 text-xs font-bold mb-1">مرات التأخير (الكلي)</div>
              <div className="text-2xl font-black text-red-600 dark:text-red-400">{lateCount} <span className="text-xs text-red-400/70 font-normal">مرة</span></div>
            </div>
            <div className="bg-amber-50 dark:bg-amber-900/10 p-4 rounded-2xl border border-amber-100 dark:border-amber-900/20">
              <div className="text-amber-400 text-xs font-bold mb-1">الغيابات (في الفترة)</div>
              <div className="text-2xl font-black text-amber-600 dark:text-amber-400">{absenceCount} <span className="text-xs text-amber-400/70 font-normal">يوم</span></div>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/10 p-4 rounded-2xl border border-blue-100 dark:border-blue-900/20">
              <div className="text-blue-400 text-xs font-bold mb-1">إجمالي الحركات</div>
              <div className="text-2xl font-black text-blue-600 dark:text-blue-400">{totalLogs}</div>
            </div>
          </div>
        </div>

        {/* Filters & Toolbar */}
        <div className="p-4 bg-slate-50/50 dark:bg-slate-800/30 border-b border-slate-100 dark:border-slate-800 grid grid-cols-1 md:grid-cols-12 gap-4 shrink-0">

          {/* Search */}
          <div className="md:col-span-4 relative">
            <input
              type="text"
              placeholder="بحث في السجل..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none"
            />
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <RefreshCw size={14} className={isLoading ? 'animate-spin text-blue-500' : ''} />
            </div>
          </div>

          {/* Date Range */}
          <div className="md:col-span-4 flex gap-2">
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full px-3 py-2.5 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-sm outline-none dark:text-white" />
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full px-3 py-2.5 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-sm outline-none dark:text-white" />
          </div>

          {/* Type Filter Tabs */}
          <div className="md:col-span-4 flex bg-white dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
            <button onClick={() => setFilterType('ALL')} className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${filterType === 'ALL' ? 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-400'}`}>الكل</button>
            <button onClick={() => setFilterType('CHECK_IN')} className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${filterType === 'CHECK_IN' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-slate-400'}`}>دخول</button>
            <button onClick={() => setFilterType('CHECK_OUT')} className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${filterType === 'CHECK_OUT' ? 'bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 shadow-sm' : 'text-slate-400'}`}>خروج</button>
            <button onClick={() => setFilterType('ABSENT')} className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${filterType === 'ABSENT' ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 shadow-sm' : 'text-slate-400'}`}>غياب</button>
          </div>
        </div>

        {/* Timeline Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/30 dark:bg-[#0f172a]/50 custom-scrollbar">
          {isLoading && filteredTimeline.length === 0 ? (
            <div className="flex items-center justify-center h-full flex-col gap-3 py-10">
              <RefreshCw className="animate-spin text-blue-500 w-8 h-8" />
              <span className="text-slate-400 font-bold">جاري تحميل السجلات من الخادم...</span>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredTimeline.map((item, idx) => (
                <div key={item.id + idx} className="relative pl-8 pb-8 group last:pb-0">
                  {/* Timeline Line */}
                  <div className="absolute left-[11px] top-8 bottom-0 w-0.5 bg-slate-200 dark:bg-slate-800 group-last:hidden" />

                  {/* Timeline Dot */}
                  <div className={`absolute left-0 top-1.5 w-6 h-6 rounded-full border-4 border-white dark:border-slate-900 flex items-center justify-center ${item.type === 'CHECK_IN' ? 'bg-emerald-500' :
                    item.type === 'CHECK_OUT' ? 'bg-rose-500' :
                      'bg-amber-500' // Absent
                    }`}>
                  </div>

                  <div className={`p-5 rounded-2xl shadow-sm border transition-shadow group-hover:shadow-md ${item.type === 'ABSENT'
                    ? 'bg-amber-50/50 dark:bg-amber-900/5 border-amber-100 dark:border-amber-900/20'
                    : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700'
                    }`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${item.type === 'CHECK_IN' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' :
                          item.type === 'CHECK_OUT' ? 'bg-rose-50 dark:bg-red-900/20 text-rose-600 dark:text-rose-400' :
                            'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
                          }`}>
                          {item.type === 'CHECK_IN' ? 'تسجيل دخول' : item.type === 'CHECK_OUT' ? 'تسجيل خروج' : 'غياب'}
                        </span>
                        <span className="text-xs text-slate-400 font-mono">{item.timestamp.toLocaleDateString('ar-SA-u-ca-gregory')}</span>
                      </div>
                      <div className="font-mono text-lg font-black text-slate-700 dark:text-white">
                        {item.type === 'ABSENT' ? '--:--' : item.timestamp.toLocaleTimeString('ar-SA-u-ca-gregory')}
                      </div>
                    </div>

                    <div className="flex flex-col gap-1 text-sm text-slate-500 dark:text-slate-400">
                      {item.type !== 'ABSENT' && (
                        <>
                          <div className="flex items-center gap-2">
                            <span className="w-4 h-4 flex items-center justify-center text-slate-300"><UsersIcon size={12} /></span>
                            <span>{item.method || '-'}</span>
                          </div>
                          {item.location && (
                            <div className="flex items-center gap-2">
                              <span className="w-4 h-4 flex items-center justify-center text-slate-300"><AlertTriangle size={12} /></span>
                              <span className="truncate">{item.location.address || `${item.location.lat}, ${item.location.lng}`}</span>
                            </div>
                          )}
                          {item.status === 'LATE' && (
                            <div className="mt-2 text-amber-600 bg-amber-50 dark:bg-amber-900/20 p-2 rounded-lg text-xs font-bold flex items-center gap-2 w-fit">
                              <AlertTriangle size={14} />
                              تم تسجيل تأخير
                            </div>
                          )}
                        </>
                      )}
                      {item.type === 'ABSENT' && (
                        <div className="flex items-center gap-2 text-amber-600/70 dark:text-amber-400/70 italic text-xs">
                          <AlertTriangle size={12} />
                          لم يتم تسجيل أي حركة في هذا اليوم
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {filteredTimeline.length === 0 && (
                <div className="text-center py-10 text-slate-400">
                  لا توجد سجلات مطابقة للبحث
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};


const StatCard: React.FC<{ title: string, value: number, icon: React.ReactNode, color: string, bg: string, border: string, onClick?: () => void }> = ({ title, value, icon, color, bg, border, onClick }) => (
  <button type="button" onClick={onClick} className={`bg-white dark:bg-[#1e293b] p-5 rounded-2xl shadow-sm border ${border} flex items-center justify-between transition-all hover:translate-y-[-2px] hover:shadow-md group cursor-pointer focus:ring-2 focus:ring-blue-500/40 outline-none w-full text-right`}>
    <div>
      <p className="text-slate-500 dark:text-slate-400 text-xs font-bold mb-1 tracking-wide">{title}</p>
      <h3 className="text-3xl font-extrabold text-slate-800 dark:text-white tracking-tight">{value}</h3>
    </div>
    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${bg} ${color} transition-transform group-hover:scale-110 group-hover:rotate-3`}>
      {icon}
    </div>
  </button>
);

export default App;
