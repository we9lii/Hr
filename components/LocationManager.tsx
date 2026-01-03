import React, { useState } from 'react';
import { LocationConfig } from '../types';
import { LOCATIONS } from '../config/locations';
import { MapPin, Navigation, Save, AlertTriangle, ShieldCheck } from 'lucide-react';

const LocationManager: React.FC = () => {
    // In a real app with backend, we would fetch/save. 
    // Here we display the code config and allow "Simulation" via local state.
    const [locations] = useState<LocationConfig[]>(LOCATIONS);

    return (
        <div className="space-y-6 animate-fade-in max-w-6xl mx-auto pb-20">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-3">
                        <MapPin className="text-blue-600" />
                        إدارة المواقع الجغرافية (Geofences)
                    </h2>
                    <p className="text-slate-500 dark:text-slate-400 mt-2">
                        تحديد النطاقات الجغرافية المسموح فيها بالتحضير الذكي عبر الهاتف.
                    </p>
                </div>
                <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 border border-blue-100 dark:border-blue-800">
                    <ShieldCheck size={16} />
                    إجمالي المواقع: {locations.length}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {locations.map((loc) => (
                    <div key={loc.id} className="group relative bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-100 dark:border-slate-800 shadow-xl shadow-slate-200/50 dark:shadow-none hover:shadow-2xl hover:-translate-y-1 transition-all duration-300">

                        {/* Header / Name */}
                        <div className="flex items-start justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${loc.lat === 0 ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30' : 'bg-blue-100 text-blue-600 dark:bg-blue-900/30'
                                    }`}>
                                    <Navigation size={24} className={loc.lat === 0 ? '' : 'rotate-45'} />
                                </div>
                                <div>
                                    <h3 className="font-bold text-lg text-slate-800 dark:text-white">{loc.name}</h3>
                                    <code className="text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded font-mono">{loc.id}</code>
                                </div>
                            </div>
                            <div className={`w-3 h-3 rounded-full ${loc.active ? 'bg-green-500 shadow-lg shadow-green-500/50' : 'bg-slate-300'}`} />
                        </div>

                        {/* Coordinates Display */}
                        <div className="space-y-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4 border border-slate-100 dark:border-slate-700/50">
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-500 dark:text-slate-400">خط العرض (Lat)</span>
                                <span className="font-mono font-bold text-slate-700 dark:text-slate-200">{loc.lat.toFixed(6)}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-500 dark:text-slate-400">خط الطول (Lng)</span>
                                <span className="font-mono font-bold text-slate-700 dark:text-slate-200">{loc.lng.toFixed(6)}</span>
                            </div>
                            <div className="pt-2 mt-2 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center">
                                <span className="text-xs font-bold text-slate-500">نطاق السماح (Radius)</span>
                                <span className="text-xs font-bold bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-2 py-1 rounded-lg">
                                    {loc.radius} متر
                                </span>
                            </div>
                        </div>

                        {/* Warning for unconfigured */}
                        {loc.lat === 0 && (
                            <div className="mt-4 flex items-center gap-2 text-amber-600 dark:text-amber-400 text-xs font-bold bg-amber-50 dark:bg-amber-900/10 p-3 rounded-xl border border-amber-100 dark:border-amber-900/30">
                                <AlertTriangle size={16} />
                                يجب تحديث الإحداثيات في الملف
                            </div>
                        )}

                        {/* Hover Actions */}
                        <div className="absolute inset-x-0 bottom-0 p-4 translate-y-full opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm rounded-b-3xl border-t dark:border-slate-800 flex justify-center">
                            <a
                                href={`https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}`}
                                target="_blank"
                                rel="noreferrer"
                                className={`text-xs font-bold flex items-center gap-1 ${loc.lat === 0 ? 'pointer-events-none text-slate-400' : 'text-blue-600 hover:underline'}`}
                            >
                                فتح في خرائط Google
                            </a>
                        </div>
                    </div>
                ))}
            </div>

            <div className="mt-10 p-6 bg-slate-900 rounded-2xl text-slate-400 text-sm font-mono border border-slate-800">
                <p className="mb-2 text-slate-300 font-bold flex items-center gap-2">
                    <Save size={16} />
                    كيفية تحديث الإحداثيات:
                </p>
                <p>1. افتح الملف: <span className="text-yellow-400">config/locations.ts</span></p>
                <p>2. عدل قيم <span className="text-blue-400">lat</span> و <span className="text-blue-400">lng</span> للموقع المطلوب.</p>
                <p>3. احفظ الملف وسيتم تحديث النظام فوراً.</p>
                <br />
                <p className="text-xs opacity-50">نستخدم التخزين في الملف لضمان الثبات والأمان وعدم الحاجة لقاعدة بيانات خارجية.</p>
            </div>
        </div>
    );
};

export default LocationManager;
