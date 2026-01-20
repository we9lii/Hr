import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { LOCATIONS } from '../config/locations';
import { MapPin, LogOut, Calendar, CheckCircle2, Navigation, AlertTriangle, Fingerprint, Sun, Moon, ShieldAlert, ShieldCheck, Coffee, ArrowRightCircle, ArrowLeftCircle, MoreHorizontal, X, Sparkles, Lock, Radar, Wifi } from 'lucide-react';
import { submitGPSAttendance, submitBiometricAttendance, getLastPunch } from '../services/api';

interface EmployeePortalProps {
  user: User;
  onLogout: () => void;
  isDarkMode: boolean;
  toggleTheme: () => void;
}

// Haversine Formula to calculate distance in meters
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371e3; // Earth radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
};

type PunchType = 'CHECK_IN' | 'CHECK_OUT' | 'BREAK_OUT' | 'BREAK_IN';

const EmployeePortal: React.FC<EmployeePortalProps> = ({ user, onLogout, isDarkMode, toggleTheme }) => {
  // Feature Flag: Enable Remote Punch for specific users or all
  const allowRemote = user.id === '1093394672';

  const [currentTime, setCurrentTime] = useState(new Date());
  const [location, setLocation] = useState<{ lat: number, lng: number, accuracy: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [scanText, setScanText] = useState(''); // Security Animation Text
  const [bioLoading, setBioLoading] = useState(false);

  const [lastPunch, setLastPunch] = useState<Date | null>(null);
  const [lastPunchType, setLastPunchType] = useState<PunchType | null>(null);
  const [lastPunchLocation, setLastPunchLocation] = useState<string | null>(null);
  const [lastPunchPurpose, setLastPunchPurpose] = useState<string>('');

  // Manual Selection State
  const [selectedType, setSelectedType] = useState<PunchType>('CHECK_IN');
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const isDev = user.id === '1093394672'; // Faisal's Backdoor 🚀

  // Geofence State
  const [nearestLocation, setNearestLocation] = useState<{ name: string, distance: number, allowed: boolean } | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch Last Punch on Mount
  useEffect(() => {
    const fetchLast = async () => {
      try {
        const record = await getLastPunch(user.id);
        if (record) {
          setLastPunch(record.timestamp);
          setLastPunchType(record.type);
          // @ts-ignore
          setLastPunchPurpose(record.purpose || '');

          // Smart Switch Logic
          if (record.type === 'CHECK_IN') setSelectedType('CHECK_OUT');
          else if (record.type === 'CHECK_OUT') setSelectedType('CHECK_IN');
          else if (record.type === 'BREAK_OUT') setSelectedType('BREAK_IN');
          else if (record.type === 'BREAK_IN') setSelectedType('CHECK_OUT');
        }
      } catch (e) {
        console.error("Error fetching last punch", e);
      }
    };
    fetchLast();
  }, [user.id]);

  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.watchPosition(
        (position) => {
          const currentLat = position.coords.latitude;
          const currentLng = position.coords.longitude;

          setLocation({
            lat: currentLat,
            lng: currentLng,
            accuracy: position.coords.accuracy
          });

          // Check Geofences
          let bestMatch = null;
          let minDistance = Infinity;
          const activeLocations = LOCATIONS.filter(l => l.active);

          for (const loc of activeLocations) {
            if (loc.lat === 0 && loc.lng === 0) continue;
            const dist = calculateDistance(currentLat, currentLng, loc.lat, loc.lng);

            if (dist <= loc.radius) {
              if (dist < minDistance) {
                minDistance = dist;
                bestMatch = { name: loc.name, distance: dist, allowed: true };
              }
            } else {
              if (dist < minDistance) {
                minDistance = dist;
                bestMatch = { name: loc.name, distance: dist, allowed: false };
              }
            }
          }
          setNearestLocation(bestMatch);
          setError(null);
        },
        (err) => {
          setError("يرجى تفعيل خدمة الموقع (GPS) لتتمكن من التحضير.");
        },
        { enableHighAccuracy: true }
      );
    } else {
      setError("المتصفح لا يدعم تحديد الموقع.");
    }
  }, []);

  const handleAttendance = async () => {
    // Dev Bypass: Allow if isDev, regardless of location
    // Remote Allowed: Allow if allowRemote is true
    if (!isDev && !allowRemote && (!location || !nearestLocation?.allowed)) return;



    setLoading(true);

    // FAKE SECURITY SCAN (Psychological Trick) 🕵️‍♂️
    const securitySteps = [
      "جاري تحليل إحداثيات GPS...",
      "التحقق من بصمة الجهاز...",
      "تأمين بروتوكول الاتصال...",
      "جاري تسجيل الحركة..."
    ];

    for (const step of securitySteps) {
      setScanText(step);
      await new Promise(r => setTimeout(r, 800)); // 800ms per step
    }

    try {
      const lat = location ? location.lat : 0;
      const lng = location ? location.lng : 0;
      const acc = location ? location.accuracy : undefined;

      const isInside = nearestLocation && nearestLocation.allowed;

      // UNIFIED LOGIC: Use submitGPSAttendance for EVERYTHING (Reliable Backend)
      // I have updated transactions.php to write directly to BioTime's native table for Inside punches.
      // This bypasses the broken API (500 Error) while ensuring data appears in the Main Dashboard.

      const isInsidePunch = isInside;
      const terminalSn = isInsidePunch ? 'MOBILE_APP_INSIDE' : undefined;
      const isRemotePunch = allowRemote && !isInsidePunch; // Only remote if NOT inside

      // Execute Pulse (Single Call for All)
      const response = await submitGPSAttendance(
        user.id,
        lat,
        lng,
        selectedType,
        selectedBranch || undefined,
        acc,
        isRemotePunch,
        terminalSn
      );

      // Update last punch location
      if (typeof response === 'object' && response.area) {
        setLastPunchLocation(response.area);
      } else {
        setLastPunchLocation(isInsidePunch ? (nearestLocation?.name || 'موقع آمن') : 'Unknown');
      }

      const now = new Date();
      setLastPunch(now);
      setLastPunchType(selectedType);

      // Auto-switch logic
      if (selectedType === 'CHECK_IN') setSelectedType('CHECK_OUT');
      else if (selectedType === 'BREAK_OUT') setSelectedType('BREAK_IN');
      else if (selectedType === 'BREAK_IN') setSelectedType('CHECK_OUT');
      else if (selectedType === 'CHECK_OUT') setSelectedType('CHECK_IN');

    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(`خطأ: ${msg}`);
    } finally {
      setLoading(false);
      setScanText('');
    }
  };

  const handleBiometricAttendance = async () => {
    if (!nearestLocation?.allowed) {
      alert("لا يمكنك التحضير خارج الموقع المحدد");
      return;
    }
    setBioLoading(true);
    try {
      const terminalSn = 'MOBILE_BIO_APP';
      await submitBiometricAttendance(user.id, selectedType as any, terminalSn, 'FINGERPRINT');
      setLastPunch(new Date());
      setLastPunchType(selectedType);
    } catch (e) {
      alert('حدث خطأ في الاتصال بالبصمة');
    } finally {
      setBioLoading(false);
    }
  };

  const getPunchDetails = (type: PunchType) => {
    switch (type) {
      case 'CHECK_IN': return { label: 'حضور', enLabel: 'Check In', color: 'from-emerald-400 to-green-600', shadow: 'shadow-emerald-500/30', icon: <ArrowRightCircle size={48} /> };
      case 'CHECK_OUT': return { label: 'انصراف', enLabel: 'Check Out', color: 'from-red-500 to-rose-600', shadow: 'shadow-red-500/30', icon: <LogOut size={48} /> };
      case 'BREAK_OUT': return { label: 'خروج استراحة', enLabel: 'Break Out', color: 'from-amber-400 to-orange-500', shadow: 'shadow-amber-500/30', icon: <Coffee size={48} /> };
      case 'BREAK_IN': return { label: 'عودة من استراحة', enLabel: 'Break In', color: 'from-blue-400 to-indigo-600', shadow: 'shadow-blue-500/30', icon: <ArrowLeftCircle size={48} /> };
    }
  };

  const currentPunch = getPunchDetails(selectedType);

  const formatTime = (date: Date) => {
    let hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    hours = hours % 12;
    hours = hours ? hours : 12;
    return { time: `${hours.toString().padStart(2, '0')}:${minutes}`, seconds };
  };

  const { time, seconds } = formatTime(currentTime);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col relative overflow-hidden transition-colors duration-500 font-sans">

      {/* Animated Background */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className={`absolute top-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full blur-[100px] animate-pulse-slow transition-colors duration-1000 ${selectedType === 'CHECK_IN' ? 'bg-green-400/20' :
          selectedType === 'CHECK_OUT' ? 'bg-red-400/20' :
            selectedType === 'BREAK_OUT' ? 'bg-amber-400/20' : 'bg-blue-400/20'
          }`}></div>
        <div className="absolute bottom-[-10%] left-[-20%] w-[400px] h-[400px] bg-purple-400/20 dark:bg-purple-600/10 rounded-full blur-[80px] animate-pulse-slow" style={{ animationDelay: '1.5s' }}></div>
      </div>

      {/* Header Curve */}
      <div className="absolute top-0 left-0 w-full h-[280px] bg-gradient-to-br from-slate-800 to-slate-900 rounded-b-[60px] shadow-2xl shadow-blue-900/20 z-0">
        <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]"></div>
      </div>

      {/* Top Navbar */}
      <div className="relative z-10 px-6 pt-8 pb-2 flex justify-between items-start text-white">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl border-2 border-white/20 bg-white/10 backdrop-blur-md overflow-hidden shadow-lg">
            <img src={user.avatar} alt="User" className="w-full h-full object-cover" />
          </div>
          <div className="mt-1">
            <p className="text-slate-400 text-xs font-medium mb-0.5">مرحباً بك،</p>
            <h2 className="font-bold text-xl tracking-tight text-white">{user.name}</h2>
            <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded text-blue-100 border border-white/10 inline-block mt-1">
              {user.role === 'ADMIN' ? 'مسؤول النظام' : 'موظف'}
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          {/* Theme Toggle Removed */}
          <button onClick={onLogout} className="p-2.5 bg-white/10 rounded-xl hover:bg-white/20 backdrop-blur-md border border-white/10 text-white transition-all active:scale-95 shadow-lg">
            <LogOut size={18} />
          </button>
        </div>
      </div>

      {/* Main Content Card */}
      <div className="flex-1 px-4 pb-6 relative z-10 flex flex-col items-center -mt-4">
        {/* Glass Card */}
        <div className="w-full max-w-md bg-slate-900/80 backdrop-blur-xl rounded-[40px] shadow-black/20 p-6 flex flex-col items-center border border-slate-800 transition-colors h-full">

          {/* Time Display */}
          <div className="text-center mt-4 mb-4">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-800 text-slate-400 text-xs font-medium mb-3 border border-slate-700/50">
              <Calendar size={12} />
              {currentTime.toLocaleDateString('ar-SA-u-ca-gregory', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
            <div className="relative">
              <h1 className="text-7xl font-[800] text-white tracking-tighter leading-none" dir="ltr">
                {time}
              </h1>
              <span className="absolute -right-6 top-2 text-xl font-light text-slate-600 font-mono">
                {seconds}
              </span>
            </div>
          </div>

          {/* Location Status Badge */}
          <div className={`
                    w-full max-w-[95%] mb-6 p-4 rounded-3xl flex flex-col items-center justify-center gap-1.5 text-xs transition-all duration-300 border backdrop-blur-sm shadow-sm
                    ${error
              ? 'bg-red-900/20 text-red-400 border-red-900/30'
              : nearestLocation?.allowed
                ? 'bg-emerald-900/20 text-emerald-400 border-emerald-900/30 ring-4 ring-emerald-900/10'
                : allowRemote
                  ? 'bg-blue-900/20 text-blue-400 border-blue-900/30 ring-4 ring-blue-900/10' // Remote Allowed Style
                  : 'bg-amber-900/20 text-amber-400 border-amber-900/30'}
                `}>
            {error ? (
              <div className="flex items-center gap-2 font-bold"><AlertTriangle size={18} className="animate-bounce" /> {error}</div>
            ) : nearestLocation ? (
              <>
                <div className="flex items-center gap-2 font-bold text-sm">
                  {nearestLocation.allowed ? <ShieldCheck size={18} /> : allowRemote ? <MapPin size={18} /> : <ShieldAlert size={18} />}
                  {nearestLocation.allowed
                    ? `موقع آمن: ${nearestLocation.name}`
                    : allowRemote
                      ? `تسجيل عن بعد (خارج النطاق: ${nearestLocation.name})`
                      : `أنت خارج نطاق العمل (${nearestLocation.name})`}
                </div>

                {/* Accuracy Meter Visual */}
                {location && (
                  <div className="flex items-center gap-2 mt-2 bg-black/20 px-3 py-1 rounded-full border border-white/20">
                    {location.accuracy < 20 ? <Wifi size={14} className="text-emerald-400" /> : <Radar size={14} className="text-amber-600 animate-pulse" />}
                    <span className="font-mono text-[10px] opacity-80">
                      دقة الإشارة:
                      <strong className={`mx-1 ${location.accuracy < 20 ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {Math.round(location.accuracy)}m
                      </strong>
                      {location.accuracy < 20 ? '(ممتاز)' : '(ضعيف)'}
                    </span>
                  </div>
                )}


                {!nearestLocation.allowed && nearestLocation.distance && (
                  <div className="text-[10px] opacity-80 font-mono mt-1">
                    تبعد {Math.round(nearestLocation.distance)} متر عن النطاق المسموح
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center gap-2 font-bold text-slate-500"><Navigation size={18} className="animate-spin" /> جاري تحديد الموقع ومعايرة السياج...</div>
            )}

            {/* Developer Backdoor UI */}
            {isDev && (
              <div className="mt-3 w-full animate-fade-in border-t border-slate-200 dark:border-slate-700 pt-2">
                <div className="text-[10px] text-blue-500 font-bold mb-1 flex items-center gap-1">
                  <Sparkles size={10} />
                  وضع المطور (صلاحيات كاملة)
                </div>
                <select
                  value={selectedBranch}
                  onChange={(e) => setSelectedBranch(e.target.value)}
                  className="w-full p-2 rounded-lg bg-blue-900/10 border border-blue-900/30 text-xs font-bold text-blue-300 focus:outline-none"
                >
                  <option value="">-- {nearestLocation?.allowed ? 'استخدم الموقع التلقائي' : 'تجاوز الموقع (اختر الفرع)'} --</option>
                  {LOCATIONS.filter(l => l.active).map(l => (
                    <option key={l.id} value={l.name}>{l.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Type Selection Button */}
          <div className="mb-4 relative z-20">
            <button
              onClick={() => setIsMenuOpen(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-slate-800 rounded-xl text-slate-300 font-bold text-sm hover:bg-slate-700 border border-slate-700 transition-all active:scale-95"
            >
              <MoreHorizontal size={16} />
              تغيير نوع الحركة
            </button>

            {/* Floating Menu */}
            {isMenuOpen && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 w-64 bg-slate-800 rounded-2xl shadow-2xl border border-slate-700 p-2 animate-fade-in-up origin-bottom">
                <div className="flex justify-between items-center mb-2 px-2 pt-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">اختر نوع البصمة</span>
                  <button onClick={() => setIsMenuOpen(false)} className="p-1 hover:bg-slate-700 rounded-full"><X size={14} /></button>
                </div>
                <div className="grid grid-cols-1 gap-1">
                  <button onClick={() => { setSelectedType('CHECK_IN'); setIsMenuOpen(false); }} className={`flex items-center gap-3 p-3 rounded-xl transition-all ${selectedType === 'CHECK_IN' ? 'bg-emerald-50 text-emerald-600 font-bold' : 'hover:bg-slate-700 text-slate-300'}`}>
                    <ArrowRightCircle size={18} className={selectedType === 'CHECK_IN' ? '' : 'text-emerald-500'} />
                    <span>حضور (دخول)</span>
                  </button>
                  <button onClick={() => { setSelectedType('CHECK_OUT'); setIsMenuOpen(false); }} className={`flex items-center gap-3 p-3 rounded-xl transition-all ${selectedType === 'CHECK_OUT' ? 'bg-rose-50 text-rose-600 font-bold' : 'hover:bg-slate-700 text-slate-300'}`}>
                    <LogOut size={18} className={selectedType === 'CHECK_OUT' ? '' : 'text-rose-500'} />
                    <span>انصراف (خروج)</span>
                  </button>
                  <button onClick={() => { setSelectedType('BREAK_OUT'); setIsMenuOpen(false); }} className={`flex items-center gap-3 p-3 rounded-xl transition-all ${selectedType === 'BREAK_OUT' ? 'bg-amber-50 text-amber-600 font-bold' : 'hover:bg-slate-700 text-slate-300'}`}>
                    <Coffee size={18} className={selectedType === 'BREAK_OUT' ? '' : 'text-amber-500'} />
                    <span>خروج استراحة</span>
                  </button>
                  <button onClick={() => { setSelectedType('BREAK_IN'); setIsMenuOpen(false); }} className={`flex items-center gap-3 p-3 rounded-xl transition-all ${selectedType === 'BREAK_IN' ? 'bg-blue-50 text-blue-600 font-bold' : 'hover:bg-slate-700 text-slate-300'}`}>
                    <ArrowLeftCircle size={18} className={selectedType === 'BREAK_IN' ? '' : 'text-blue-500'} />
                    <span>عودة من استراحة</span>
                  </button>
                </div>
              </div>
            )}
            {/* Backdrop for menu */}
            {isMenuOpen && <div className="fixed inset-0 z-[-1]" onClick={() => setIsMenuOpen(false)} />}
          </div>

          {/* The Magic Button */}
          <div className="relative mb-8 group z-10 text-center">
            {/* Outer Glow Ring */}
            <div className={`absolute -inset-4 rounded-full blur-xl opacity-40 transition-all duration-700 bg-gradient-to-br ${currentPunch.color}
                        ${(!location || !nearestLocation?.allowed) && 'hidden'}
                        group-hover:opacity-60 group-hover:blur-2xl
                    `}></div>

            <button
              onClick={handleAttendance}
              disabled={loading || (!isDev && !allowRemote && (!location || !nearestLocation?.allowed))}
              className={`
                            w-52 h-52 rounded-full flex flex-col items-center justify-center shadow-2xl transition-all duration-500 transform relative z-10 border-8 border-slate-800
                            ${!isDev && !allowRemote && (!location || !nearestLocation?.allowed) ? 'bg-slate-800 grayscale cursor-not-allowed shadow-inner opacity-80' : 'hover:scale-105 active:scale-95 cursor-pointer'}
                            bg-gradient-to-br ${currentPunch.color}
                            ${currentPunch.shadow}
                        `}
            >
              {loading ? (
                <div className="flex flex-col items-center gap-2 animate-pulse">
                  <Lock size={32} className="text-white mb-2" />
                  <span className="text-white text-[10px] font-mono tracking-widest uppercase">{scanText || 'جاري المعالجة...'}</span>
                  <div className="flex gap-1 mt-1">
                    <span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                    <span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                    <span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce"></span>
                  </div>
                </div>
              ) : (
                <>
                  <div className="mb-3 bg-white/20 p-4 rounded-full backdrop-blur-sm shadow-inner ring-1 ring-white/30">
                    {React.cloneElement(currentPunch.icon as React.ReactElement, { className: "text-white drop-shadow-md", strokeWidth: 1.5 })}
                  </div>
                  <span className="text-white text-2xl font-bold tracking-tight drop-shadow-sm">
                    {currentPunch.label}
                  </span>
                  <span className="text-white/80 text-[10px] uppercase font-bold tracking-widest mt-1">
                    {currentPunch.enLabel}
                  </span>
                </>
              )}

              {!loading && location && nearestLocation?.allowed && (
                <span className="absolute inset-0 rounded-full border border-white/30 animate-ping opacity-20 scale-110"></span>
              )}
            </button>
            {!nearestLocation?.allowed && !allowRemote && (
              <p className="mt-4 text-xs font-bold text-red-500 animate-pulse">يجب أن تكون في الموقع للتحضير</p>
            )}
          </div>

          {/* Last Punch Info */}
          {lastPunch && lastPunchType && (
            <div className="mt-auto mb-4 w-full animate-fade-in-up">
              <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-800/50 border border-slate-700/50">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-full ${lastPunchType === 'CHECK_IN' || lastPunchType === 'BREAK_IN' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
                    }`}>
                    <CheckCircle2 size={20} />
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 font-bold mb-0.5">آخر هوية مسجلة</p>
                    <p className="text-sm font-bold text-slate-200">
                      {(lastPunchPurpose && lastPunchPurpose.includes('غياب'))
                        ? <span className="text-red-400">تم تسجيل غياب ({lastPunchPurpose})</span>
                        : <>تم {getPunchDetails(lastPunchType).label} {lastPunchLocation && ` في ${lastPunchLocation}`}</>
                      }
                    </p>
                  </div>
                </div>
                <span className="font-mono text-lg font-bold text-white dir-ltr">
                  {formatTime(lastPunch).time}
                </span>
              </div>
            </div>
          )}

          <div className="mt-2 text-[10px] text-slate-300 dark:text-slate-600 font-mono">
            System v2.1 • GPS (v9.0 REMOTE FIX) • Biometric
          </div>
        </div>
      </div>
      {/* Footer */}
      <footer className="w-full text-center py-4 text-[10px] text-slate-600 font-mono opacity-50 relative z-10">
        © 2026 QSSUN Energy. Developed by Faisal.
      </footer>
    </div>
  );
};

export default EmployeePortal;
