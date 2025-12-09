import React from 'react';
import { Fingerprint, Activity, MapPin, ShieldCheck } from 'lucide-react';

const IntroScreen: React.FC = () => {
  return (
    <div className="fixed inset-0 z-[100] bg-slate-950 flex flex-col items-center justify-center overflow-hidden" dir="rtl">
      {/* Background Gradients */}
      <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-blue-600/20 rounded-full blur-[120px] animate-pulse"></div>
      <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[100px]"></div>

      {/* Main Content Container */}
      <div className="relative z-10 flex flex-col items-center">
        
        {/* Animated Icon Container */}
        <div className="relative mb-8">
            <div className="absolute inset-0 bg-blue-500 blur-xl opacity-20 animate-ping rounded-full"></div>
            <div className="w-24 h-24 bg-gradient-to-tr from-blue-600 to-indigo-500 rounded-3xl flex items-center justify-center shadow-2xl shadow-blue-500/30 animate-fade-in-up border border-white/10 relative overflow-hidden">
                {/* Scan line animation */}
                <div className="absolute top-0 w-full h-1 bg-white/50 shadow-[0_0_15px_rgba(255,255,255,0.8)] animate-[scan_2s_ease-in-out_infinite]"></div>
                <Fingerprint className="text-white w-14 h-14" strokeWidth={1.5} />
            </div>
        </div>

        {/* Text Content */}
        <h1 className="text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400 mb-4 animate-fade-in-up delay-100 tracking-tight text-center">
          نظام إدارة الحضور الذكي
        </h1>
        
        <div className="flex items-center gap-4 text-slate-400 text-sm md:text-base animate-fade-in-up delay-200">
            <span className="flex items-center gap-1"><MapPin size={16} className="text-blue-400"/> تتبع المواقع</span>
            <span className="w-1 h-1 rounded-full bg-slate-600"></span>
            <span className="flex items-center gap-1"><Activity size={16} className="text-green-400"/> تحليل فوري</span>
            <span className="w-1 h-1 rounded-full bg-slate-600"></span>
            <span className="flex items-center gap-1"><ShieldCheck size={16} className="text-purple-400"/> حماية البيانات</span>
        </div>

        {/* Loading Bar */}
        <div className="mt-12 w-64 h-1 bg-slate-800 rounded-full overflow-hidden animate-fade-in-up delay-300">
            <div className="h-full bg-gradient-to-r from-blue-500 via-indigo-400 to-blue-600 w-full origin-right animate-[progress_2.5s_ease-in-out_forwards]"></div>
        </div>

        <p className="mt-4 text-xs text-slate-600 font-mono animate-pulse">جاري تهيئة النظام...</p>
      </div>

      {/* Custom Keyframes for Tailwind (Injected via style for simplicity in this component) */}
      <style>{`
        @keyframes scan {
            0% { top: 0%; opacity: 0; }
            10% { opacity: 1; }
            90% { opacity: 1; }
            100% { top: 100%; opacity: 0; }
        }
        @keyframes progress {
            0% { transform: scaleX(0); }
            100% { transform: scaleX(1); }
        }
        .animate-fade-in-up {
            animation: fadeInUp 0.8s ease-out forwards;
            opacity: 0;
            transform: translateY(20px);
        }
        .delay-100 { animation-delay: 0.1s; }
        .delay-200 { animation-delay: 0.2s; }
        .delay-300 { animation-delay: 0.4s; }
        
        @keyframes fadeInUp {
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
      `}</style>
    </div>
  );
};

export default IntroScreen;
