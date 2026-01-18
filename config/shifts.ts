import { Device } from '../types';

export interface ShiftConfig {
    start: string;
    end: string;
}

export interface ShiftHistory {
    effectiveDate: string; // YYYY-MM-DD (Date when the main 'shifts' config became active)
    shifts: ShiftConfig[]; // The OLD shifts used BEFORE effectiveDate
}

export interface DeviceRule {
    matcher: (device: Device | { sn: string, alias?: string }) => boolean;
    shifts: ShiftConfig[]; // CURRENT active shifts
    history?: ShiftHistory[]; // History of previous configs
    aliasOverride?: string;
    shiftType?: 'SPLIT' | 'ALTERNATING'; // SPLIT = Works both shifts (default). ALTERNATING = Works one of them.
}

// ----------------------------------------------------------------------
// ⚙️ إعدادات الورديات (تعديل الأكواد مباشرة هنا)
// ----------------------------------------------------------------------

export const DEVICE_RULES: DeviceRule[] = [
    // 11. جهاز تجريبي ( فيصل ) (Developers Device - Local Testing)
    {
        matcher: (d) => d.sn === 'AF4C232560143' || (d.alias || '').includes('Test'),
        // NEW SHIFTS (Effective from Jan 14, 2026)
        shifts: [
            { start: '08:00', end: '12:00' },
            { start: '15:30', end: '20:30' }
        ],
        // HISTORY (Old Shifts before Jan 14)
        history: [{
            effectiveDate: '2026-01-14',
            shifts: [
                { start: '08:00', end: '12:00' },
                { start: '15:15', end: '20:15' }
            ]
        }],
        aliasOverride: 'محلات القصيم ( 2 )'
    },



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
        // NEW SHIFTS (Effective from Jan 14, 2026)
        shifts: [
            { start: '08:00', end: '12:00' },
            { start: '15:30', end: '20:30' }
        ],
        // HISTORY (Old Shifts before Jan 14)
        history: [{
            effectiveDate: '2026-01-14',
            shifts: [
                { start: '08:00', end: '12:00' },
                { start: '15:15', end: '20:15' }
            ]
        }],
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

];

export const DEFAULT_SHIFTS: ShiftConfig[] = [
    { start: '08:00', end: '16:00' } // الافتراضي لباقي الأجهزة
];


// Helper function to resolve config for a device
export const getDeviceConfig = (device: { sn: string; alias?: string; }, targetDate?: Date | string) => {
    // 1. Try to find a matching rule
    const rule = DEVICE_RULES.find(r => r.matcher(device));

    if (!rule) {
        return {
            alias: device.alias || `جهاز ${device.sn}`,
            shifts: DEFAULT_SHIFTS,
            shiftType: 'SPLIT'
        };
    }

    // 2. Resolve Shifts based on Date
    let activeShifts = rule.shifts;

    if (targetDate && rule.history) {
        const d = (targetDate instanceof Date) ? targetDate : new Date(targetDate);
        // Normalize to YYYY-MM-DD for string comparison
        const dateStr = d.toISOString().split('T')[0];

        // Sort history by effectiveDate DESC to find the appropriate range, OR simply check specific cutoffs.
        // Logic: If current date < effectiveDate, use the history shifts.
        // We assume history entries are "Old configs that were replaced on effectiveDate".

        for (const h of rule.history) {
            if (dateStr < h.effectiveDate) {
                activeShifts = h.shifts;
                break; // Found the applicable old config
            }
        }
    }

    return {
        alias: rule.aliasOverride || device.alias || `جهاز ${device.sn}`,
        shifts: activeShifts && activeShifts.length > 0 ? activeShifts : DEFAULT_SHIFTS,
        shiftType: rule.shiftType || 'SPLIT'
    };
};
