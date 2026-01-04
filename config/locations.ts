import { LocationConfig } from '../types';

export const LOCATIONS: LocationConfig[] = [
    {
        id: 'ADMIN',
        name: 'الإدارة',
        lat: 26.3668611,
        lng: 43.9089722,
        radius: 15,
        active: true
    },
    {
        id: 'QASSIM_SHOPS',
        name: 'محلات القصيم',
        lat: 26.3522500,
        lng: 43.9499167,
        radius: 15,
        active: true
    },
    {
        id: 'RIYADH',
        name: 'معرض الرياض',
        lat: 24.6425281,
        lng: 46.7240967,
        radius: 15,
        active: true
    },
    {
        id: 'QASSIM_WH',
        name: 'مستودع القصيم', // Mapped to Iron2 (Al Quraishi WH)
        lat: 26.2426731,
        lng: 44.0251749,
        radius: 25,
        active: true
    },
    {
        id: 'TABARJAL',
        name: 'فرع طبرجل',
        lat: 30.1468929,
        lng: 38.3993353,
        radius: 15,
        active: true
    },
    {
        id: 'WADI_DAWASIR',
        name: 'فرع وادي الدواسر',
        lat: 20.4551073,
        lng: 44.8291926,
        radius: 15,
        active: true
    },
    {
        id: 'SARRAR',
        name: 'فرع الصرار',
        lat: 26.9747897,
        lng: 48.3935929,
        radius: 15,
        active: true
    },
    {
        id: 'QASSIM_IRON',
        name: 'مستودع الحديد القصيم', // Mapped to Iron1
        lat: 26.388297,
        lng: 44.027435,
        radius: 25,
        active: true
    },
    {
        id: 'DAMMAM',
        name: 'فرع الدمام',
        lat: 26.3968125,
        lng: 50.0398125,
        radius: 15,
        active: true
    },
    {
        id: 'LADIES',
        name: 'القسم النسائي',
        lat: 26.3748889,
        lng: 43.895,
        radius: 15,
        active: true
    }
];
