import { AttendanceMethod, AttendanceRecord, DashboardStats, User, Device } from '../types';
import { getDeviceConfig } from '../config/shifts';

// Helper to determine if a record is late based on configuration
const resolveAreaName = (lat: number, lng: number): string => {
  if (lat > 25.0) return 'القصيم';
  if (lng > 49.0) return 'الدمام';
  return 'الرياض';
};

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

  // 2. Real Employee Login
  if (role === 'EMPLOYEE') {
    // Default Password Rule: 4 digits + 2 letters (e.g., '1234ab') - Hardcoded for now as requested
    const DEFAULT_PASSWORD = '1234ab';

    if (password !== DEFAULT_PASSWORD) {
      throw new Error("كلمة المرور غير صحيحة");
    }

    // Verify Employee Exists by fetching their latest log
    // We use the ID (username) to fetch 1 record.
    try {
      const headers = await getHeaders();
      const response = await fetch(`${API_CONFIG.baseUrl}/transactions/?emp_code=${username}&page_size=1`, {
        method: 'GET',
        headers
      });

      if (!response.ok) {
        throw new Error("فشل الاتصال بالخادم للتحقق من بيانات الموظف");
      }

      const raw = await response.json();
      const list = Array.isArray(raw) ? raw : (raw.data || raw.results || []);

      if (list.length === 0) {
        throw new Error("رقم الموظف غير موجود في النظام أو ليس لديه سجلات سابقة");
      }

      const record = list[0];
      const realName = record.emp_name || record.first_name || 'موظف';

      return {
        id: username,
        name: realName,
        role: 'EMPLOYEE',
        department: 'الموظفين', // Placeholder
        position: 'Team Member',
        avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(realName)}&background=random`
      };

    } catch (error: any) {
      console.error("Login verification failed", error);
      throw new Error(error.message || "حدث خطأ أثناء التحقق من بيانات الموظف");
    }
  }

  throw new Error("اسم المستخدم أو كلمة المرور غير صحيحة");
};

/**
 * FETCH ATTENDANCE LOGS (REAL)
 * Connects to http://qssun.dyndns.org:8085/personnel/api/transactions/
 */
export const fetchAttendanceLogs = async (targetDate: Date = new Date()): Promise<AttendanceRecord[]> => {
  const start = new Date(targetDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(targetDate);
  end.setHours(23, 59, 59, 999);
  return fetchAttendanceLogsRange(start, end);
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
          location: (() => {
            if (item.gps_location && typeof item.gps_location === 'string') {
              const [latStr, lngStr] = item.gps_location.split(',');
              const lat = parseFloat(latStr);
              const lng = parseFloat(lngStr);
              return { lat, lng, address: resolveAreaName(lat, lng) };
            }
            if (item.latitude && item.longitude) {
              const lat = parseFloat(item.latitude);
              const lng = parseFloat(item.longitude);
              return { lat, lng, address: resolveAreaName(lat, lng) };
            }
            return undefined;
          })(),
          deviceSn: item.terminal_sn || undefined,
          deviceAlias: (() => {
            // Prefer terminal_alias, then area_alias, then resolved name from coords if 'Web'
            if (item.terminal_alias) return item.terminal_alias;
            if (item.area_alias) return item.area_alias;
            if (item.terminal_sn === 'Web' || !item.terminal_sn) {
              // Try to resolve from gps
              if (item.gps_location && typeof item.gps_location === 'string') {
                const [lat, lng] = item.gps_location.split(',').map(Number);
                return resolveAreaName(lat, lng);
              }
            }
            return undefined;
          })()
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

  // --- Enrichment Step: Fetch Web Punches to fill missing GPS data in Transactions ---
  try {
    // Remove date filter to avoid ISO format issues. Just get latest 200.
    const wpUrl = `/att/api/webpunches/?page_size=200&ordering=-id`;
    const wpRes = await fetch(wpUrl, { headers });
    if (wpRes.ok) {
      const wpRaw = await wpRes.json();
      const wpList = wpRaw.results || [];
      const wpMap = new Map();

      wpList.forEach((wp: any) => {
        // Create fuzzy keys for matching (Transaction time usually matches WebPunch time)
        const t = new Date(wp.punch_time).getTime();
        wpMap.set(`${wp.emp_code}_${t}`, wp);
        // Also add +/- 1 second coverage just in case of second-rounding differences
        wpMap.set(`${wp.emp_code}_${t + 1000}`, wp);
        wpMap.set(`${wp.emp_code}_${t - 1000}`, wp);
      });

      // Enrich logs
      for (const log of out) {
        if (log.deviceSn === 'Web' || !log.location) {
          const logTime = new Date(log.timestamp).getTime();
          const match = wpMap.get(`${log.employeeId}_${logTime}`);
          if (match) {
            const gps = match.gps_location || `${match.latitude},${match.longitude}`;
            let area = match.area_alias;
            if ((!area || area === 'Mobile_GPS') && gps && gps.includes(',')) {
              const [lat, lng] = gps.split(',').map(Number);
              area = resolveAreaName(lat, lng);
            }

            if (area) {
              log.deviceAlias = area;
              log.location = {
                lat: match.latitude || 0,
                lng: match.longitude || 0,
                address: area
              };
            }
          }
        }
      }
    }
  } catch (e) {
    console.warn("WebPunch enrichment failed", e);
  }
  // --------------------------------------------------------------------------------

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
          location: (() => {
            if (item.gps_location && typeof item.gps_location === 'string') {
              const [latStr, lngStr] = item.gps_location.split(',');
              const lat = parseFloat(latStr);
              const lng = parseFloat(lngStr);
              return { lat, lng, address: resolveAreaName(lat, lng) };
            }
            if (item.latitude && item.longitude) {
              const lat = parseFloat(item.latitude);
              const lng = parseFloat(item.longitude);
              return { lat, lng, address: resolveAreaName(lat, lng) };
            }
            return undefined;
          })(),
          deviceSn: item.terminal_sn || undefined,
          deviceAlias: (() => {
            if (item.terminal_alias) return item.terminal_alias;
            if (item.area_alias) return item.area_alias;
            if (item.terminal_sn === 'Web' || !item.terminal_sn) {
              if (item.gps_location && typeof item.gps_location === 'string') {
                const [lat, lng] = item.gps_location.split(',').map(Number);
                return resolveAreaName(lat, lng);
              }
            }
            return undefined;
          })()
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
// Helper to format date for ADMS
const formatDateADMS = (date: Date) => {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

export const submitGPSAttendance = async (
  employeeId: string,
  lat: number,
  lng: number,
  type: 'CHECK_IN' | 'CHECK_OUT' | 'BREAK_OUT' | 'BREAK_IN'
): Promise<{ success: boolean; area?: string }> => {
  try {
    let punchState = '0';
    switch (type) {
      case 'CHECK_IN': punchState = '0'; break;
      case 'CHECK_OUT': punchState = '1'; break;
      case 'BREAK_OUT': punchState = '2'; break;
      case 'BREAK_IN': punchState = '3'; break;
    }

    // Payload matching /att/api/webpunches/ specification
    const headers = await getHeaders();
    // Using full path to avoid baseUrl issues (which might be /iclock/api)
    const empResponse = await fetch(`/personnel/api/employees/?emp_code=${employeeId}`, {
      method: 'GET',
      headers
    });

    if (!empResponse.ok) {
      throw new Error("Could not fetch employee details for ID lookup");
    }

    const empData = await empResponse.json();
    const internalId = empData.data && empData.data.length > 0 ? empData.data[0].id : null;

    if (!internalId) {
      throw new Error(`Internal ID not found for employee code: ${employeeId}`);
    }

    // 2. Time Setup (Local Time)
    const now = new Date();
    const localIso = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString();
    const punchTime = localIso.replace('T', ' ').split('.')[0];

    // 3. Dynamic Area & Device Mapping (for display)
    let areaName = 'Riyadh'; // Default
    let deviceSn = 'RKQ4235200204'; // Default to Riyadh Device

    if (lat > 25.0) {
      areaName = 'Qassim';
      deviceSn = 'RKQ4235200199';
    } else if (lng > 49.0) {
      areaName = 'Dammam';
      // deviceSn = ...
    }

    // 4. Construct Payload (Using WebPunch Endpoint but Spoofing Device)
    // Try source=1 and real terminal_sn to see if server assigns correct Device Name
    const payload = {
      company_code: '1',
      emp_code: employeeId,
      emp: internalId,
      punch_time: punchTime,
      punch_state: parseInt(punchState),
      verify_type: 1, // 1 = Fingerprint/PWD (Device), 101 = GPS
      source: 1,      // 1 = Device, 3 = Web
      gps_location: `${lat},${lng}`,
      latitude: lat,
      longitude: lng,
      area_alias: areaName,
      terminal_sn: deviceSn
    };

    // 5. Submit Web Punch
    const response = await fetch(`/att/api/webpunches/`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const t = await response.text();
      // Specifically handle Duplicate Punch to not crash the UI
      if (t.includes("Duplicate")) {
        return { success: true, area: areaName };
      }
      throw new Error(`Failed to submit web punch: ${t}`);
    }

    return { success: true, area: areaName };
  } catch (error) {
    console.error("GPS Submit Error via ADMS:", error);
    throw error;
  }
};

// Helper to get the very last punch state for smart switching
export const getLastPunch = async (employeeId: string): Promise<{ type: 'CHECK_IN' | 'CHECK_OUT' | 'BREAK_OUT' | 'BREAK_IN', timestamp: Date } | null> => {
  try {
    const headers = await getHeaders();
    // Fetch only 1 record, ordered by time desc
    const response = await fetch(`${API_CONFIG.baseUrl}/transactions/?emp_code=${employeeId}&page_size=1&ordering=-punch_time`, {
      method: 'GET',
      headers
    });

    if (!response.ok) return null;

    const raw = await response.json();
    const list = Array.isArray(raw) ? raw : (raw.data || raw.results || []);

    if (list.length === 0) return null;

    const item = list[0];
    const stateMap: Record<string, any> = {
      '0': 'CHECK_IN',
      '1': 'CHECK_OUT',
      '2': 'BREAK_OUT',
      '3': 'BREAK_IN',
      '4': 'OVERTIME_IN',
      '5': 'OVERTIME_OUT'
    };

    const punchState = String(item.punch_state);
    // Default to Check In if unknown, but better to return null or map strictly
    let type = stateMap[punchState] || (punchState === '0' ? 'CHECK_IN' : 'CHECK_OUT');

    // Map Overtime to normal mostly? Or keep distinct?
    // For our simple UI, let's map OT to standard In/Out
    if (type === 'OVERTIME_IN') type = 'CHECK_IN';
    if (type === 'OVERTIME_OUT') type = 'CHECK_OUT';

    return {
      type: type,
      timestamp: new Date(item.punch_time)
    };
  } catch (e) {
    console.error("Failed to fetch last punch", e);
    return null;
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
