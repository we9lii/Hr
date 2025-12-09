import React, { useState, useEffect } from 'react';
import Layout from './components/Layout';
import { fetchAttendanceLogs, loginUser, fetchDevices, fetchEmployeeCount, fetchDeviceEmployees, fetchAllEmployees } from './services/api';

// GPSAttendance page disabled temporarily
import EmployeePortal from './components/EmployeePortal';
import LoginScreen from './components/LoginScreen';
// LocationManager page disabled temporarily
import Reports from './components/Reports';
import { AttendanceRecord, DashboardStats, User, UserRole, LocationConfig, Device } from './types';
import { getStats } from './services/api';
import { Clock, CheckCircle, XCircle, RefreshCw, Users as UsersIcon, Sparkles, WifiOff, AlertTriangle, ArrowUpRight } from 'lucide-react';
import ModernDashboard from './components/ModernDashboard';
import DeviceManager from './components/DeviceManager';

const App: React.FC = () => {
  // Auth State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Theme State
  const [isDarkMode, setIsDarkMode] = useState(false);

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
  const [locations, setLocations] = useState<LocationConfig[]>([
    { id: '1', name: 'المقر الرئيسي', lat: 24.7136, lng: 46.6753, radius: 200, active: true }
  ]);

  // Initialization: Enforce Dark Mode & Auto Login
  useEffect(() => {
    // 1. Force Dark Mode
    setIsDarkMode(true);
    document.documentElement.classList.add('dark');
    localStorage.setItem('theme', 'dark'); // Persist just in case other tabs/logic read it

    // 2. Auto Login
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
      try {
        setCurrentUser(JSON.parse(savedUser));
      } catch (e) {
        localStorage.removeItem('currentUser');
      }
    }
  }, []);

  // Removed toggleTheme - System is Force Dark
  const toggleTheme = () => { }; // No-op to keep prop stability if needed strictly, or verify usage.

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

  const handleLogin = async (username: string, password: string, role: UserRole, rememberMe: boolean) => {
    setLoginError(null);
    try {
      const user = await loginUser(username, role, password);
      setCurrentUser(user);
      if (rememberMe) {
        localStorage.setItem('currentUser', JSON.stringify(user));
      }
    } catch (err: any) {
      setLoginError(err.message || "بيانات الدخول غير صحيحة");
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
              />
            )}
            {/* صفحة إدارة المواقع معطلة مؤقتًا */}
            {activeTab === 'reports' && <Reports logs={logs} devices={devices} />}
            {/* صفحة اختبار GPS معطلة مؤقتًا */}
            {activeTab === 'logs' && (
              <div className="liquid-glass p-6 rounded-2xl animate-fade-in min-h-[600px]">
                <h2 className="text-xl font-bold mb-6 flex items-center gap-2 text-white">
                  <CheckCircle className="text-emerald-400" />
                  سجل الحركات الكامل
                </h2>
                {dataError ? (
                  <div className="text-center text-red-500 py-10">
                    <AlertTriangle className="mx-auto mb-2" />
                    {dataError}
                  </div>
                ) : logs.length === 0 ? (
                  <div className="text-center text-slate-400 py-10">
                    <WifiOff className="mx-auto mb-2 opacity-50" />
                    لا توجد سجلات مستلمة.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-right border-collapse">
                      <thead>
                        <tr className="bg-white/5 text-slate-300 text-xs border-y border-white/10">
                          <th className="p-4">المعرف</th>
                          <th className="p-4">الموظف</th>
                          <th className="p-4">التاريخ والوقت</th>
                          <th className="p-4">العملية</th>
                          <th className="p-4">وسيلة التحقق</th>
                          <th className="p-4">الحالة</th>
                          <th className="p-4">الموقع</th>
                        </tr>
                      </thead>
                      <tbody className="text-sm">
                        {logs.map((log) => (
                          <tr key={log.id} className="hover:bg-white/5 border-b border-white/10 transition-colors">
                            <td className="p-4 text-slate-400 font-mono text-xs">{log.employeeId}</td>
                            <td className="p-4 font-bold text-white">{log.employeeName}</td>
                            <td className="p-4 text-slate-300 font-mono text-xs" dir="ltr">
                              {new Date(log.timestamp).toLocaleString('ar-SA-u-ca-gregory')}
                            </td>
                            <td className="p-4">
                              <span className={`px-2 py-1 rounded text-xs font-bold ${log.type === 'CHECK_IN' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                                {log.type === 'CHECK_IN' ? 'دخول' : 'خروج'}
                              </span>
                            </td>
                            <td className="p-4 text-slate-300">
                              <span className="flex items-center gap-1 text-xs bg-white/10 px-2 py-1 rounded w-fit">
                                {log.method}
                              </span>
                            </td>
                            <td className="p-4">
                              {log.status === 'LATE' && <span className="inline-flex items-center gap-1 text-amber-500 bg-amber-500/10 px-2 py-1 rounded border border-amber-500/20 text-xs font-bold"><AlertTriangle size={10} /> متأخر</span>}
                              {log.status === 'ON_TIME' && <span className="text-emerald-500 text-xs">--</span>}
                            </td>
                            <td className="p-4 text-xs text-slate-400 truncate max-w-[150px]">
                              {log.deviceAlias || (log.deviceSn ? `جهاز ${log.deviceSn}` : (log.location ? (log.location.address || `${log.location.lat.toFixed(3)}, ${log.location.lng.toFixed(3)}`) : '-'))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
            {activeTab === 'settings' && (
              <DeviceManager onDevicesUpdated={setDevices} />
            )}
          </Layout>
        )}
      </div>
    </div>
  );
};

// Polished Stat Card Component
const StatCard: React.FC<{ title: string, value: number, icon: React.ReactNode, color: string, bg: string, border: string, onClick?: () => void }> = ({ title, value, icon, color, bg, border, onClick }) => (
  <button type="button" onClick={onClick} className={`bg-white dark:bg-[#1e293b] p-5 rounded-2xl shadow-sm border ${border} flex items-center justify-between transition-all hover:translate-y-[-2px] hover:shadow-md group cursor-pointer focus:ring-2 focus:ring-blue-500/40 outline-none`}>
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
