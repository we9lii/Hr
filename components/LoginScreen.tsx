import React, { useState } from 'react';
import { UserRole } from '../types';
import { Fingerprint, User, ShieldCheck, ArrowRight, KeyRound, Lock, ArrowLeft, Check } from 'lucide-react';

interface LoginScreenProps {
  onLogin: (username: string, password: string, rememberMe: boolean) => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      onLogin(username, password, rememberMe);
      setLoading(false);
    }, 600);
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 relative overflow-hidden" dir="rtl">

      {/* Background decoration */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-96 h-96 bg-blue-600/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-96 h-96 bg-purple-600/10 rounded-full blur-3xl"></div>
      </div>

      <div className="w-full max-w-md relative z-10 animate-fade-in">

        {/* Header Logo */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-gradient-to-tr from-blue-600 to-blue-400 rounded-2xl mx-auto flex items-center justify-center shadow-2xl shadow-blue-500/20 mb-6 border border-white/10">
            <Fingerprint className="text-white w-12 h-12" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">نظام إدارة الحضور</h1>
          <p className="text-slate-400">بوابة الدخول الموحدة</p>
        </div>

        <div className="bg-slate-800/80 backdrop-blur-sm border border-slate-700 p-6 rounded-2xl animate-in fade-in zoom-in-95 duration-300">
          <div className="flex items-center justify-center mb-6">
            <h2 className="text-xl font-bold text-white">
              تسجيل الدخول
            </h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-slate-400 text-sm mb-2">اسم المستخدم</label>
              <div className="relative">
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-slate-500" />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg py-3 pr-10 pl-3 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  placeholder=""
                  autoFocus
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-400 text-sm mb-2">كلمة المرور</label>
              <div className="relative">
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                  <KeyRound className="h-5 w-5 text-slate-500" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg py-3 pr-10 pl-3 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  placeholder=""
                  required
                />
              </div>
            </div>

            {/* Remember Me Checkbox */}
            <div className="flex items-center">
              <label className="flex items-center cursor-pointer group">
                <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${rememberMe ? 'bg-blue-600 border-blue-600' : 'bg-slate-900 border-slate-600 group-hover:border-slate-500'}`}>
                  {rememberMe && <Check size={14} className="text-white" />}
                </div>
                <input
                  type="checkbox"
                  className="hidden"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <span className="mr-2 text-sm text-slate-400 group-hover:text-slate-300 transition-colors">تذكرني</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-all mt-6 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Lock size={18} />
                  <span>تسجيل الدخول</span>
                </>
              )}
            </button>
          </form>
        </div>

        <div className="mt-8 text-center">
          <p className="text-slate-600 text-xs dir-ltr font-mono">
            System Status: Online <br />
            Server: 192.168.100.23:4370
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;