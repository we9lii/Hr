import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { MapPin, LogOut, Clock, Calendar, CheckCircle2, Navigation, AlertTriangle, Fingerprint, Sun, Moon } from 'lucide-react';
import { submitGPSAttendance, submitBiometricAttendance } from '../services/api';

interface EmployeePortalProps {
  user: User;
  onLogout: () => void;
  isDarkMode: boolean;
  toggleTheme: () => void;
}

const EmployeePortal: React.FC<EmployeePortalProps> = ({ user, onLogout, isDarkMode, toggleTheme }) => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [location, setLocation] = useState<{lat: number, lng: number} | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [bioLoading, setBioLoading] = useState(false);
  
  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [lastPunch, setLastPunch] = useState<Date | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.watchPosition(
        (position) => {
          setLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
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
    if (!location) return;
    
    setLoading(true);
    try {
      const type = isCheckedIn ? 'CHECK_OUT' : 'CHECK_IN';
      await submitGPSAttendance(user.id, location.lat, location.lng, type);
      
      setLastPunch(new Date());
      setIsCheckedIn(!isCheckedIn);
    } catch (e) {
      alert("حدث خطأ في الاتصال");
    } finally {
      setLoading(false);
    }
  };

  const handleBiometricAttendance = async () => {
    setBioLoading(true);
    try {
      const type = isCheckedIn ? 'CHECK_OUT' : 'CHECK_IN';
      const terminalSn = 'RKQ4235101617';
      await submitBiometricAttendance(user.id, type, terminalSn, 'FINGERPRINT');
      setLastPunch(new Date());
      setIsCheckedIn(!isCheckedIn);
    } catch (e) {
      alert('حدث خطأ في الاتصال بالبصمة');
    } finally {
      setBioLoading(false);
    }
  };

  const formatTime = (date: Date) => {
    let hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    
    hours = hours % 12;
    hours = hours ? hours : 12; 
    const strHours = hours.toString().padStart(2, '0');
    
    return { time: `${strHours}:${minutes}`, seconds };
  };

  const { time, seconds } = formatTime(currentTime);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col relative overflow-hidden transition-colors duration-500 font-sans">
        
        {/* Animated Background */}
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
            <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-blue-400/20 dark:bg-blue-600/10 rounded-full blur-[100px] animate-pulse-slow"></div>
            <div className="absolute bottom-[-10%] left-[-20%] w-[400px] h-[400px] bg-purple-400/20 dark:bg-purple-600/10 rounded-full blur-[80px] animate-pulse-slow" style={{animationDelay: '1.5s'}}></div>
        </div>
        
        {/* Header Curve */}
        <div className="absolute top-0 left-0 w-full h-[280px] bg-gradient-to-br from-blue-600 to-indigo-700 dark:from-slate-800 dark:to-slate-900 rounded-b-[60px] shadow-2xl shadow-blue-900/20 z-0">
             <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]"></div>
        </div>
        
        {/* Top Navbar */}
        <div className="relative z-10 px-6 pt-8 pb-2 flex justify-between items-start text-white">
            <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl border-2 border-white/20 bg-white/10 backdrop-blur-md overflow-hidden shadow-lg">
                    <img src={user.avatar} alt="User" className="w-full h-full object-cover" />
                </div>
                <div className="mt-1">
                    <p className="text-blue-100 dark:text-slate-400 text-xs font-medium mb-0.5">مرحباً بك،</p>
                    <h2 className="font-bold text-xl tracking-tight text-white">{user.name}</h2>
                    <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded text-blue-100 border border-white/10 inline-block mt-1">
                        {user.role === 'ADMIN' ? 'مسؤول النظام' : 'موظف'}
                    </span>
                </div>
            </div>
            <div className="flex flex-col gap-3">
                <button onClick={toggleTheme} className="p-2.5 bg-white/10 rounded-xl hover:bg-white/20 backdrop-blur-md border border-white/10 text-yellow-300 dark:text-blue-200 transition-all active:scale-95 shadow-lg">
                    {isDarkMode ? <Moon size={18} /> : <Sun size={18} />}
                </button>
                <button onClick={onLogout} className="p-2.5 bg-white/10 rounded-xl hover:bg-white/20 backdrop-blur-md border border-white/10 text-white transition-all active:scale-95 shadow-lg">
                    <LogOut size={18} />
                </button>
            </div>
        </div>

        {/* Main Content Card */}
        <div className="flex-1 px-4 pb-6 relative z-10 flex flex-col items-center -mt-4">
            {/* Glass Card */}
            <div className="w-full max-w-md bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl rounded-[40px] shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-black/20 p-6 flex flex-col items-center border border-white/50 dark:border-slate-800 transition-colors h-full">
                
                {/* Time Display */}
                <div className="text-center mt-4 mb-8">
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs font-medium mb-3 border border-slate-200 dark:border-slate-700/50">
                        <Calendar size={12}/>
                        {currentTime.toLocaleDateString('ar-SA-u-ca-gregory', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </div>
                    <div className="relative">
                        <h1 className="text-7xl font-[800] text-slate-800 dark:text-white tracking-tighter leading-none" dir="ltr">
                            {time}
                        </h1>
                        <span className="absolute -right-6 top-2 text-xl font-light text-slate-400 dark:text-slate-600 font-mono">
                             {seconds}
                        </span>
                    </div>
                </div>

                {/* Location Status Badge */}
                <div className={`
                    w-full max-w-[90%] mb-10 p-3.5 rounded-2xl flex items-center justify-center gap-2.5 text-xs font-bold transition-all duration-300 border backdrop-blur-sm shadow-sm
                    ${error 
                        ? 'bg-red-50/90 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-100 dark:border-red-900/30' 
                        : location 
                            ? 'bg-blue-50/90 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border-blue-100 dark:border-blue-900/30' 
                            : 'bg-amber-50/90 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border-amber-100 dark:border-amber-900/30'}
                `}>
                    {error ? (
                        <><AlertTriangle size={16} className="animate-bounce"/> {error}</>
                    ) : location ? (
                        <><MapPin size={16}/> الموقع: داخل النطاق ({location.lat.toFixed(4)})</>
                    ) : (
                        <><Navigation size={16} className="animate-spin"/> جاري البحث عن الأقمار الصناعية...</>
                    )}
                </div>

                {/* The Magic Button */}
                <div className="relative mb-8 group">
                    {/* Outer Glow Ring */}
                    <div className={`absolute -inset-4 rounded-full blur-xl opacity-40 transition-all duration-700
                        ${isCheckedIn ? 'bg-red-500' : 'bg-green-500'}
                        ${!location && 'hidden'}
                        group-hover:opacity-60 group-hover:blur-2xl
                    `}></div>
                    
                    <button
                        onClick={handleAttendance}
                        disabled={!location || loading}
                        className={`
                            w-52 h-52 rounded-full flex flex-col items-center justify-center shadow-2xl transition-all duration-500 transform relative z-10 border-8 border-white dark:border-slate-800
                            ${!location ? 'bg-slate-100 dark:bg-slate-800 grayscale cursor-not-allowed shadow-inner' : 'hover:scale-105 active:scale-95 cursor-pointer'}
                            ${isCheckedIn 
                                ? 'bg-gradient-to-br from-red-500 to-rose-600 shadow-red-500/30' 
                                : 'bg-gradient-to-br from-emerald-400 to-green-600 shadow-emerald-500/30'}
                        `}
                    >
                        {loading ? (
                            <div className="w-16 h-16 border-4 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <>
                                <div className="mb-3 bg-white/20 p-4 rounded-full backdrop-blur-sm shadow-inner ring-1 ring-white/30">
                                    <Fingerprint size={48} className="text-white drop-shadow-md" strokeWidth={1.5} />
                                </div>
                                <span className="text-white text-2xl font-bold tracking-tight drop-shadow-sm">
                                    {isCheckedIn ? 'انصراف' : 'حضور'}
                                </span>
                                <span className="text-white/80 text-[10px] uppercase font-bold tracking-widest mt-1">
                                    {isCheckedIn ? 'Check Out' : 'Check In'}
                                </span>
                            </>
                        )}
                        
                        {!loading && location && (
                            <span className="absolute inset-0 rounded-full border border-white/30 animate-ping opacity-20 scale-110"></span>
                        )}
                    </button>
                </div>

                <div className="w-full max-w-md mb-6">
                  <button
                    onClick={handleBiometricAttendance}
                    disabled={bioLoading}
                    className={`w-full py-3 rounded-2xl flex items-center justify-center gap-2 font-bold text-sm transition-all ${bioLoading ? 'bg-slate-300 dark:bg-slate-700 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 text-white'}`}
                  >
                    {bioLoading ? (
                      <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    ) : (
                      <Fingerprint size={18} />
                    )}
                    <span>تسجيل الحضور بالبصمة</span>
                  </button>
                </div>

                {/* Last Punch Info */}
                {lastPunch && (
                    <div className="mt-auto mb-4 w-full animate-fade-in-up">
                        <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50">
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-full ${isCheckedIn ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                                    <CheckCircle2 size={20} />
                                </div>
                                <div>
                                    <p className="text-xs text-slate-400 font-bold mb-0.5">آخر عملية</p>
                                    <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                                        {isCheckedIn ? 'تم تسجيل الدخول' : 'تم تسجيل الخروج'}
                                    </p>
                                </div>
                            </div>
                            <span className="font-mono text-lg font-bold text-slate-800 dark:text-white dir-ltr">
                                {formatTime(lastPunch).time}
                            </span>
                        </div>
                    </div>
                )}
                
                <div className="mt-2 text-[10px] text-slate-300 dark:text-slate-600 font-mono">
                    System v2.1 • GPS • Biometric
                </div>
            </div>
        </div>
    </div>
  );
};

export default EmployeePortal;
