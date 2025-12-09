import React, { useState, useEffect } from 'react';
import { Device } from '../types';
import { fetchDevices } from '../services/api';
import { Settings, Save, Clock, Plus, Trash2, Smartphone, Edit2, CheckCircle2 } from 'lucide-react';

interface DeviceManagerProps {
    onDevicesUpdated?: (devices: Device[]) => void;
}

const DeviceManager: React.FC<DeviceManagerProps> = ({ onDevicesUpdated }) => {
    const [devices, setDevices] = useState<Device[]>([]);
    const [loading, setLoading] = useState(false);
    const [expandedDevice, setExpandedDevice] = useState<string | null>(null);

    // Local state for edits before save
    const [edits, setEdits] = useState<Record<string, { alias: string; shifts: { start: string; end: string }[] }>>({});

    useEffect(() => {
        loadDevices();
    }, []);

    const loadDevices = async () => {
        setLoading(true);
        try {
            // 1. Fetch from API
            const apiDevices = await fetchDevices();

            // 2. Load Local Config
            const localConfigStr = localStorage.getItem('device_configs');
            const localConfig = localConfigStr ? JSON.parse(localConfigStr) : {};

            // 3. Merge
            const merged = apiDevices.map(d => ({
                ...d,
                alias: localConfig[d.sn]?.alias || d.alias,
                shifts: localConfig[d.sn]?.shifts || []
            }));

            setDevices(merged);
            if (onDevicesUpdated) onDevicesUpdated(merged);

            // Initialize edits state with current values
            const initialEdits: any = {};
            merged.forEach(d => {
                initialEdits[d.sn] = {
                    alias: d.alias || '',
                    shifts: d.shifts && d.shifts.length > 0 ? d.shifts : [{ start: '08:00', end: '16:00' }]
                };
            });
            setEdits(initialEdits);

        } catch (error) {
            console.error("Failed to load devices", error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = (sn: string) => {
        const edit = edits[sn];
        if (!edit) return;

        // Save to LocalStorage
        const localConfigStr = localStorage.getItem('device_configs');
        const localConfig = localConfigStr ? JSON.parse(localConfigStr) : {};

        localConfig[sn] = {
            alias: edit.alias,
            shifts: edit.shifts
        };

        localStorage.setItem('device_configs', JSON.stringify(localConfig));

        // Update Local State UI
        const updatedDevices = devices.map(d => {
            if (d.sn === sn) {
                return { ...d, alias: edit.alias, shifts: edit.shifts };
            }
            return d;
        });
        setDevices(updatedDevices);
        if (onDevicesUpdated) onDevicesUpdated(updatedDevices);

        // Collapse after save
        setExpandedDevice(null);
    };

    const updateEdit = (sn: string, field: string, value: any) => {
        setEdits(prev => ({
            ...prev,
            [sn]: { ...prev[sn], [field]: value }
        }));
    };

    const updateShift = (sn: string, index: number, field: 'start' | 'end', value: string) => {
        const currentheader = edits[sn].shifts ? [...edits[sn].shifts] : [];
        if (!currentheader[index]) return;
        currentheader[index] = { ...currentheader[index], [field]: value };
        updateEdit(sn, 'shifts', currentheader);
    };

    const addShift = (sn: string) => {
        const current = edits[sn].shifts || [];
        if (current.length >= 2) return; // Limit to 2 shifts
        updateEdit(sn, 'shifts', [...current, { start: '16:00', end: '22:00' }]);
    };

    const removeShift = (sn: string, index: number) => {
        const current = [...edits[sn].shifts];
        current.splice(index, 1);
        updateEdit(sn, 'shifts', current);
    };

    return (
        <div className="space-y-6 animate-fade-in max-w-6xl mx-auto">
            <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-lg shadow-blue-500/20 text-white">
                    <Settings size={20} />
                </div>
                <div>
                    <h2 className="text-xl font-bold text-slate-800 dark:text-white">إعدادات الأجهزة والورديات</h2>
                    <p className="text-slate-500 dark:text-slate-400 text-xs mt-1">تخصيص مسميات الأجهزة وأوقات العمل لحساب التأخير</p>
                </div>
            </div>

            {loading ? (
                <div className="text-center py-12 text-slate-400 bg-white dark:bg-[#1e293b] rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800">جاري تحميل بيانات الأجهزة...</div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {devices.map(device => {
                        const edit = edits[device.sn] || { alias: '', shifts: [] };
                        const isExpanded = expandedDevice === device.sn;

                        return (
                            <div
                                key={device.sn}
                                className={`bg-white dark:bg-[#1e293b] rounded-2xl border transition-all duration-300 relative overflow-hidden group ${isExpanded
                                        ? 'col-span-1 md:col-span-2 lg:col-span-3 border-blue-500 shadow-xl shadow-blue-500/10 ring-1 ring-blue-500/50 z-10'
                                        : 'border-slate-200 dark:border-slate-800 hover:border-blue-400/50 hover:shadow-md'
                                    }`}
                            >
                                {/* Header / Summary View */}
                                <div
                                    className="p-4 flex items-center justify-between cursor-pointer"
                                    onClick={() => setExpandedDevice(isExpanded ? null : device.sn)}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${isExpanded ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'
                                            }`}>
                                            <Smartphone size={18} />
                                        </div>
                                        <div>
                                            <div className="font-bold text-sm text-slate-800 dark:text-white flex items-center gap-2">
                                                {device.alias || `جهاز ${device.sn}`}
                                                {!isExpanded && (
                                                    <Edit2 size={12} className="opacity-0 group-hover:opacity-50 transition-opacity text-slate-400" />
                                                )}
                                            </div>
                                            <div className="text-[10px] text-slate-400 font-mono">{device.sn}</div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3">
                                        <div className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${edit.shifts.length > 0
                                                ? 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-900/20 dark:border-emerald-900/30 dark:text-emerald-400'
                                                : 'bg-slate-50 text-slate-400 border-slate-100 dark:bg-slate-800 dark:border-slate-700'
                                            }`}>
                                            {edit.shifts.length > 0 ? (edit.shifts.length === 2 ? 'فترتين' : 'فترة واحدة') : 'غير محدد'}
                                        </div>
                                    </div>
                                </div>

                                {/* Expanded / Edit View */}
                                {isExpanded && (
                                    <div className="border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 p-5 animate-fade-in backdrop-blur-sm">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                            {/* Column 1: Alias */}
                                            <div>
                                                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-2 block">اسم الجهاز (الفرع)</label>
                                                <div className="relative">
                                                    <input
                                                        type="text"
                                                        value={edit.alias}
                                                        onChange={(e) => updateEdit(device.sn, 'alias', e.target.value)}
                                                        placeholder="أدخل اسماً مميزاً للجهاز..."
                                                        className="w-full pl-3 pr-3 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/50 outline-none transition-shadow"
                                                    />
                                                </div>
                                                <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                                                    يساعدك الاسم المستعار في تمييز الأجهزة في التقارير (مثال: الفرع الرئيسي - مدخل الموظفين).
                                                </p>
                                            </div>

                                            {/* Column 2: Shifts */}
                                            <div>
                                                <div className="flex items-center justify-between mb-3">
                                                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400">إعداد الفترات والدوام</label>
                                                    {edit.shifts.length < 2 && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); addShift(device.sn); }}
                                                            className="text-[10px] font-bold text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 px-2 py-1 rounded-lg transition-colors flex items-center gap-1"
                                                        >
                                                            <Plus size={12} />
                                                            إضافة فترة
                                                        </button>
                                                    )}
                                                </div>

                                                <div className="space-y-2">
                                                    {edit.shifts.length === 0 ? (
                                                        <div className="p-4 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl text-center">
                                                            <Clock size={20} className="mx-auto text-slate-300 mb-2" />
                                                            <p className="text-xs text-slate-400">لم يتم تحديد فترات.<br />سيتم احتساب التأخير من 8:00 ص.</p>
                                                        </div>
                                                    ) : (
                                                        edit.shifts.map((shift, idx) => (
                                                            <div key={idx} className="flex items-center gap-3 bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm relative group/shift">
                                                                <div className={`w-1.5 self-stretch rounded-full ${idx === 0 ? 'bg-orange-400' : 'bg-indigo-400'}`}></div>
                                                                <div className="flex-1">
                                                                    <div className="text-[10px] text-slate-400 font-bold mb-1">{idx === 0 ? 'الفترة الأولى' : 'الفترة الثانية'}</div>
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="bg-slate-50 dark:bg-slate-900 px-2 py-1 rounded-lg border border-slate-100 dark:border-slate-700 flex items-center gap-2">
                                                                            <span className="text-[10px] text-slate-400">من</span>
                                                                            <input
                                                                                type="time"
                                                                                value={shift.start}
                                                                                onChange={(e) => updateShift(device.sn, idx, 'start', e.target.value)}
                                                                                className="bg-transparent border-none text-xs font-bold text-slate-700 dark:text-white p-0 w-16 text-center focus:ring-0"
                                                                            />
                                                                        </div>
                                                                        <span className="text-slate-300">→</span>
                                                                        <div className="bg-slate-50 dark:bg-slate-900 px-2 py-1 rounded-lg border border-slate-100 dark:border-slate-700 flex items-center gap-2">
                                                                            <span className="text-[10px] text-slate-400">إلى</span>
                                                                            <input
                                                                                type="time"
                                                                                value={shift.end}
                                                                                onChange={(e) => updateShift(device.sn, idx, 'end', e.target.value)}
                                                                                className="bg-transparent border-none text-xs font-bold text-slate-700 dark:text-white p-0 w-16 text-center focus:ring-0"
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <button
                                                                    onClick={() => removeShift(device.sn, idx)}
                                                                    className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors absolute top-2 right-2 opacity-0 group-hover/shift:opacity-100"
                                                                >
                                                                    <Trash2 size={14} />
                                                                </button>
                                                            </div>
                                                        ))
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="mt-6 flex justify-end pt-4 border-t border-slate-200/60 dark:border-slate-700/60">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleSave(device.sn); }}
                                                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-xl text-sm font-bold shadow-lg shadow-blue-500/20 active:scale-95 transition-all flex items-center gap-2"
                                            >
                                                <CheckCircle2 size={16} />
                                                حفظ التغييرات
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default DeviceManager;
