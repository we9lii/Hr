import React, { useState } from 'react';
import { LayoutDashboard, Users, MapPin, ClipboardList, Menu, X, Settings, LogOut, Map, BarChart3, Moon, Sun, ChevronLeft, Fingerprint } from 'lucide-react';
import { User } from '../types';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
  onLogout: () => void;
  isDarkMode: boolean;
  toggleTheme: () => void;
  user: User;
}

const Layout: React.FC<LayoutProps> = ({ children, activeTab, onTabChange, onLogout, isDarkMode, toggleTheme, user }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const menuItems = [
    { id: 'dashboard', label: 'لوحة المعلومات', icon: <LayoutDashboard size={20} /> },
    { id: 'employees', label: 'الموظفين', icon: <Users size={20} /> },
    { id: 'logs', label: 'سجلات الحضور', icon: <ClipboardList size={20} /> },
    { id: 'reports', label: 'التقارير الذكية', icon: <BarChart3 size={20} /> },
    { id: 'locations', label: 'إدارة المواقع', icon: <MapPin size={20} /> },
    { id: 'settings', label: 'الإعدادات', icon: <Settings size={20} /> },
  ];

  return (
    <div className="min-h-screen bg-[#0b1121] flex flex-col md:flex-row transition-colors duration-500 font-sans">
      {/* Mobile Header */}
      <div className="md:hidden bg-slate-900/80 backdrop-blur-md text-white p-4 flex justify-between items-center shadow-sm sticky top-0 z-50 border-b border-slate-800">
        <h1 className="font-bold text-lg flex items-center gap-2">
          <img src="/icon-192.png" alt="Logo" className="w-8 h-8 object-contain" />
          نظام الحضور
        </h1>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 bg-slate-800 rounded-lg">
          {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Sidebar */}
      <aside className={`
        fixed md:static inset-y-0 right-0 z-50 w-72 bg-[#0f172a] text-slate-400 transform transition-all duration-300 ease-in-out flex flex-col border-l border-slate-800/50
        ${sidebarOpen ? 'translate-x-0 shadow-2xl' : 'translate-x-full md:translate-x-0'}
      `}>
        {/* Sidebar Header */}
        <div className="p-8 pb-4">
          <h2 className="text-2xl font-extrabold text-white flex items-center gap-3 tracking-tight">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden">
              <img src="/icon-192.png" alt="Logo" className="w-full h-full object-contain drop-shadow-md" />
            </div>
            Qssun
          </h2>
          <div className="mt-6 p-4 bg-slate-800/50 rounded-2xl border border-slate-700/50 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">حالة النظام</span>
              <div className="flex items-center gap-1.5 px-2 py-0.5 bg-green-500/10 text-green-400 text-[10px] font-bold rounded-full border border-green-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                متصل
              </div>
            </div>
            <p className="text-[10px] text-slate-400 font-mono truncate dir-ltr">qssun.dyndns.org</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-1.5 flex-1 overflow-y-auto custom-scrollbar">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                onTabChange(item.id);
                setSidebarOpen(false);
              }}
              className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl transition-all duration-200 group relative overflow-hidden
                ${activeTab === item.id
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30 font-bold translate-x-[-4px]'
                  : 'hover:bg-slate-800/80 hover:text-white'
                }
              `}
            >
              <div className="flex items-center gap-3 relative z-10">
                {React.cloneElement(item.icon as React.ReactElement, {
                  size: 22,
                  className: activeTab === item.id ? 'animate-pulse' : 'text-slate-400 group-hover:text-blue-400'
                })}
                <span>{item.label}</span>
              </div>
              {activeTab === item.id && <ChevronLeft size={16} className="opacity-60" />}
            </button>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-4 m-4 bg-slate-800/40 rounded-2xl border border-slate-700/50">
          {/* Theme Toggle Removed - Forced Dark */}

          <div className="flex items-center justify-between pt-2 border-t border-slate-700/50">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-md border-2 border-slate-800">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="overflow-hidden">
                <p className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate w-24">{user.name}</p>
                <p className="text-[10px] text-slate-400">{user.role === 'ADMIN' ? 'مدير النظام' : 'موظف'}</p>
              </div>
            </div>
            <button
              onClick={onLogout}
              className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-full transition-colors"
              title="تسجيل الخروج"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-8 overflow-y-auto h-screen custom-scrollbar relative">
        {/* Top fade for scroll */}
        <div className="fixed top-0 left-0 right-0 h-4 bg-gradient-to-b from-[#f8fafc] dark:from-[#0b1121] to-transparent z-10 pointer-events-none md:hidden" />
        {children}
        <footer className="mt-8 text-center text-[10px] text-slate-400 font-mono opacity-50 pb-4">
          © 2026 QSSUN Energy. Developed by Faisal.
        </footer>
      </main>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 md:hidden transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
};

export default Layout;
