import { Device } from '../types';

export interface ShiftConfig {
    start: string;
    end: string;
}

export interface DeviceRule {
    matcher: (device: Device | { sn: string, alias?: string }) => boolean;
    shifts: ShiftConfig[];
    aliasOverride?: string;
    shiftType?: 'SPLIT' | 'ALTERNATING'; // SPLIT = Works both shifts (default). ALTERNATING = Works one of them.
}

// ----------------------------------------------------------------------
// ⚙️ إعدادات الورديات (تعديل الأكواد مباشرة هنا)
// ----------------------------------------------------------------------

export const DEVICE_RULES: DeviceRule[] = [
    // 1. الصرار (Al-Sarrar)
    {
        matcher: (d) => (d.alias || '').includes('الصرار'),
        shifts: [
            { start: '08:00', end: '11:30' },
            { start: '15:30', end: '20:30' }
        ],
        aliasOverride: 'فرع الصرار',
        shiftType: 'SPLIT'
    },
    // ... (Others remain SPLIT by default logic in consumers if undefined)

    // 6. القسم النسائي (Ladies Section)
    {
        matcher: (d) => (d.alias || '').includes('نسائي') || (d.alias || '').toLowerCase().includes('ladies'),
        shifts: [
            { start: '08:00', end: '15:10' },
            { start: '14:50', end: '22:00' }
        ],
        aliasOverride: 'القسم النسائي',
        shiftType: 'ALTERNATING' // Smart Recognition: Auto-detect shift based on time
    },
    // 2. مستودع الحديد القصيم (Qassim Iron Warehouse)
    {
        matcher: (d) => (d.alias || '').includes('حديد') && (d.alias || '').includes('القصيم'),
        shifts: [
            { start: '08:00', end: '17:30' }
        ],
        aliasOverride: 'مستودع الحديد القصيم'
    },
    // 3. المستودع القصيم (Qassim Warehouse - General)
    {
        matcher: (d) => (d.alias || '').includes('المستودع') && (d.alias || '').includes('القصيم') && !(d.alias || '').includes('حديد'),
        shifts: [
            { start: '08:00', end: '17:30' }
        ],
        aliasOverride: 'مستودع القصيم'
    },
    // 4. المحلات القصيم (Qassim Shops)
    {
        matcher: (d) => (d.alias || '').includes('المحلات') || ((d.alias || '').includes('محلات') && (d.alias || '').includes('القصيم')),
        shifts: [
            { start: '08:00', end: '12:00' },
            { start: '15:15', end: '20:15' }
        ],
        aliasOverride: 'محلات القصيم'
    },
    // 5. الدمام (Dammam)
    {
        matcher: (d) => (d.alias || '').includes('الدمام'),
        shifts: [
            { start: '08:00', end: '11:30' },
            { start: '15:30', end: '20:30' }
        ],
        aliasOverride: 'فرع الدمام'
    },
    // 6. القسم النسائي (Ladies Section)
    // TODO: Future Requirement - Dynamic weekly shift scheduling (Admin will define morning/evening staff weekly)
    {
        matcher: (d) => (d.alias || '').includes('نسائي') || (d.alias || '').toLowerCase().includes('ladies'),
        shifts: [
            { start: '08:00', end: '15:10' },
            { start: '14:50', end: '22:00' }
        ],
        aliasOverride: 'القسم النسائي'
    },
    // 7. الرياض المعرض (Riyadh Showroom)
    {
        matcher: (d) => (d.alias || '').includes('الرياض') || (d.alias || '').includes('المعرض'),
        shifts: [
            { start: '08:00', end: '12:00' },
            { start: '15:30', end: '20:30' }
        ],
        aliasOverride: 'معرض الرياض'
    },
    // 8. وادي الدواسر (Wadi Ad-Dawasir)
    {
        matcher: (d) => (d.alias || '').includes('الدواسر'),
        shifts: [
            { start: '08:00', end: '12:00' },
            { start: '15:30', end: '20:30' }
        ],
        aliasOverride: 'فرع وادي الدواسر'
    },
    // 9. الإدارة (Administration)
    {
        matcher: (d) => (d.alias || '').includes('الإدارة') || (d.alias || '').includes('الادارة') || (d.alias || '').includes('Admin'),
        shifts: [
            { start: '08:00', end: '17:30' }
        ],
        aliasOverride: 'الإدارة'
    },
    // 10. طبرجل (Tabarjal)
    {
        matcher: (d) => (d.alias || '').includes('طبرجل'),
        shifts: [
            { start: '08:00', end: '13:00' },
            { start: '16:30', end: '20:30' }
        ],
        aliasOverride: 'فرع طبرجل'
    },
    // 11. جهاز تجريبي ( فيصل ) (Developers Device - Local Testing)
    {
        matcher: (d) => d.sn === 'AF4C232560143' || (d.alias || '').includes('Test'),
        shifts: [
            { start: '09:00', end: '17:00' }
        ],
        aliasOverride: 'جهاز تجريبي ( فيصل )'
    }
];

export const DEFAULT_SHIFTS: ShiftConfig[] = [
    { start: '08:00', end: '16:00' } // الافتراضي لباقي الأجهزة
];


// Helper function to resolve config for a device
export const getDeviceConfig = (device: { sn: string; alias?: string; }) => {
    // 1. Try to find a matching rule
    const rule = DEVICE_RULES.find(r => r.matcher(device));

    // 2. Return config or defaults
    return {
        alias: rule?.aliasOverride || device.alias || `جهاز ${device.sn}`,
        shifts: rule?.shifts && rule.shifts.length > 0 ? rule.shifts : DEFAULT_SHIFTS,
        shiftType: rule?.shiftType || 'SPLIT'
    };
};
