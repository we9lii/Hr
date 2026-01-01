import { AttendanceMethod, AttendanceRecord, DashboardStats, User, Device } from '../types';
import { getDeviceConfig } from '../config/shifts';

// Helper to determine if a record is late based on configuration
const checkIsLate = (punchTime: Date, deviceSn?: string, deviceAlias?: string): boolean => {
  if (!deviceSn && !deviceAlias) return false; // Cannot determine without device context

  const config = getDeviceConfig({ sn: deviceSn || '', alias: deviceAlias });
  const shifts = config.shifts;

  if (!shifts || shifts.length === 0) return false;

  const punchHour = punchTime.getHours();
  const punchMin = punchTime.getMinutes();

  // Find relevant shift (Morning vs Evening split at 13:00)
  let shift = shifts[0];
  if (shifts.length > 1 && punchHour >= 13) {
    shift = shifts[1];
  }

  const [startHour, startMin] = shift.start.split(':').map(Number);

  // Calculate strict lateness (Buffer can be added here if needed, e.g. +15 mins)
  // Current logic: Late if punchTime > shiftStart + 15 minutes (matching old hardcoded logic but dynamic)
  // Converting everything to minutes for comparison
  const punchTotal = punchHour * 60 + punchMin;
  const startTotal = startHour * 60 + startMin;

  return punchTotal > (startTotal + 15);
};

// Parse ZK Punch State
const parsePunchState = (state: string | number): 'CHECK_IN' | 'CHECK_OUT' | 'BREAK_IN' | 'BREAK_OUT' => {
  const s = String(state);
  if (s === '0' || s === 'CHECK_IN') return 'CHECK_IN';
  if (s === '1' || s === 'CHECK_OUT') return 'CHECK_OUT';
  if (s === '2') return 'BREAK_OUT';
  if (s === '3') return 'BREAK_IN';
  if (s === '4') return 'CHECK_IN';
  if (s === '5') return 'CHECK_OUT';
  return 'CHECK_OUT'; // Default fallback matching old logic
};

// Real API Configuration
const API_CONFIG = {
  baseUrl: '/iclock/api',
  username: 'admin',
  password: 'Admin@123',
};

let AUTH_TOKEN: string | null = null;

const ensureAuthToken = async (): Promise<string> => {
  if (AUTH_TOKEN) return AUTH_TOKEN;
  const response = await fetch(`/jwt-api-token-auth/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: API_CONFIG.username, password: API_CONFIG.password })
  });
  if (!response.ok) {
    const t = await response.text();
    throw new Error(`Auth Error: ${response.status} - ${t}`);
  }
  const data = await response.json();
  AUTH_TOKEN = data?.token || null;
  if (!AUTH_TOKEN) throw new Error('Auth token missing');
  return AUTH_TOKEN;
};

// Helper to generate JWT Headers
const getHeaders = async () => {
  const token = await ensureAuthToken();
  return {
    'Authorization': `JWT ${token}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };
};

/**
 * LOGIN USER
 * Handles specific hardcoded super users and general API authentication
 */
export const loginUser = async (username: string, role: 'ADMIN' | 'EMPLOYEE', password?: string): Promise<User> => {
  // 1. Check for Super Admin (we9li)
  if (role === 'ADMIN' && username === 'we9li' && password === '123') {
    return {
      id: 'SA-001',
      name: 'Super Admin (we9li)',
      role: 'ADMIN',
      avatar: 'https://ui-avatars.com/api/?name=W+e&background=1e40af&color=fff&bold=true'
    };
  }

  // 2. Check for Super Employee (we9l)
  if (role === 'EMPLOYEE' && username === 'we9l' && password === '123') {
    return {
      id: 'SE-001',
      name: 'Super Employee (we9l)',
      role: 'EMPLOYEE',
      department: 'الإدارة العليا',
      position: 'مشرف عام',
      avatar: 'https://ui-avatars.com/api/?name=we9l&background=059669&color=fff&bold=true'
    };
  }

  // 3. Fallback for other users (Optional: strict mode currently rejects others)
  // To enable general access, we would ping the server here.
  // For now, based on your request to "Add account", we strictly validate these or throw error.

  // Simulate a check or throw error for invalid credentials
  throw new Error("اسم المستخدم أو كلمة المرور غير صحيحة");
};

/**
 * FETCH ATTENDANCE LOGS (REAL)
 * Connects to http://qssun.dyndns.org:8085/personnel/api/transactions/
 */
export const fetchAttendanceLogs = async (targetDate: Date = new Date()): Promise<AttendanceRecord[]> => {
  try {
    const headers = await getHeaders();
    let url = `${API_CONFIG.baseUrl}/transactions/?page_size=200&ordering=-punch_time`;
    const out: AttendanceRecord[] = [];
    const targetStr = targetDate.toDateString();
    for (let i = 0; i < 50; i++) {
      const response = await fetch(url, { method: 'GET', headers });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server Error: ${response.status} - ${errorText}`);
      }
      const raw = await response.json();
      const list: any[] = Array.isArray(raw)
        ? raw
        : Array.isArray(raw?.data)
          ? raw.data
          : Array.isArray(raw?.results)
            ? raw.results
            : [];

      if (list.length === 0 && i === 0) {
        throw new Error('لا توجد سجلات حديثة من الخادم');
      }

      let oldestDateStrOnPage: string | null = null;
      list.forEach((item: any, index: number) => {
        const punchTime = new Date(item.punch_time || item.time || item.timestamp);
        const pageStr = punchTime.toDateString();
        if (!oldestDateStrOnPage) oldestDateStrOnPage = pageStr;
        else {
          // keep oldest (given ordering=-punch_time, iteration preserves order)
          oldestDateStrOnPage = pageStr;
        }
        if (pageStr === targetStr) {
          const isLate = checkIsLate(punchTime, item.terminal_sn, item.terminal_alias || item.area_alias);
          out.push({
            id: item.id ? String(item.id) : `log-${i}-${index}`,
            employeeId: item.emp_code || item.user_id || 'UNKNOWN',
            employeeName: item.emp_name || `${item.first_name || ''} ${item.last_name || ''}`.trim() || 'Unknown Employee',
            timestamp: punchTime.toISOString(),
            type: parsePunchState(item.punch_state),
            method: item.verify_type_display === 'Face' ? AttendanceMethod.FACE :
              item.verify_type_display === 'GPS' ? AttendanceMethod.GPS :
                AttendanceMethod.FINGERPRINT,
            status: isLate ? 'LATE' : 'ON_TIME',
            location: item.gps_location && typeof item.gps_location === 'string' ? undefined : (item.latitude && item.longitude ? {
              lat: parseFloat(item.latitude),
              lng: parseFloat(item.longitude),
              address: item.area_alias || 'موقع مسجل'
            } : undefined),
            deviceSn: item.terminal_sn || undefined,
            deviceAlias: item.terminal_alias || item.area_alias || undefined
          } as AttendanceRecord);
        }
      });

      const next: string | undefined = raw?.next;
      const shouldStop = !!oldestDateStrOnPage && oldestDateStrOnPage !== targetStr;
      if (shouldStop || !next) {
        break;
      }
      url = next.startsWith('http') ? next.replace('http://qssun.dyndns.org:8085', '') : next;
    }
    return out.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  } catch (error) {
    console.error('Fetch Logs Error:', error);
    throw error;
  }
};

export const fetchAttendanceLogsRange = async (startDate: Date, endDate: Date): Promise<AttendanceRecord[]> => {
  const headers = await getHeaders();
  let url = `${API_CONFIG.baseUrl}/transactions/?page_size=200&ordering=-punch_time`;
  const out: AttendanceRecord[] = [];
  const startStr = startDate.toDateString();
  const endStr = endDate.toDateString();
  for (let i = 0; i < 50; i++) {
    const response = await fetch(url, { method: 'GET', headers });
    if (!response.ok) {
      const t = await response.text();
      throw new Error(`Server Error: ${response.status} - ${t}`);
    }
    const raw = await response.json();
    const list: any[] = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.data)
        ? raw.data
        : Array.isArray(raw?.results)
          ? raw.results
          : [];
    let oldestDateStrOnPage: string | null = null;
    for (let index = 0; index < list.length; index++) {
      const item = list[index];
      const punchTime = new Date(item.punch_time || item.time || item.timestamp);
      const pageStr = punchTime.toDateString();
      oldestDateStrOnPage = pageStr;
      if (punchTime >= startDate && punchTime <= endDate) {
        const isLate = checkIsLate(punchTime, item.terminal_sn, item.terminal_alias || item.area_alias);
        out.push({
          id: item.id ? String(item.id) : `log-${i}-${index}`,
          employeeId: item.emp_code || item.user_id || 'UNKNOWN',
          employeeName: item.emp_name || `${item.first_name || ''} ${item.last_name || ''}`.trim() || 'Unknown Employee',
          timestamp: punchTime.toISOString(),
          type: parsePunchState(item.punch_state),
          method: item.verify_type_display === 'Face' ? AttendanceMethod.FACE :
            item.verify_type_display === 'GPS' ? AttendanceMethod.GPS :
              AttendanceMethod.FINGERPRINT,
          status: isLate ? 'LATE' : 'ON_TIME',
          location: item.gps_location && typeof item.gps_location === 'string' ? undefined : (item.latitude && item.longitude ? {
            lat: parseFloat(item.latitude),
            lng: parseFloat(item.longitude),
            address: item.area_alias || 'موقع مسجل'
          } : undefined),
          deviceSn: item.terminal_sn || undefined,
          deviceAlias: item.terminal_alias || item.area_alias || undefined
        } as AttendanceRecord);
      }
    }
    const next: string | undefined = raw?.next;
    const shouldStop = !!oldestDateStrOnPage && oldestDateStrOnPage !== endStr && oldestDateStrOnPage !== startStr && new Date(oldestDateStrOnPage) < startDate;
    if (shouldStop || !next) {
      break;
    }
    url = next.startsWith('http') ? next.replace('http://qssun.dyndns.org:8085', '') : next;
  }
  return out.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
};

export const fetchEmployeeLogs = async (employeeId: string, startDate: Date, endDate: Date): Promise<AttendanceRecord[]> => {
  const headers = await getHeaders();
  // Try to use server-side filtering if available, otherwise we filter client-side
  let url = `${API_CONFIG.baseUrl}/transactions/?page_size=200&ordering=-punch_time&emp_code=${employeeId}`;

  const out: AttendanceRecord[] = [];
  const startStr = startDate.toISOString().split('T')[0];
  const endStr = endDate.toISOString().split('T')[0];

  // We loop to fetch pages until we go past the start date
  for (let i = 0; i < 50; i++) {
    const response = await fetch(url, { method: 'GET', headers });
    if (!response.ok) {
      // If filter by emp_code fails (400/500), fallback might be needed, but sticking to this for now
      const t = await response.text();
      console.warn(`Fetch Employee Logs Warning: ${response.status} - ${t}`);
      // If server doesn't support emp_code param, we might get empty or error.
      // Retrying without emp_code would be too heavy (fetching ALL logs for a month). 
      // Assuming it works or returns subset.
      if (i === 0) throw new Error(`Server Error: ${response.status}`);
      break;
    }
    const raw = await response.json();
    const list: any[] = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.data)
        ? raw.data
        : Array.isArray(raw?.results)
          ? raw.results
          : [];

    if (list.length === 0) break;

    let oldestDateStrOnPage: string | null = null;
    let foundOlder = false;

    for (const item of list) {
      // Double check emp_code matches (if server ignored param)
      const code = String(item.emp_code || item.user_id || 'UNKNOWN');
      if (code !== employeeId) continue;

      const punchTime = new Date(item.punch_time || item.time || item.timestamp);
      // Simple range check
      if (punchTime >= startDate && punchTime <= endDate) {
        const isLate = checkIsLate(punchTime, item.terminal_sn, item.terminal_alias || item.area_alias);
        out.push({
          id: item.id ? String(item.id) : `log-${i}-${item.id}`,
          employeeId: code,
          employeeName: item.emp_name || `${item.first_name || ''} ${item.last_name || ''}`.trim() || 'Unknown Employee',
          timestamp: punchTime.toISOString(),
          type: parsePunchState(item.punch_state),
          method: item.verify_type_display === 'Face' ? AttendanceMethod.FACE :
            item.verify_type_display === 'GPS' ? AttendanceMethod.GPS :
              AttendanceMethod.FINGERPRINT,
          status: isLate ? 'LATE' : 'ON_TIME',
          location: item.gps_location && typeof item.gps_location === 'string' ? undefined : (item.latitude && item.longitude ? {
            lat: parseFloat(item.latitude),
            lng: parseFloat(item.longitude),
            address: item.area_alias || 'موقع مسجل'
          } : undefined),
          deviceSn: item.terminal_sn || undefined,
          deviceAlias: item.terminal_alias || item.area_alias || undefined
        } as AttendanceRecord);
      }

      const pageStr = punchTime.toISOString().split('T')[0];
      oldestDateStrOnPage = pageStr;
      if (punchTime < startDate) {
        foundOlder = true;
      }
    }

    const next: string | undefined = raw?.next;
    // Stop if we found logs older than startDate OR no next page
    if (foundOlder || !next) {
      break;
    }
    url = next.startsWith('http') ? next.replace('http://qssun.dyndns.org:8085', '') : next;
  }
  return out.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
};

/**
 * SUBMIT GPS ATTENDANCE (REAL)
 * Posts data to the API
 */
export const submitGPSAttendance = async (
  employeeId: string,
  lat: number,
  lng: number,
  type: 'CHECK_IN' | 'CHECK_OUT'
): Promise<boolean> => {
  try {
    const payload = {
      emp_code: employeeId,
      punch_time: new Date().toISOString(), // Or specific format 'YYYY-MM-DD HH:mm:ss'
      latitude: lat,
      longitude: lng,
      punch_state: type === 'CHECK_IN' ? '0' : '1',
      verify_mode: 'GPS' // Custom flag for your middleware
    };

    const headers = await getHeaders();
    const response = await fetch(`/personnel/api/transactions/`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error("Failed to submit attendance");
    }

    return true;
  } catch (error) {
    console.error("GPS Submit Error:", error);
    throw error;
  }
};

export const submitBiometricAttendance = async (
  employeeId: string,
  type: 'CHECK_IN' | 'CHECK_OUT',
  terminalSn: string,
  verifyType: 'FINGERPRINT' | 'FACE' | 'PALM' | 'CARD' = 'FINGERPRINT'
): Promise<boolean> => {
  try {
    const payload: Record<string, any> = {
      emp_code: employeeId,
      punch_time: new Date().toISOString(),
      punch_state: type === 'CHECK_IN' ? '0' : '1',
      verify_mode: verifyType
    };
    if (terminalSn) {
      payload.terminal_sn = terminalSn;
    }
    const headers = await getHeaders();
    const response = await fetch(`/personnel/api/transactions/`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      throw new Error('Failed to submit biometric attendance');
    }
    return true;
  } catch (error) {
    console.error('Biometric Submit Error:', error);
    throw error;
  }
};

/**
 * SUBMIT MANUAL ATTENDANCE
 * Used by HR for adjustments
 */
export const submitManualAttendance = async (
  employeeId: string,
  timestamp: Date,
  type: 'CHECK_IN' | 'CHECK_OUT'
): Promise<boolean> => {
  try {
    const payload = {
      emp_code: employeeId,
      punch_time: timestamp.toISOString(),
      punch_state: type === 'CHECK_IN' ? '0' : '1',
      verify_mode: '15', // 15 often denotes Manual/Admin in ZK/API
      area_alias: 'Manual Adjustment'
    };

    const headers = await getHeaders();
    const response = await fetch(`/personnel/api/transactions/`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const t = await response.text();
      throw new Error(`Failed to submit manual attendance: ${t}`);
    }

    return true;
  } catch (error) {
    console.error("Manual Submit Error:", error);
    throw error;
  }
};

/**
 * STATISTICS CALCULATOR
 * Pure utility function, works on the data array passed to it
 */
export const getStats = (records: AttendanceRecord[]): DashboardStats => {
  const todayStr = new Date().toDateString();
  const todayRecords = records.filter(r => new Date(r.timestamp).toDateString() === todayStr);

  const uniquePresent = new Set(todayRecords.map(r => r.employeeId)).size;
  const late = todayRecords.filter(r => r.type === 'CHECK_IN' && r.status === 'LATE').length;

  // Total employees should ideally come from an 'employees' endpoint. 
  // Calculating dynamic count based on unique IDs in logs + buffer or static base.
  const totalEmployeesEst = Math.max(uniquePresent + 5, 20);

  return {
    totalEmployees: totalEmployeesEst,
    presentToday: uniquePresent,
    lateToday: late,
    onLeave: totalEmployeesEst - uniquePresent
  };
};

export const fetchDevices = async (): Promise<Device[]> => {
  const headers = await getHeaders();
  const response = await fetch(`${API_CONFIG.baseUrl}/terminals/?page_size=200&ordering=-last_activity`, {
    method: 'GET',
    headers
  });
  if (!response.ok) {
    const t = await response.text();
    throw new Error(`Server Error: ${response.status} - ${t}`);
  }
  const raw = await response.json();
  const list: any[] = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
  return list.map((it: any) => ({
    id: String(it.id),
    sn: String(it.sn),
    alias: it.alias || it.terminal_alias || undefined,
    areaName: (it.area && (it.area.area_name || it.area_name)) || it.area_name || undefined,
    lastActivity: it.last_activity || undefined
  }));
};

export const fetchDeviceEmployees = async (terminalSn: string): Promise<{ empCode: string; empName: string }[]> => {
  const headers = await getHeaders();
  const response = await fetch(`${API_CONFIG.baseUrl}/transactions/?page_size=1000&ordering=-punch_time`, {
    method: 'GET',
    headers
  });
  if (!response.ok) {
    const t = await response.text();
    throw new Error(`Server Error: ${response.status} - ${t}`);
  }
  const raw = await response.json();
  const list: any[] = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
  const filtered = list.filter((x: any) => String(x.terminal_sn || '') === terminalSn);
  const map = new Map<string, string>();
  filtered.forEach((x: any) => {
    const code = String(x.emp_code || x.user_id || 'UNKNOWN');
    const name = String(x.emp_name || `${x.first_name || ''} ${x.last_name || ''}`).trim();
    if (!map.has(code)) map.set(code, name);
  });
  return Array.from(map.entries()).map(([empCode, empName]) => ({ empCode, empName }));
};

export const fetchEmployeeCount = async (): Promise<number> => {
  const headers = await getHeaders();
  const response = await fetch(`/personnel/api/employees/?page_size=1`, {
    method: 'GET',
    headers
  });
  if (!response.ok) {
    const t = await response.text();
    throw new Error(`Server Error: ${response.status} - ${t}`);
  }
  const raw = await response.json();
  const count = (raw && typeof raw.count === 'number') ? raw.count : (Array.isArray(raw) ? raw.length : 0);
  return count;
};

export const fetchAllEmployees = async (): Promise<{ code: string; name: string }[]> => {
  const headers = await getHeaders();
  let url = `/personnel/api/employees/?page_size=200`;
  const map = new Map<string, string>();
  for (let i = 0; i < 50; i++) {
    const response = await fetch(url, { method: 'GET', headers });
    if (!response.ok) {
      const t = await response.text();
      throw new Error(`Server Error: ${response.status} - ${t}`);
    }
    const raw = await response.json();
    const list: any[] = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.data)
        ? raw.data
        : Array.isArray(raw?.results)
          ? raw.results
          : [];
    list.forEach((it: any) => {
      const code = String(it.emp_code || it.user_id || it.id || '').trim();
      if (!code) return;
      const inactive = (it.is_active === false) || (it.active === false) || (String(it.status || '').toLowerCase() === 'inactive') || (String(it.employment_status || '').toLowerCase() === 'terminated');
      if (inactive) return;
      const name = String(it.emp_name || `${it.first_name || ''} ${it.last_name || ''}`.trim() || code);
      if (!map.has(code)) map.set(code, name);
    });
    const next: string | undefined = raw?.next;
    if (next) {
      url = next.startsWith('http') ? next.replace('http://qssun.dyndns.org:8085', '') : next;
    } else {
      break;
    }
  }
  return Array.from(map.entries()).map(([code, name]) => ({ code, name }));
};
