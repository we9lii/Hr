import React, { useState, useEffect } from 'react';
import { UserPlus, Search, User, Briefcase, MapPin, Calendar, Check, X, Building2, Trash2, Mail, Pencil, ClipboardList, FileText, CalendarClock, Clock, AlertCircle } from 'lucide-react';
import { fetchAllEmployees, createEmployee, deleteEmployee, fetchDepartments, fetchAreas, fetchPositions, updateEmployee, createManualTransaction, fetchAttendanceLogsRange, deleteTransaction, updateTransaction } from '../services/api';

const Employees: React.FC = () => {
    // Extended type to include potential extra fields we might fetch individually later, 
    // but for the list we usually just have basic info. 
    // Ideally we should fetch full details when editing.
    const [employees, setEmployees] = useState<{ id: any; code: string; name: string }[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    // Meta Data State
    const [departments, setDepartments] = useState<any[]>([]);
    const [areas, setAreas] = useState<any[]>([]);
    const [positions, setPositions] = useState<any[]>([]);

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);
    const [editId, setEditId] = useState<any>(null);

    // Manual Log Modal State
    const [isManualModalOpen, setIsManualModalOpen] = useState(false);
    const [manualSearch, setManualSearch] = useState('');
    const [showEmpList, setShowEmpList] = useState(false);
    const [manualData, setManualData] = useState({
        emp_code: '',
        punch_time: '',
        punch_state: '0',
        purpose: ''
    });
    // Edit/Delete Logs State
    const [activeTab, setActiveTab] = useState<'employees' | 'logs'>('employees');
    const [logs, setLogs] = useState<any[]>([]);
    const [loadingLogs, setLoadingLogs] = useState(false);
    const [editLogId, setEditLogId] = useState<string | null>(null);

    const [formData, setFormData] = useState({
        emp_code: '',
        first_name: '',
        last_name: '',
        department: '',
        position: '', // Now ID
        hire_date: new Date().toISOString().split('T')[0],
        mobile: '',
        email: '',
        area: ''
    });
    const [submitting, setSubmitting] = useState(false);

    // Load Data
    const loadData = async () => {
        setLoading(true);
        try {
            const [emps, depts, ars, pos] = await Promise.all([
                fetchAllEmployees(),
                fetchDepartments(),
                fetchAreas(),
                fetchPositions()
            ]);
            setEmployees(emps);
            setDepartments(depts);
            setAreas(ars);
            setPositions(pos);

            // Set Defaults if empty - REMOVED, now handled by resetForm
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => {
        if (activeTab === 'logs') {
            loadManualLogs();
        }
    }, [activeTab]);

    const loadManualLogs = async () => {
        setLoadingLogs(true);
        try {
            const now = new Date();
            const start = new Date(now.getFullYear(), now.getMonth(), 1); // Start of month
            const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59); // End of month
            const allLogs = await fetchAttendanceLogsRange(start, end);
            // Filter strictly for logs that look like manual entries or have a purpose
            // Or terminal_sn='Manual-Web' (assuming we stick to that convention)
            const manualOnly = allLogs.filter(l => l.purpose || l.deviceSn === 'Manual-Web' || (l as any).verify_type === 20 || l.type === 'ABSENCE' as any);
            setLogs(manualOnly);
        } catch (e) {
            console.error(e);
        } finally {
            setLoadingLogs(false);
        }
    };

    const resetForm = () => {
        setFormData({
            emp_code: '',
            first_name: '',
            last_name: '',
            department: departments.length > 0 ? String(departments[0].id) : '',
            position: positions.length > 0 ? String(positions[0].id) : '',
            hire_date: new Date().toISOString().split('T')[0],
            mobile: '',
            email: '',
            area: areas.length > 0 ? String(areas[0].id) : ''
        });
        setIsEditMode(false);
        setEditId(null);
    };

    const handleOpenAdd = () => {
        resetForm();
        setIsModalOpen(true);
    };

    // Prepare Manual Log Modal
    const handleOpenManualLog = () => {
        // Default to first employee if available or empty
        const defaultCode = employees.length > 0 ? employees[0].code : '';
        const defaultName = employees.length > 0 ? employees[0].name : '';

        // Format Current Date Time for Input (YYYY-MM-DDTHH:mm)
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const mins = String(now.getMinutes()).padStart(2, '0');
        const defaultTime = `${year}-${month}-${day}T${hours}:${mins}`;

        setManualData({
            emp_code: defaultCode,
            punch_time: defaultTime,
            punch_state: '0',
            purpose: ''
        });
        setManualSearch(defaultName);
        setShowEmpList(false);
        setEditLogId(null); // Reset Edit Mode
        setIsManualModalOpen(true);
    };

    const handleEditLog = (log: any) => {
        setEditLogId(log.id);
        const pTime = log.timestamp.slice(0, 16); // YYYY-MM-DDTHH:mm

        let pState = '0';
        if (log.type === 'CHECK_IN') pState = '0';
        if (log.type === 'CHECK_OUT') pState = '1';
        if (log.type === 'BREAK_OUT') pState = '2';
        if (log.type === 'BREAK_IN') pState = '3';
        if (log.type === 'OVERTIME_IN') pState = '4';
        if (log.type === 'OVERTIME_OUT') pState = '5';
        if (log.purpose && log.purpose.includes('غياب')) pState = '100'; // Custom for UI

        setManualData({
            emp_code: log.employeeId,
            punch_time: pTime,
            punch_state: pState,
            purpose: log.purpose || ''
        });
        setManualSearch(log.employeeName);
        setIsManualModalOpen(true);
    };

    const handleDeleteLog = async (id: string) => {
        if (!confirm('هل أنت متأكد من حذف هذا السجل؟ لا يمكن التراجع عن هذا الإجراء.')) return;
        try {
            await deleteTransaction(id);
            setLogs(prev => prev.filter(l => l.id !== id));
            alert('تم الحذف بنجاح');
        } catch (e: any) {
            alert(e.message);
        }
    };

    const handleManualSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // VALIDATION: If Absence (State 4), Reason is mandatory
        if (manualData.punch_state === '4' && !manualData.purpose.trim()) {
            alert('⚠️ يجب كتابة سبب الغياب عند اختيار حالة "غياب".');
            return;
        }

        setSubmitting(true);
        setSubmitting(true);
        try {
            // Convert local input time to "YYYY-MM-DD HH:mm:ss"
            const pTime = manualData.punch_time.replace('T', ' ') + ':00'; // Append seconds

            let finalState = manualData.punch_state;
            let finalPurpose = manualData.purpose;

            // Handle Custom "Absence" State (100)
            if (manualData.punch_state === '100') {
                finalState = '0'; // Record as Check-In (or 1 Check-Out) to register event
                finalPurpose = `غياب: ${manualData.purpose}`;
            }

            if (editLogId) {
                await updateTransaction(editLogId, {
                    punch_time: pTime,
                    punch_state: finalState,
                    purpose: finalPurpose
                });
                alert('تم تعديل السجل بنجاح ✅');
                if (activeTab === 'logs') loadManualLogs();
            } else {
                await createManualTransaction({
                    emp_code: manualData.emp_code,
                    punch_time: pTime,
                    punch_state: finalState,
                    purpose: finalPurpose
                });
                alert('تم تسجيل الملاحظة / الحركة بنجاح ✅');
                if (activeTab === 'logs') loadManualLogs();
            }

            setIsManualModalOpen(false);
        } catch (err: any) {
            alert(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    const handleEdit = async (emp: any) => {
        // ideally we fetch full details here.
        // For now we populate what we can, but some fields like email might be missing from the list view.
        // We might need a fetchEmployeeDetails API if the list doesn't have everything.
        // Assuming user wants to add/edit basic info.

        setIsEditMode(true);
        setEditId(emp.id);

        // Try to split name if first/last not separate
        const nameParts = emp.name.split(' ');
        const first = nameParts[0];
        const last = nameParts.slice(1).join(' ');

        setFormData({
            emp_code: emp.code,
            first_name: first,
            last_name: last,
            department: emp.department_id ? String(emp.department_id) : (departments.length > 0 ? String(departments[0].id) : ''), // Default or fetch actual
            position: emp.position_id ? String(emp.position_id) : (positions.length > 0 ? String(positions[0].id) : ''),
            hire_date: emp.hire_date ? emp.hire_date.split('T')[0] : new Date().toISOString().split('T')[0], // Default
            mobile: emp.mobile || '',
            email: emp.email || '',
            area: emp.area_id ? String(emp.area_id) : (areas.length > 0 ? String(areas[0].id) : '')
        });

        // NOTE: Since the list endpoint is lightweight, we might be missing specific fields like email or mobile 
        // when opening edit from the list. 
        // To do this properly, we should fetch the specific employee details.
        // However, for this iteration, let's open the form.
        setIsModalOpen(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            // Construct Payload
            const payload: any = {
                emp_code: formData.emp_code,
                first_name: formData.first_name,
                last_name: formData.last_name,
                department: parseInt(formData.department) || undefined,
                area: [parseInt(formData.area) || 1], // Usually an array in BioTime
                hire_date: formData.hire_date,
                position: parseInt(formData.position) || undefined, // ID usually
                mobile: formData.mobile,
                email: formData.email,
                active: true
            };

            if (isEditMode && editId) {
                await updateEmployee(editId, payload);
                alert('تم تحديث بيانات الموظف بنجاح 🔄');
            } else {
                await createEmployee(payload);
                alert('تم إضافة الموظف بنجاح ✅');
            }

            setIsModalOpen(false);

            // Reload employees and just keep meta
            const emps = await fetchAllEmployees();
            setEmployees(emps);
            resetForm();

        } catch (err: any) {
            alert(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (id: any, name: string) => {
        if (!window.confirm(`هل أنت متأكد من حذف الموظف ${name}؟ \nلا يمكن التراجع عن هذا الإجراء.`)) return;

        try {
            setLoading(true);
            await deleteEmployee(id);
            alert('تم حذف الموظف بنجاح 🗑️');
            const emps = await fetchAllEmployees();
            setEmployees(emps);
        } catch (e: any) {
            alert(e.message);
            setLoading(false);
        }
    };

    const filtered = employees.filter(e =>
        e.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.code.includes(searchTerm)
    );

    return (
        <div className="space-y-6 animate-fade-in pb-20">

            {/* Header */}
            <div className="bg-slate-900/80 backdrop-blur-2xl p-6 rounded-3xl border border-white/10 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500 opacity-80" />

                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div>
                        <h2 className="text-2xl font-black text-white flex items-center gap-3">
                            <div className="p-3 bg-blue-500/10 rounded-2xl backdrop-blur-sm border border-blue-500/20 text-blue-400">
                                <UserPlus size={24} />
                            </div>
                            إدارة الموظفين
                        </h2>
                        <p className="text-slate-400 text-sm font-medium mt-2 mr-14">
                            إضافة وتعديل بيانات الموظفين وتسجيل الحركات اليدوية
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleOpenManualLog}
                            className="flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl shadow-lg shadow-purple-500/20 transition-all active:scale-95"
                        >
                            <ClipboardList size={18} />
                            <span>تسجيل حركة / عذر</span>
                        </button>

                        <button
                            onClick={handleOpenAdd}
                            className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-lg shadow-blue-500/20 transition-all active:scale-95"
                        >
                            <UserPlus size={18} />
                            <span>إضافة موظف جديد</span>
                        </button>
                    </div>
                </div>

                {/* Tab Switcher */}
                <div className="mt-8 flex items-center gap-4 border-b border-slate-800 pb-1">
                    <button
                        onClick={() => setActiveTab('employees')}
                        className={`pb-3 px-4 font-bold transition-all border-b-2 ${activeTab === 'employees' ? 'text-blue-500 border-blue-500' : 'text-slate-400 border-transparent hover:text-slate-300'}`}
                    >
                        قائمة الموظفين
                    </button>
                    <button
                        onClick={() => setActiveTab('logs')}
                        className={`pb-3 px-4 font-bold transition-all border-b-2 ${activeTab === 'logs' ? 'text-purple-500 border-purple-500' : 'text-slate-400 border-transparent hover:text-slate-300'}`}
                    >
                        سجل الحركات اليدوية
                    </button>
                </div>

                {/* Content Area */}
                <div className="mt-6">
                    {activeTab === 'employees' ? (
                        <>
                            {/* Search Bar */}
                            <div className="bg-slate-800/50 p-2 rounded-2xl border border-slate-700/50 flex mb-8">
                                <div className="relative flex-1">
                                    <input
                                        type="text"
                                        placeholder="بحث عن موظف بالاسم أو الرقم..."
                                        value={searchTerm}
                                        onChange={e => setSearchTerm(e.target.value)}
                                        className="w-full pl-4 pr-12 py-3 bg-slate-900 rounded-xl border border-slate-700 text-white focus:outline-none focus:border-blue-500 transition-colors"
                                    />
                                    <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
                                </div>
                            </div>

                            {/* Employee Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in-up">
                                {filtered.map(emp => (
                                    <div key={emp.id} className="group relative bg-slate-900 border border-slate-800 hover:border-blue-500/50 rounded-3xl p-6 transition-all hover:shadow-2xl hover:shadow-blue-500/10 hover:-translate-y-1">
                                        <div className="flex items-start justify-between mb-6">
                                            <div className="flex items-center gap-4">
                                                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-xl font-bold text-white shadow-lg shadow-blue-500/20">
                                                    {emp.first_name ? emp.first_name[0] : <User />}
                                                </div>
                                                <div>
                                                    <h3 className="font-bold text-white text-lg group-hover:text-blue-400 transition-colors">
                                                        {emp.first_name} {emp.last_name}
                                                    </h3>
                                                    <p className="text-slate-400 font-mono text-sm bg-slate-800/50 px-2 py-0.5 rounded-lg w-fit mt-1">
                                                        {emp.emp_code}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => handleEdit(emp)} className="p-2 bg-slate-800 hover:bg-blue-500/20 text-slate-400 hover:text-blue-400 rounded-xl transition-colors">
                                                    <Pencil size={18} />
                                                </button>
                                                <button onClick={() => handleDelete(emp.id, emp.name)} className="p-2 bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded-xl transition-colors">
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        </div>

                                        <div className="space-y-3">
                                            <div className="flex items-center gap-3 text-slate-400 text-sm bg-slate-950/50 p-3 rounded-xl border border-slate-800/50">
                                                <Mail size={16} className="text-blue-500/70" />
                                                <span className="text-slate-300 truncate" title={emp.email}>{emp.email || 'لا يوجد بريد إلكتروني'}</span>
                                            </div>
                                            <div className="flex items-center gap-3 text-slate-400 text-sm bg-slate-950/50 p-3 rounded-xl border border-slate-800/50">
                                                <Building2 size={16} className="text-purple-500/70" />
                                                <span className="text-slate-300">{emp.dept_name || 'عام'}</span>
                                            </div>
                                            <div className="flex items-center gap-3 text-slate-400 text-sm bg-slate-950/50 p-3 rounded-xl border border-slate-800/50">
                                                <MapPin size={16} className="text-emerald-500/70" />
                                                <span className="text-slate-300">{emp.area_name || 'غير محدد'}</span>
                                            </div>
                                            <div className="flex items-center gap-3 text-slate-400 text-sm bg-slate-950/50 p-3 rounded-xl border border-slate-800/50">
                                                <Calendar size={16} className="text-orange-500/70" />
                                                <span className="text-slate-300">{emp.hire_date || 'غير محدد'}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {filtered.length === 0 && (
                                    <div className="col-span-full h-64 flex flex-col items-center justify-center text-slate-500 bg-slate-900/50 rounded-3xl border border-dashed border-slate-800">
                                        <Search size={48} className="mb-4 opacity-50" />
                                        <p>لا توجد نتائج مطابقة للبحث</p>
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        // Manual Logs Table
                        <div className="bg-slate-900/50 border border-slate-800 rounded-3xl overflow-hidden animate-fade-in">
                            <div className="overflow-x-auto">
                                <table className="w-full text-right">
                                    <thead className="bg-slate-800/50 text-slate-400 text-sm font-bold uppercase tracking-wider">
                                        <tr>
                                            <th className="p-5">الموظف</th>
                                            <th className="p-5">التوقيت</th>
                                            <th className="p-5">الحالة</th>
                                            <th className="p-5">السبب / الملاحظة</th>
                                            <th className="p-5 text-center">إجراءات</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800">
                                        {logs.length === 0 && !loadingLogs && (
                                            <tr><td colSpan={5} className="p-12 text-center text-slate-500 flex flex-col items-center gap-2">
                                                <AlertCircle size={32} className="opacity-50" />
                                                لا توجد سجلات يدوية لهذا الشهر
                                            </td></tr>
                                        )}
                                        {loadingLogs && (
                                            <tr><td colSpan={5} className="p-12 text-center text-slate-500">جاري تحميل السجلات... <Clock className="inline animate-spin ml-2" size={16} /></td></tr>
                                        )}
                                        {logs.map(log => (
                                            <tr key={log.id} className="hover:bg-slate-800/30 transition-colors group">
                                                <td className="p-5 font-medium text-white">
                                                    <div className="flex flex-col">
                                                        <span>{log.employeeName}</span>
                                                        <span className="text-xs text-slate-500 font-mono">{log.employeeId}</span>
                                                    </div>
                                                </td>
                                                <td className="p-5 text-slate-300 font-mono" dir="ltr">
                                                    {new Date(log.timestamp).toLocaleString('en-GB', { hour12: true })}
                                                </td>
                                                <td className="p-5">
                                                    <span className={`px-2 py-1 rounded-lg text-xs font-bold ${(log.purpose && log.purpose.includes('غياب')) ? 'bg-red-500/10 text-red-500 border border-red-500/20' :
                                                        log.type === 'CHECK_IN' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' :
                                                            'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                                                        }`}>
                                                        {(log.purpose && log.purpose.includes('غياب')) ? 'غياب' :
                                                            log.type === 'CHECK_IN' ? 'دخول' : 'خروج'}
                                                    </span>
                                                </td>
                                                <td className="p-5 text-slate-400 text-sm max-w-xs truncate" title={log.purpose}>
                                                    {log.purpose || '-'}
                                                </td>
                                                <td className="p-5">
                                                    <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button onClick={() => handleEditLog(log)} className="p-2 bg-slate-800 hover:bg-blue-500/20 text-slate-400 hover:text-blue-400 rounded-lg transition-colors">
                                                            <Pencil size={16} />
                                                        </button>
                                                        <button onClick={() => handleDeleteLog(log.id)} className="p-2 bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded-lg transition-colors">
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </div>



            {/* Add Employee Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto custom-scrollbar">

                        {/* Modal Header */}
                        <div className="flex items-center justify-between p-6 border-b border-slate-800 bg-slate-800/30">
                            <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                <UserPlus size={24} className="text-blue-500" />
                                {isEditMode ? 'تعديل بيانات الموظف' : 'إضافة موظف جديد'}
                            </h3>
                            <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-700 rounded-full text-slate-400 hover:text-white transition-colors">
                                <X size={20} />
                            </button>
                        </div>

                        {/* Modal Body (Form) */}
                        <form onSubmit={handleSubmit} className="p-6 space-y-8">

                            {/* Section 1: Basic Info */}
                            <div className="space-y-4">
                                <h4 className="text-sm font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                                    <User size={16} /> البيانات الشخصية
                                </h4>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {/* Emp Code */}
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-slate-300">الرقم الوظيفي (Personal ID) <span className="text-red-500">*</span></label>
                                        <input
                                            type="text"
                                            required
                                            disabled={isEditMode} // Usually shouldn't change ID
                                            value={formData.emp_code}
                                            onChange={e => setFormData({ ...formData, emp_code: e.target.value })}
                                            className={`w - full p - 3 bg - slate - 950 border border - slate - 800 rounded - xl text - white focus: border - blue - 500 focus: ring - 1 focus: ring - blue - 500 outline - none transition - all font - mono ${isEditMode ? 'opacity-50 cursor-not-allowed' : ''} `}
                                            placeholder="مثال: 1010"
                                        />
                                    </div>

                                    {/* Hiring Date */}
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-slate-300">تاريخ التعيين</label>
                                        <input
                                            type="date"
                                            value={formData.hire_date}
                                            onChange={e => setFormData({ ...formData, hire_date: e.target.value })}
                                            className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-white focus:border-blue-500 outline-none transition-all"
                                        />
                                    </div>

                                    {/* First Name */}
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-slate-300">الاسم الأول <span className="text-red-500">*</span></label>
                                        <input
                                            type="text"
                                            required
                                            value={formData.first_name}
                                            onChange={e => setFormData({ ...formData, first_name: e.target.value })}
                                            className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-white focus:border-blue-500 outline-none transition-all"
                                            placeholder="محمد"
                                        />
                                    </div>

                                    {/* Last Name */}
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-slate-300">الاسم الأخير</label>
                                        <input
                                            type="text"
                                            value={formData.last_name}
                                            onChange={e => setFormData({ ...formData, last_name: e.target.value })}
                                            className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-white focus:border-blue-500 outline-none transition-all"
                                            placeholder="أحمد"
                                        />
                                    </div>

                                    {/* Email - NEW */}
                                    <div className="space-y-2 col-span-2">
                                        <label className="text-xs font-bold text-slate-300 flex items-center gap-1">
                                            <Mail size={12} /> البريد الإلكتروني
                                        </label>
                                        <input
                                            type="email"
                                            value={formData.email}
                                            onChange={e => setFormData({ ...formData, email: e.target.value })}
                                            className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-white focus:border-blue-500 outline-none transition-all"
                                            placeholder="employee@example.com"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="w-full h-px bg-slate-800/50" />

                            {/* Section 2: Work Info */}
                            <div className="space-y-4">
                                <h4 className="text-sm font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                                    <Briefcase size={16} /> معلومات العمل
                                </h4>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {/* Department */}
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-slate-300">القسم</label>
                                        <div className="relative">
                                            <select
                                                value={formData.department}
                                                onChange={e => setFormData({ ...formData, department: e.target.value })}
                                                className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-white focus:border-blue-500 outline-none appearance-none"
                                            >
                                                {departments.map(d => (
                                                    <option key={d.id} value={d.id}>{d.dept_name || d.name || d.alias || `Dept ${d.id} `}</option>
                                                ))}
                                                {departments.length === 0 && <option value="1">الرئيسي (افتراضي)</option>}
                                            </select>
                                            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={16} />
                                        </div>
                                    </div>

                                    {/* Area */}
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-slate-300">المنطقة (الموقع)</label>
                                        <div className="relative">
                                            <select
                                                value={formData.area}
                                                onChange={e => setFormData({ ...formData, area: e.target.value })}
                                                className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-white focus:border-blue-500 outline-none appearance-none"
                                            >
                                                {areas.map(a => (
                                                    <option key={a.id} value={a.id}>{a.area_name || a.name || `Area ${a.id} `}</option>
                                                ))}
                                                {areas.length === 0 && <option value="1">المقر الرئيسي (افتراضي)</option>}
                                            </select>
                                            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={16} />
                                        </div>
                                    </div>

                                    {/* Position */}
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-slate-300">المسمى الوظيفي</label>
                                        <div className="relative">
                                            <select
                                                value={formData.position}
                                                onChange={e => setFormData({ ...formData, position: e.target.value })}
                                                className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-white focus:border-blue-500 outline-none appearance-none"
                                            >
                                                <option value="">(بدون مسمى)</option>
                                                {positions.map(p => (
                                                    <option key={p.id} value={p.id}>{p.position_name || p.name || `Position ${p.id} `}</option>
                                                ))}
                                            </select>
                                            <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={16} />
                                        </div>
                                    </div>

                                    {/* Mobile */}
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-slate-300">رقم الجوال</label>
                                        <input
                                            type="tel"
                                            value={formData.mobile}
                                            onChange={e => setFormData({ ...formData, mobile: e.target.value })}
                                            className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-white focus:border-blue-500 outline-none transition-all"
                                            placeholder="050xxxxxxx"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-4 pt-4 border-t border-slate-800">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition-colors"
                                >
                                    إلغاء
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl shadow-lg shadow-blue-500/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {submitting ? 'جاري الحفظ...' : 'حفظ البيانات'}
                                    <Check className="w-5 h-5" />
                                </button>
                            </div>

                        </form>
                    </div>
                </div>
            )}

            {/* Manual Attendance Modal */}
            {isManualModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">

                        {/* Modal Header */}
                        <div className="flex items-center justify-between p-6 border-b border-slate-800 bg-slate-800/30">
                            <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                <ClipboardList size={24} className="text-purple-500" />
                                {editLogId ? 'تعديل حركة / عذر' : 'تسجيل حركة / عذر يدوي'}
                            </h3>
                            <button onClick={() => setIsManualModalOpen(false)} className="p-2 hover:bg-slate-700 rounded-full text-slate-400 hover:text-white transition-colors">
                                <X size={20} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <form onSubmit={handleManualSubmit} className="p-6 space-y-6">

                            {/* Employee Select (Searchable) */}
                            <div className="space-y-2 relative" ref={(node) => {
                                // Click outside handler to close list could go here, for simplicity we just rely on selection
                            }}>
                                <label className="text-xs font-bold text-slate-300">الموظف <span className="text-red-500">*</span></label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        value={manualSearch}
                                        onChange={(e) => {
                                            setManualSearch(e.target.value);
                                            setShowEmpList(true);
                                        }}
                                        onFocus={() => setShowEmpList(true)}
                                        className="w-full p-3 pl-10 bg-slate-950 border border-slate-800 rounded-xl text-white focus:border-purple-500 outline-none font-mono"
                                        placeholder="اكتب اسم الموظف..."
                                    />
                                    <User className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={16} />

                                    {showEmpList && (
                                        <div className="absolute top-full left-0 w-full mt-1 max-h-48 overflow-y-auto bg-slate-900 border border-slate-700 rounded-xl shadow-xl z-50 custom-scrollbar">
                                            {employees
                                                .filter(e => e.name.toLowerCase().includes(manualSearch.toLowerCase()) || e.code.includes(manualSearch))
                                                .map(e => (
                                                    <div
                                                        key={e.code}
                                                        onClick={() => {
                                                            setManualData({ ...manualData, emp_code: e.code });
                                                            setManualSearch(e.name); // Set display name
                                                            setShowEmpList(false); // Close list
                                                        }}
                                                        className="p-3 hover:bg-slate-800 cursor-pointer text-slate-300 hover:text-white flex justify-between items-center border-b border-slate-800/50 last:border-0"
                                                    >
                                                        <span>{e.name}</span>
                                                        <span className="text-xs bg-slate-800 px-2 py-1 rounded text-slate-400">{e.code}</span>
                                                    </div>
                                                ))}
                                            {employees.filter(e => e.name.toLowerCase().includes(manualSearch.toLowerCase()) || e.code.includes(manualSearch)).length === 0 && (
                                                <div className="p-3 text-center text-slate-500 text-sm">لا نتائج</div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Time & State Row */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-300">وقت التسجيل <span className="text-red-500">*</span></label>
                                    <div className="relative">
                                        <input
                                            type="datetime-local"
                                            required
                                            value={manualData.punch_time}
                                            onChange={e => setManualData({ ...manualData, punch_time: e.target.value })}
                                            className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-white focus:border-purple-500 outline-none"
                                        />
                                        <CalendarClock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={16} />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-300">الحالة <span className="text-red-500">*</span></label>
                                    <div className="relative">
                                        <select
                                            value={manualData.punch_state}
                                            onChange={e => setManualData({ ...manualData, punch_state: e.target.value })}
                                            className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-white focus:border-purple-500 outline-none appearance-none"
                                        >
                                            <option value="0">تسجيل دخول (Check In)</option>
                                            <option value="1">تسجيل خروج (Check Out)</option>
                                            <option value="100">⚠️ غياب (Absence)</option> {/* Custom Logic */}
                                            <option value="4">بداية إضافي (Overtime In)</option>
                                            <option value="5">نهاية إضافي (Overtime Out)</option>
                                            <option value="2">بداية استراحة (Break Out)</option>
                                            <option value="3">نهاية استراحة (Break In)</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* Reason / Purpose */}
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-300">سبب الحركة / العذر</label>
                                <textarea
                                    value={manualData.purpose}
                                    onChange={e => setManualData({ ...manualData, purpose: e.target.value })}
                                    className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-white focus:border-purple-500 outline-none h-24 resize-none"
                                    placeholder="اكتب التبرير أو العذر هنا..."
                                />
                            </div>

                            {/* File Attachment (Placeholder) */}
                            <div className="space-y-2 opacity-50 cursor-not-allowed" title="سيتم تفعيل رفع الملفات قريباً">
                                <label className="text-xs font-bold text-slate-300 flex items-center gap-2">
                                    مرفق (عذر طبي/رسمي) <span className="text-[10px] bg-slate-700 px-2 rounded-full">Coming Soon</span>
                                </label>
                                <div className="w-full p-3 bg-slate-950 border border-slate-800 border-dashed rounded-xl text-slate-500 flex items-center justify-center gap-2">
                                    <FileText size={16} />
                                    <span>لم يتم اختيار ملف</span>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-4 pt-4 border-t border-slate-800">
                                <button
                                    type="button"
                                    onClick={() => setIsManualModalOpen(false)}
                                    className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition-colors"
                                >
                                    إلغاء
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="flex-1 bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 rounded-xl shadow-lg shadow-purple-500/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {submitting ? 'جاري الحفظ...' : (editLogId ? 'حفظ التعديلات' : 'تسجيل الحركة')}
                                    <Check className="w-5 h-5" />
                                </button>
                            </div>

                        </form>
                    </div>
                </div>
            )}

        </div>
    );
};

export default Employees;
