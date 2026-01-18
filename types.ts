export enum AttendanceMethod {
  FINGERPRINT = 'بصمة إصبع',
  FACE = 'بصمة وجه',
  GPS = 'تطبيق جوال (GPS)',
  CARD = 'بطاقة',
  MANUAL = 'يدوي'
}

export type UserRole = 'ADMIN' | 'EMPLOYEE';

export interface User {
  id: string;
  name: string;
  role: UserRole;
  avatar?: string;
  department?: string;
  position?: string;
}

export interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  department: string;
  position: string;
  avatarUrl?: string;
  national_id?: string;
  card_number?: string;
}

export interface LocationConfig {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radius: number; // In meters
  active: boolean;
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  timestamp: string; // ISO string
  type: 'CHECK_IN' | 'CHECK_OUT' | 'BREAK_IN' | 'BREAK_OUT';
  method: AttendanceMethod;
  location?: {
    lat: number;
    lng: number;
    address?: string;
  };
  status: 'ON_TIME' | 'LATE' | 'EARLY_LEAVE' | 'OVERTIME';
  deviceSn?: string;
  deviceAlias?: string;
  accuracy?: number;
  purpose?: string; // Reason/Excuse for manual logs
}

export interface Device {
  id: string;
  sn: string;
  alias?: string;
  areaName?: string;
  lastActivity?: string;
  shifts?: { start: string; end: string }[];
}

export interface DashboardStats {
  totalEmployees: number;
  presentToday: number;
  lateToday: number;
  onLeave: number;
}
