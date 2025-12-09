import { Device } from '../types';

export interface ShiftConfig {
    start: string;
    end: string;
}

export interface DeviceRule {
    matcher: (device: Device) => boolean; // Function to match a device (by SN or Alias)
    shifts: ShiftConfig[];
    aliasOverride?: string; // Optional: Force a specific alias name
}

// ----------------------------------------------------------------------
// ⚙️ إعدادات الورديات (تعديل الأكواد مباشرة هنا)
// ----------------------------------------------------------------------

export const DEVICE_RULES: DeviceRule[] = [
    {
        // 1. القسم النسائي (Ladies Section)
        // Match by Name (contains 'نسائي' or 'ladies') OR specific SN if you know it
        matcher: (d) => (d.alias || '').includes('نسائي') || (d.alias || '').toLowerCase().includes('ladies'),
        shifts: [
            { start: '08:00', end: '14:55' }, // الفترة الأولى: 8:00 ص - 2:55 م
            { start: '15:10', end: '23:00' }  // الفترة الثانية: 3:10 م - 11:00 م
        ],
        aliasOverride: 'القسم النسائي'
    },
    {
        // 2. مثال: الفرع الرئيسي (Main Branch)
        // قاعدة افتراضية لأي جهاز آخر لا يطابق القواعد أعلاه
        // يمكنك تكرار هذا النمط لأجهزة أخرى بواسطة SN
        matcher: (d) => d.sn === 'YOUR_PF_DEVICE_SN',
        shifts: [
            { start: '09:00', end: '17:00' }
        ]
    },
    // ... يمكنك إضافة المزيد من القواعد هنا
];

export const DEFAULT_SHIFTS: ShiftConfig[] = [
    { start: '08:00', end: '16:00' } // الافتراضي لباقي الأجهزة
];


// Helper function to resolve config for a device
export const getDeviceConfig = (device: { sn: string; alias?: string; }) => {
    // 1. Try to find a matching rule
    const rule = DEVICE_RULES.find(r => r.matcher(device as Device));

    // 2. Return config or defaults
    return {
        alias: rule?.aliasOverride || device.alias || `جهاز ${device.sn}`,
        shifts: rule?.shifts && rule.shifts.length > 0 ? rule.shifts : DEFAULT_SHIFTS
    };
};
