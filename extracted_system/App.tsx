import React, { useState, useEffect } from 'react';
import Layout from './components/Layout';
import { fetchAttendanceLogs, loginUser } from './services/api'; 
import { analyzeAttendancePatterns, askAI } from './services/gemini';
import GPSAttendance from './components/GPSAttendance';
import EmployeePortal from './components/EmployeePortal'; 
import LoginScreen from './components/LoginScreen'; 
import LocationManager from './components/LocationManager'; 
import Reports from './components/Reports'; 
import { AttendanceRecord, DashboardStats, User, UserRole, LocationConfig } from './types';
import { getStats } from './services/api';
import { Clock, CheckCircle, XCircle, RefreshCw, Wand2, Users as UsersIcon, Send, Sparkles, WifiOff, AlertTriangle, ArrowUpRight } from 'lucide-react';

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
  
  // AI State
  const [aiAnalysis, setAiAnalysis] = useState<string>("");
  const [analyzing, setAnalyzing] = useState(false);
  const [customQuery, setCustomQuery] = useState("");
  const [queryLoading, setQueryLoading] = useState(false);

  // Location State
  const [locations, setLocations] = useState<LocationConfig[]>([
    { id: '1', name: 'المقر الرئيسي', lat: 24.7136, lng: 46.6753, radius: 200, active: true }
  ]);

  // Initialization: Theme, Auto-Login
  useEffect(() => {
    // 1. Load Theme
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        setIsDarkMode(true);
    }

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

  const toggleTheme = () => {
      const newMode = !isDarkMode;
      setIsDarkMode(newMode);
      localStorage.setItem('theme', newMode ? 'dark' : 'light');
  };

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
    } catch (err: any) {
      console.error(err);
      setLogs([]); // Clear logs on error
      setDataError("فشل الاتصال بالخادم. يرجى التأكد من تشغيل API والاتصال بالشبكة.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser?.role === 'ADMIN') {
        loadData();
    }
  }, [currentUser]);

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
      setAiAnalysis("");
      setCustomQuery("");
      setActiveTab('dashboard');
      setLoginError(null);
      localStorage.removeItem('currentUser');
  };

  const handleAiAnalysis = async () => {
    setAnalyzing(true);
    const result = await analyzeAttendancePatterns(logs, stats);
    setAiAnalysis(result);
    setAnalyzing(false);
  };

  const handleCustomAiQuery = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!customQuery.trim()) return;

      setQueryLoading(true);
      const result = await askAI(customQuery, logs, stats);
      setAiAnalysis(`❓ **سؤال:** ${customQuery}\n\n🤖 **الإجابة:** ${result}`);
      setCustomQuery("");
      setQueryLoading(false);
  };

  // Location Handlers
  const handleAddLocation = (loc: LocationConfig) => {
    setLocations([...locations, loc]);
  };

  const handleDeleteLocation = (id: string) => {
    setLocations(locations.filter(l => l.id !== id));
  };

  // Main Render Wrapper for Dark Mode
  return (
    <div className={isDarkMode ? 'dark' : ''}>
      <div className="min-h-screen bg-[#f8fafc] dark:bg-[#0b1121] text-slate-900 dark:text-slate-100 transition-colors duration-300 font-sans">
        
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
                {activeTab === 'dashboard' && (
                    <div className="space-y-6 animate-fade-in pb-8">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                            <StatCard 
                            title="إجمالي الموظفين" 
                            value={stats?.totalEmployees || 0} 
                            icon={<UsersIcon className="w-5 h-5"/>} 
                            color="text-blue-600 dark:text-blue-400"
                            bg="bg-blue-50 dark:bg-blue-900/10"
                            border="border-blue-100 dark:border-blue-900/30"
                            />
                            <StatCard 
                            title="حضور اليوم" 
                            value={stats?.presentToday || 0} 
                            icon={<CheckCircle className="w-5 h-5" />} 
                            color="text-green-600 dark:text-green-400"
                            bg="bg-green-50 dark:bg-green-900/10"
                            border="border-green-100 dark:border-green-900/30"
                            />
                            <StatCard 
                            title="متأخرين" 
                            value={stats?.lateToday || 0} 
                            icon={<Clock className="w-5 h-5"/>} 
                            color="text-amber-600 dark:text-amber-400"
                            bg="bg-amber-50 dark:bg-amber-900/10"
                            border="border-amber-100 dark:border-amber-900/30"
                            />
                            <StatCard 
                            title="غياب/إجازة" 
                            value={stats?.onLeave || 0} 
                            icon={<XCircle className="w-5 h-5"/>} 
                            color="text-red-600 dark:text-red-400"
                            bg="bg-red-50 dark:bg-red-900/10"
                            border="border-red-100 dark:border-red-900/30"
                            />
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Table Section */}
                            <div className="lg:col-span-2 bg-white dark:bg-[#1e293b] p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 min-h-[400px]">
                            <div className="flex justify-between items-center mb-6">
                                <div>
                                    <h3 className="font-bold text-lg text-slate-800 dark:text-white">آخر الحركات (Real-Time)</h3>
                                    <p className="text-xs text-slate-400 mt-1">يتم تحديث البيانات مباشرة من السيرفر</p>
                                </div>
                                <button onClick={loadData} className="p-2.5 bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition border border-slate-200 dark:border-slate-700">
                                <RefreshCw size={18} className={loading ? "animate-spin text-blue-500" : "text-slate-500 dark:text-slate-400"} />
                                </button>
                            </div>
                            
                            {dataError ? (
                                <div className="flex flex-col items-center justify-center h-64 text-center text-red-500">
                                    <div className="p-4 bg-red-50 dark:bg-red-900/10 rounded-full mb-3">
                                        <WifiOff size={32} className="opacity-70"/>
                                    </div>
                                    <p className="font-bold text-sm">{dataError}</p>
                                    <button onClick={loadData} className="mt-4 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold hover:bg-slate-50 transition">إعادة المحاولة</button>
                                </div>
                            ) : logs.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-64 text-center text-slate-400">
                                    <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-full mb-3">
                                        <Clock size={32} className="opacity-50"/>
                                    </div>
                                    <p className="text-sm">لا توجد بيانات للعرض.</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-right border-collapse">
                                    <thead>
                                        <tr className="text-slate-400 text-xs border-b border-slate-100 dark:border-slate-700/50">
                                        <th className="pb-3 pr-2 font-medium">الموظف</th>
                                        <th className="pb-3 font-medium">الوقت</th>
                                        <th className="pb-3 font-medium">النوع</th>
                                        <th className="pb-3 font-medium">الطريقة</th>
                                        <th className="pb-3 pl-2 font-medium">الحالة</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-sm">
                                        {logs.slice(0, 5).map((log) => (
                                        <tr key={log.id} className="group hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors border-b border-transparent hover:border-slate-100 dark:hover:border-slate-700/50 rounded-lg">
                                            <td className="py-3 pr-2 text-slate-700 dark:text-slate-200 font-bold">{log.employeeName}</td>
                                            <td className="py-3 text-slate-500 dark:text-slate-400 font-mono text-xs" dir="ltr">
                                            {new Date(log.timestamp).toLocaleTimeString('ar-SA-u-ca-gregory', {hour: '2-digit', minute:'2-digit'})}
                                            </td>
                                            <td className="py-3">
                                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${log.type === 'CHECK_IN' ? 'bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400 border border-green-100 dark:border-green-500/20' : 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-500/20'}`}>
                                                {log.type === 'CHECK_IN' ? 'دخول' : 'خروج'}
                                            </span>
                                            </td>
                                            <td className="py-3 text-slate-500 dark:text-slate-400 text-xs">{log.method}</td>
                                            <td className="py-3 pl-2">
                                            {log.status === 'LATE' && <span className="text-amber-600 dark:text-amber-500 font-bold text-[10px] flex items-center gap-1"><AlertTriangle size={10}/> متأخر</span>}
                                            {log.status === 'ON_TIME' && <span className="text-slate-300 dark:text-slate-600 text-[10px]">--</span>}
                                            </td>
                                        </tr>
                                        ))}
                                    </tbody>
                                    </table>
                                </div>
                            )}
                            </div>

                            {/* AI Assistant Section */}
                            <div className="bg-gradient-to-b from-purple-50 to-white dark:from-slate-800 dark:to-slate-900 p-6 rounded-2xl shadow-sm border border-purple-100 dark:border-slate-800 flex flex-col h-full relative overflow-hidden">
                            {/* Decorative blob */}
                            <div className="absolute -top-10 -left-10 w-32 h-32 bg-purple-400/10 rounded-full blur-3xl"></div>
                            
                            <div className="flex items-center gap-3 mb-4 relative z-10">
                                <div className="p-2.5 bg-white dark:bg-slate-800 rounded-xl shadow-sm text-purple-600 dark:text-purple-400 border border-purple-50 dark:border-purple-900/30">
                                    <Wand2 size={20}/>
                                </div>
                                <div>
                                    <h3 className="font-bold text-lg text-slate-800 dark:text-white">المساعد الذكي</h3>
                                    <div className="flex items-center gap-1.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                                        <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Gemini AI Active</p>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="flex-1 overflow-y-auto mb-4 min-h-[200px] max-h-[300px] text-sm custom-scrollbar relative z-10 pr-2">
                                {!aiAnalysis && !analyzing ? (
                                    <div className="text-center text-slate-400 py-10 flex flex-col items-center">
                                        <div className="w-12 h-12 rounded-full bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center mb-3">
                                            <Sparkles className="w-6 h-6 text-purple-400" />
                                        </div>
                                        <p className="text-xs mb-4">احصل على تحليل فوري للبيانات أو اسأل عن أي تفاصيل.</p>
                                        <button 
                                            onClick={handleAiAnalysis}
                                            disabled={logs.length === 0}
                                            className="px-4 py-2 bg-white dark:bg-slate-800 border border-purple-200 dark:border-purple-900/30 text-purple-600 dark:text-purple-400 rounded-lg text-xs font-bold hover:shadow-md transition-all active:scale-95 disabled:opacity-50"
                                        >
                                            إنشاء تقرير يومي شامل
                                        </button>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {analyzing && (
                                            <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400 text-xs font-medium animate-pulse bg-purple-50 dark:bg-purple-900/10 p-2 rounded-lg w-fit">
                                                <RefreshCw className="animate-spin w-3 h-3"/>
                                                <span>جاري التفكير وتحليل البيانات...</span>
                                            </div>
                                        )}
                                        {aiAnalysis && (
                                            <div className="prose prose-sm prose-purple dark:prose-invert max-w-none text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-line bg-white/60 dark:bg-slate-800/60 p-4 rounded-xl border border-purple-100 dark:border-purple-900/30 shadow-sm backdrop-blur-sm">
                                                {aiAnalysis}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <form onSubmit={handleCustomAiQuery} className="mt-auto relative z-10">
                                <input 
                                    type="text" 
                                    placeholder="اكتب سؤالك هنا... (مثلاً: من الأكثر غياباً؟)" 
                                    value={customQuery}
                                    onChange={(e) => setCustomQuery(e.target.value)}
                                    className="w-full pl-10 pr-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 outline-none text-sm transition-all text-slate-800 dark:text-white placeholder-slate-400 shadow-sm"
                                    disabled={queryLoading}
                                />
                                <button 
                                    type="submit" 
                                    disabled={queryLoading || !customQuery.trim()}
                                    className="absolute left-2 top-2 p-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-all shadow-md active:scale-95"
                                >
                                    {queryLoading ? <RefreshCw className="animate-spin w-4 h-4" /> : <Send size={16} className="rtl:rotate-180" />}
                                </button>
                            </form>
                            </div>
                        </div>
                    </div>
                )}
                {activeTab === 'locations' && (
                    <LocationManager 
                        locations={locations} 
                        onAddLocation={handleAddLocation} 
                        onDeleteLocation={handleDeleteLocation} 
                    />
                )}
                {activeTab === 'reports' && <Reports logs={logs} />}
                {activeTab === 'gps' && <GPSAttendance />}
                {activeTab === 'logs' && (
                        <div className="bg-white dark:bg-[#1e293b] p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 min-h-[600px] animate-fade-in">
                        <h2 className="text-xl font-bold mb-6 flex items-center gap-2 text-slate-800 dark:text-white">
                            <CheckCircle className="text-blue-500" />
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
                                    <tr className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs border-y border-slate-200 dark:border-slate-700">
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
                                    <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 transition-colors">
                                        <td className="p-4 text-slate-400 font-mono text-xs">{log.employeeId}</td>
                                        <td className="p-4 font-bold text-slate-700 dark:text-slate-200">{log.employeeName}</td>
                                        <td className="p-4 text-slate-600 dark:text-slate-400 font-mono text-xs" dir="ltr">
                                        {new Date(log.timestamp).toLocaleString('ar-SA-u-ca-gregory')}
                                        </td>
                                        <td className="p-4">
                                        <span className={`px-2 py-1 rounded text-xs font-bold ${log.type === 'CHECK_IN' ? 'bg-green-100 dark:bg-green-500/10 text-green-700 dark:text-green-400' : 'bg-red-100 dark:bg-red-500/10 text-red-700 dark:text-red-400'}`}>
                                            {log.type === 'CHECK_IN' ? 'دخول' : 'خروج'}
                                        </span>
                                        </td>
                                        <td className="p-4 text-slate-600 dark:text-slate-400">
                                        <span className="flex items-center gap-1 text-xs bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded w-fit">
                                            {log.method}
                                        </span>
                                        </td>
                                        <td className="p-4">
                                        {log.status === 'LATE' && <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded border border-amber-100 dark:border-amber-800 text-xs font-bold"><AlertTriangle size={10}/> متأخر</span>}
                                        {log.status === 'ON_TIME' && <span className="text-green-600 dark:text-green-500 text-xs">--</span>}
                                        </td>
                                        <td className="p-4 text-xs text-slate-500 dark:text-slate-400 truncate max-w-[150px]">
                                        {log.location ? log.location.address || `${log.location.lat.toFixed(3)}, ${log.location.lng.toFixed(3)}` : '-'}
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
                <div className="bg-white dark:bg-[#1e293b] p-8 rounded-2xl text-center text-slate-500 dark:text-slate-400 animate-fade-in border border-slate-200 dark:border-slate-800 shadow-sm max-w-2xl mx-auto mt-10">
                    <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                        <ArrowUpRight size={24} className="text-slate-400" />
                    </div>
                    <h2 className="text-xl font-bold mb-2 text-slate-800 dark:text-white">إعدادات النظام</h2>
                    <p className="mb-6">حالة الاتصال بالخادم: {dataError ? <span className="text-red-500 font-bold bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded">غير متصل</span> : <span className="text-green-600 font-bold bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded">متصل</span>}</p>
                    
                    <div className="bg-slate-50 dark:bg-slate-900 p-6 rounded-xl text-left font-mono text-sm inline-block text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 w-full" dir="ltr">
                        <div className="flex justify-between border-b border-slate-200 dark:border-slate-700 pb-2 mb-2">
                            <span>API Endpoint</span>
                            <span className="font-bold">http://qssun.dyndns.org:8085</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-200 dark:border-slate-700 pb-2 mb-2">
                            <span>Device IP</span>
                            <span className="font-bold">192.168.100.23</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Auth Type</span>
                            <span className="font-bold">Basic Authentication</span>
                        </div>
                    </div>
                </div>
                )}
            </Layout>
        )}
      </div>
    </div>
  );
};

// Polished Stat Card Component
const StatCard: React.FC<{title: string, value: number, icon: React.ReactNode, color: string, bg: string, border: string}> = ({ title, value, icon, color, bg, border }) => (
  <div className={`bg-white dark:bg-[#1e293b] p-5 rounded-2xl shadow-sm border ${border} flex items-center justify-between transition-all hover:translate-y-[-2px] hover:shadow-md group`}>
    <div>
      <p className="text-slate-500 dark:text-slate-400 text-xs font-bold mb-1 tracking-wide">{title}</p>
      <h3 className="text-3xl font-extrabold text-slate-800 dark:text-white tracking-tight">{value}</h3>
    </div>
    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${bg} ${color} transition-transform group-hover:scale-110 group-hover:rotate-3`}>
      {icon}
    </div>
  </div>
);

export default App;