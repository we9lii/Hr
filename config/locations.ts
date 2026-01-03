import { LocationConfig } from '../types';

export const LOCATIONS: LocationConfig[] = [
    {
        id: 'ADMIN',
        name: 'الإدارة',
        lat: 26.3668327,
        lng: 43.9089633,
        radius: 100, // 100 meters default
        active: true
    },
    {
        id: 'QASSIM_SHOPS',
        name: 'محلات القصيم',
        lat: 0,
        lng: 0,
        radius: 100,
        active: true
    },
    {
        id: 'RIYADH',
        name: 'معرض الرياض',
        lat: 0,
        lng: 0,
        radius: 100,
        active: true
    },
    {
        id: 'QASSIM_WH',
        name: 'مستودع القصيم',
        lat: 0,
        lng: 0,
        radius: 200, // Warehouses might need larger radius
        active: true
    },
    {
        id: 'TABARJAL',
        name: 'فرع طبرجل',
        lat: 0,
        lng: 0,
        radius: 100,
        active: true
    },
    {
        id: 'WADI_DAWASIR',
        name: 'فرع وادي الدواسر',
        lat: 0,
        lng: 0,
        radius: 100,
        active: true
    },
    {
        id: 'SARRAR',
        name: 'فرع الصرار',
        lat: 0,
        lng: 0,
        radius: 100,
        active: true
    },
    {
        id: 'QASSIM_IRON',
        name: 'مستودع الحديد القصيم',
        lat: 0,
        lng: 0,
        radius: 200,
        active: true
    },
    {
        id: 'DAMMAM',
        name: 'فرع الدمام',
        lat: 0,
        lng: 0,
        radius: 100,
        active: true
    },
    {
        id: 'LADIES',
        name: 'القسم النسائي',
        lat: 0,
        lng: 0,
        radius: 100,
        active: true
    }
];
