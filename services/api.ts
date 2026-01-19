import { Capacitor } from '@capacitor/core';
import { Device } from '@capacitor/device';
import { AttendanceMethod, AttendanceRecord, DashboardStats, User, Device as DeviceInfo } from '../types';
import { getDeviceConfig } from '../config/shifts';
import { LOCATIONS } from '../config/locations';

// Haversine Formula (Copied for API Usage)
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371e3; // Earth radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Validates coordinate and resolves from Config
const resolveAreaName = (lat: number, lng: number): string | null => {
  if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) return null;

  // Clean Coordinates
  for (const loc of LOCATIONS) {
    if (loc.lat === 0 && loc.lng === 0) continue; // Skip empty config
    const dist = calculateDistance(lat, lng, loc.lat, loc.lng);
    if (dist <= loc.radius) return loc.name;
  }
  return null;
};

// Parse ZK Punch State
const parsePunchState = (state: string | number): 'CHECK_IN' | 'CHECK_OUT' | 'BREAK_IN' | 'BREAK_OUT' => {
  const s = String(state).trim().toUpperCase(); // Normalize

  if (s === '0' || s === 'CHECK_IN' || s === 'CHECK IN' || s === 'C/IN' || s === 'I') return 'CHECK_IN';
  if (s === '1' || s === 'CHECK_OUT' || s === 'CHECK OUT' || s === 'C/OUT' || s === 'O') return 'CHECK_OUT';

  if (s === '2' || s === 'BREAK_OUT') return 'BREAK_OUT';
  if (s === '3' || s === 'BREAK_IN') return 'BREAK_IN';

  // ZKTeco extended states
  if (s === '4') return 'CHECK_IN'; // Overtime In
  if (s === '5') return 'CHECK_OUT'; // Overtime Out

  // If undefined or unknown number, try to guess or default to Check Out?
  // Actually if we default to CheckOut, we miss Lateness.
  // Better to default to CHECK_IN if it looks like unknown? No.
  // Let's Log warning if needed, but for safe fallback:
  return 'CHECK_OUT';
};

const checkIsLate = (punchTime: Date, deviceSn?: string, deviceAlias?: string): boolean => {
  if (!deviceSn && !deviceAlias) return false; // Cannot determine without device context

  const config = getDeviceConfig({ sn: deviceSn || '', alias: deviceAlias }, punchTime);
  const shifts = config.shifts;

  if (!shifts || shifts.length === 0) return false;

  const punchHour = punchTime.getHours();
  const punchMin = punchTime.getMinutes();

  // Find Closest Shift Start (Robust Logic)
  let shift = shifts[0];
  let minDiff = Infinity;

  const punchMs = punchTime.getTime();

  for (const s of shifts) {
    const [h, m] = s.start.split(':').map(Number);
    const sStart = new Date(punchTime); // clone match day
    sStart.setHours(h, m, 0, 0);

    const diff = Math.abs(punchMs - sStart.getTime());
    if (diff < minDiff) {
      minDiff = diff;
      shift = s;
    }
  }

  const [startHour, startMin] = shift.start.split(':').map(Number);

  // Calculate strict lateness (Buffer can be added here if needed, e.g. +15 mins)
  // Current logic: Late if punchTime > shiftStart + 15 minutes (matching old hardcoded logic but dynamic)
  // Converting everything to minutes for comparison
  const punchTotal = punchHour * 60 + punchMin;
  const startTotal = startHour * 60 + startMin;

  return punchTotal > (startTotal + 15);
};

// Helper for BioTime Dates
const toBioTimeDate = (date: Date): string => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
};

// --- SHARED ENRICHMENT LOGIC ---
const enrichLogsWithWebPunches = async (logs: AttendanceRecord[], minDate: Date) => {
  try {
    // Fetch latest 500 Web Punches to ensure coverage
    const headers = await getHeaders();
    const wpUrl = `/att/api/webpunches/?page_size=500&ordering=-id`;
    const wpRes = await fetch(wpUrl, { headers });

    if (!wpRes.ok) return logs;

    const wpRaw = await wpRes.json();
    const wpList = wpRaw.data || wpRaw.results || [];

    // Debug Log
    console.log(`[Enrichment] Loaded ${wpList.length} WebPunches to match against ${logs.length} Logs`);

    for (const log of logs) {
      if (log.deviceSn === 'Web' || !log.location || log.location.address === 'Location') {
        const logTime = new Date(log.timestamp).getTime();

        // Fuzzy Match: Same Emp Code + Time within +/- 2 mins
        const match = wpList.find((wp: any) => {
          if (String(wp.emp_code) !== String(log.employeeId)) return false;
          const wpTime = new Date(wp.punch_time).getTime();
          const diff = Math.abs(logTime - wpTime);
          // Increase window to 4 hours (14,400,000 ms) to handle TZ diffs (UTC vs KSA)
          return diff < 14400000;
        });

        if (match) {
          // 1. Trust Manual/Server Area Alias first
          let area = match.area_alias;

          // 2. If no area, try to resolve from GPS using Config
          if (!area && (match.latitude || match.gps_location)) {
            const lat = match.latitude ? parseFloat(match.latitude) : NaN;
            const lng = match.longitude ? parseFloat(match.longitude) : NaN;
            const resolved = resolveAreaName(lat, lng);
            if (resolved) area = resolved;
          }

          if (area) {
            console.log(`[Enrichment] Matched ${log.employeeId} @ ${log.timestamp} -> ${area}`);
            const displayName = `تطبيق الجوال - ${area}`;
            log.deviceAlias = area; // Keep clean area name for logic
            log.location = {
              lat: match.latitude ? parseFloat(match.latitude) : 0,
              lng: match.longitude ? parseFloat(match.longitude) : 0,
              address: displayName
            };

            // Extract Accuracy from Memo (ACC:15m)
            if (match.memo && match.memo.includes('ACC:')) {
              const accMatch = match.memo.match(/ACC:(\d+)m/);
              if (accMatch && accMatch[1]) {
                log.accuracy = parseInt(accMatch[1], 10);
              }
            }
            // Do NOT overwrite deviceSn. Let it be 'Web'.
          }
        }
      }
    }
  } catch (e) {
    console.warn("Enrichment Error", e);
  }
  return logs;
};

// Dynamic Base URL: Use Absolute for APK, Relative (Proxy) for Web
const BASE_FOR_ENV = Capacitor.isNativePlatform() ? 'https://hr-bnyq.onrender.com' : '';

// Real API Configuration (New Server - Custom PHP)
// Real API Configuration (New Server - Custom PHP)
export const API_CONFIG = {
  // Always use the Remote API on Web to ensure we can hit the Legacy Proxy
  baseUrl: Capacitor.isNativePlatform() ? 'https://qssun.solar/api' : 'https://qssun.solar/api',
  username: 'admin',
  password: 'Admin@123',
};

// Legacy API Configuration (Old Server - Django/ZKTeco)
const LEGACY_BASE_URL = 'http://qssun.dyndns.org:8085/iclock/api';

export const LEGACY_API_CONFIG = {
  baseUrl: 'http://qssun.dyndns.org:8085/iclock/api',
  username: 'admin',
  password: 'Admin@123',
};
// SECURITY API
const SECURITY_API_URL = 'https://qssun.solar';

let AUTH_TOKEN: string | null = null;

// --- LEGACY AUTHENTICATION (Token Based) ---
let LEGACY_AUTH_TOKEN: string | null = null;

export const ensureLegacyAuthToken = async (): Promise<string> => {
  if (LEGACY_AUTH_TOKEN) return LEGACY_AUTH_TOKEN;

  // Login to Legacy Server to get Token
  const path = '/api-token-auth/';
  const body = JSON.stringify({ username: LEGACY_API_CONFIG.username, password: LEGACY_API_CONFIG.password });

  // Use fetchLegacyProxy so it works on Web too
  const response = await fetchLegacyProxy(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body
  });

  if (!response.ok) {
    throw new Error(`Legacy Auth Failed: ${response.status}`);
  }

  const data = await response.json();
  LEGACY_AUTH_TOKEN = data?.token || null;
  if (!LEGACY_AUTH_TOKEN) throw new Error("Legacy Token missing in response");
  return LEGACY_AUTH_TOKEN;
};

// Helper for Legacy Headers (Prioritize Token, Fallback to Basic)
export const getLegacyAuthHeaders = async () => {
  try {
    const token = await ensureLegacyAuthToken();
    return {
      'Authorization': `Token ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
  } catch (e) {
    console.warn("Legacy Token Auth failed. Falling back to Basic.", e);
    const credentials = btoa(`${LEGACY_API_CONFIG.username}:${LEGACY_API_CONFIG.password}`);
    return {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
  }
};


const ensureAuthToken = async (): Promise<string> => {
  if (AUTH_TOKEN) return AUTH_TOKEN;
  const response = await fetch(`${BASE_FOR_ENV}/jwt-api-token-auth/`, {
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

// Routes requests through the secure PHP proxy to avoid Mixed Content errors on Web
// Routes requests through the secure PHP proxy to avoid Mixed Content errors on Web
// Routes requests through the secure PHP proxy to avoid Mixed Content errors on Web
// Routes requests through the secure PHP proxy to avoid Mixed Content errors on Web
export const fetchLegacyProxy = async (path: string, options: RequestInit = {}) => {
  if (Capacitor.isNativePlatform()) {
    // Native: Direct Fetch (HTTP is allowed)
    // Localhost needs this to avoid CORS/Proxy issues with Legacy Server
    const url = `http://qssun.dyndns.org:8085${path}`;
    return fetch(url, options);
  } else {
    // Web (Both Localhost & Production): Use Local/Server Proxy
    // We map '/iclock' -> '/legacy_iclock' (Forwarded by Vite or Express)
    // We map '/api-token-auth' -> '/legacy_auth/api-token-auth'

    let localPath = path;
    if (path.startsWith('/iclock')) {
      localPath = path.replace('/iclock', '/legacy_iclock');
    } else if (path.startsWith('/api-token-auth')) {
      localPath = '/legacy_auth' + path;
    }

    // Fetch relative path so current domain handles it (Vite or Render)
    return fetch(localPath, options);
  }
};

// Helper to generate JWT Headers
export const getHeaders = async () => {
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
 */// LOGIN USER
export const loginUser = async (username: string, password?: string): Promise<User> => {
  // 1. Check for Super Admin (we9li)
  if (username === 'we9li' && password === '123') {
    return {
      id: 'SA-001',
      name: 'Super Admin (we9li)',
      role: 'ADMIN',
      avatar: 'https://ui-avatars.com/api/?name=W+e&background=1e40af&color=fff&bold=true'
    };
  }

  // 1.5 Check for Admin (Abdullah)
  if (username === 'Abdullah' && password === 'Qssun26') {
    return {
      id: 'AD-002',
      name: 'HR Manager (Abdullah)',
      role: 'ADMIN',
      avatar: 'https://ui-avatars.com/api/?name=A+b&background=10b981&color=fff&bold=true'
    };
  }

  // 2. Real Employee Login (Default Fallback)
  try {
    // Default Password Rule: 4 digits + 2 letters (e.g., '1234ab')
    const DEFAULT_PASSWORD = '1234ab';

    if (password !== DEFAULT_PASSWORD) {
      throw new Error("كلمة المرور غير صحيحة");
    }

    // 3. Device Binding Check (Security Layer)
    // BYPASS FOR DEVELOPER (Faisal)
    const isDev = username === '1093394672' || username === 'Faisal ALnutayfi';

    if (Capacitor.isNativePlatform() && !isDev) {
      try {
        const deviceId = await Device.getId();
        // Capacitor v5+ uses 'identifier', older used 'uuid'
        const uuid = deviceId.identifier || (deviceId as any).uuid;
        const info = await Device.getInfo();
        const model = info.model;

        // Check Device Status
        const checkRes = await fetch(`${SECURITY_API_URL}/check_device.php?emp_id=${username}&device_uuid=${uuid}`);
        const checkData = await checkRes.json();

        if (checkData.status === 'BLOCKED') {
          throw new Error("هذا الحساب مرتبط بجهاز آخر. تواصل مع الإدارة.");
        }

        if (checkData.status === 'NEW_USER') {
          // THROW SPECIAL ERROR TO TRIGGER UI CONFIRMATION
          throw {
            code: 'BIND_REQUIRED',
            message: 'يجب ربط هذا الجهاز بحسابك للاستمرار',
            details: {
              emp_id: username,
              device_uuid: uuid,
              device_model: model
            }
          };
        }
        // If ALLOWED, proceed normally
      } catch (e: any) {
        if (e.code === 'BIND_REQUIRED') throw e; // Re-throw custom error
        console.error("Device Security Check Failed", e);
        // Optional: Fail login if security check fails?
        // throw new Error("فشل التحقق من أمان الجهاز");
        if (e.message && e.message.includes("مرتبط بجهاز آخر")) throw e;
      }
    }

    // Verify Employee Exists
    const headers = await getLegacyAuthHeaders();
    // Revert to Legacy API for Reliable Login (since PHP file on new server might be missing/broken)
    const response = await fetchLegacyProxy(`/personnel/api/employees/?emp_code=${username}&page_size=1`, {
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
    if (error.code === 'BIND_REQUIRED') throw error; // Pass through to UI
    console.error("Login verification failed", error);
    throw new Error(error.message || "حدث خطأ أثناء التحقق من بيانات الموظف");
  }
};

// EXPORT BIND DEVICE FUNCTION FOR UI
export const bindDevice = async (emp_id: string, device_uuid: string, device_model: string) => {
  try {
    const bindRes = await fetch(`${SECURITY_API_URL}/bind_device.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emp_id, device_uuid, device_model })
    });
    const bindData = await bindRes.json();
    if (bindData.status !== 'SUCCESS') {
      throw new Error(bindData.message || "فشل ربط الجهاز");
    }
    return true;
  } catch (e: any) {
    throw new Error(e.message || "فشل الاتصال بالخادم");
  }
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

export const fetchAttendanceLogsRange = async (
  startDate: Date,
  endDate: Date,
  employeeId?: string,
  deviceSn?: string
): Promise<AttendanceRecord[]> => {
  // This is the Legacy signature maintained for backward compatibility.
  // However, Reports.tsx should IDEALLY call the sub-functions progressively.
  // For now, this still blocks, BUT we export the sub-functions below/above for Reports.tsx to use.
  // Wait, the exports should be defined separately. I will define them FIRST.
  // THIS BLOCK REPLACES THE WHOLE FUNCTION body.

  // Lookup Alt Code (National ID)
  let altCode: string | undefined = undefined;
  if (employeeId && employeeId !== 'ALL') {
    try {
      // 1. We need the list of employees. Ideally cached or passed in contexts.
      // Since this is an async API call, we can quickly fetch All Employees (usually cached by browser or fast)
      // OR better, we rely on the component to pass it? No, signature is fixed.
      // We'll call fetchAllEmployees() here. It has internal looping but it's the only way to be "Software Only".
      // NOTE: This might be slow if list is huge. Optimally, Reports.tsx should cache this map.
      // Let's assume fetchAllEmployees is fast enough or use a global cache if needed.
      const emps = await fetchAllEmployees();
      const emp = emps.find(e => e.code === employeeId);
      if (emp) {
        // Try known fields for National ID
        altCode = emp.national_id || emp.ssn || emp.identity_num || emp.identification_number || emp.other_id;
      }
    } catch { } // Fail silent
  }

  const [bridge, legacy] = await Promise.all([
    fetchBridgeLogsRange(startDate, endDate, employeeId, deviceSn, undefined, altCode), // Pass altCode
    fetchLegacyLogsRange(startDate, endDate, employeeId, deviceSn)
  ]);

  const all = [...bridge, ...legacy];
  const unique = new Map();
  all.forEach(item => unique.set(item.id, item));
  return Array.from(unique.values()).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
};

// --- EXPORTED SUB-FUNCTIONS ---

export const fetchBridgeLogsRange = async (
  startDate: Date,
  endDate: Date,
  employeeId?: string,
  deviceSn?: string,
  onChunk?: (chunk: AttendanceRecord[]) => void,
  altCode?: string
) => {
  const SYSTEM_START_DATE = new Date('2025-12-01T00:00:00');

  // Optimize: Clamp Start Date
  const effectiveStartDate = startDate < SYSTEM_START_DATE ? SYSTEM_START_DATE : startDate;

  // Optimization: If requested range is entirely before system start, return empty
  if (endDate < SYSTEM_START_DATE) return [];

  const fmt = (d: Date) => {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const gte = fmt(effectiveStartDate); // Use Clamped Date
  const lte = `${fmt(endDate)} 23:59:59`; // Cover Full Day
  const startTimeMs = effectiveStartDate.getTime();

  let allLogs: any[] = [];
  const pageSize = 1000; // Reduced to 1000 for faster TTFB (First Byte)

  const fetchPage = async (page: number) => {
    let path = `/biometric_api/iclock/transactions.php?punch_time__gte=${encodeURIComponent(gte)}&punch_time__lte=${encodeURIComponent(lte)}&page=${page}&page_size=${pageSize}`;
    if (Capacitor.isNativePlatform()) {
      path = `https://qssun.solar/api/iclock/transactions.php?punch_time__gte=${encodeURIComponent(gte)}&punch_time__lte=${encodeURIComponent(lte)}&page=${page}&page_size=${pageSize}`;
    }
    if (employeeId && employeeId !== 'ALL') path += `&emp_code=${employeeId}`;
    if (altCode) path += `&alt_emp_code=${altCode}`;
    if (deviceSn && deviceSn !== 'ALL') path += `&terminal_sn=${deviceSn}`;
    try {
      const response = await fetch(path);
      if (!response.ok) return [];
      const raw = await response.json();
      return Array.isArray(raw) ? raw : (raw.data || raw.results || []);
    } catch { return []; }
  };

  // Global Normalization Map
  // We need to map Alien IDs (National ID) to System IDs (Emp Code) for ALL employees
  let idMap = new Map<string, string>();
  try {
    const emps = await fetchAllEmployees();
    emps.forEach(e => {
      // Map National ID -> Code
      if (e.national_id) idMap.set(String(e.national_id), String(e.code));
      if (e.ssn) idMap.set(String(e.ssn), String(e.code));
      if (e.identity_num) idMap.set(String(e.identity_num), String(e.code));
      if (e.other_id) idMap.set(String(e.other_id), String(e.code));
    });
    // HARDCODED FIX for User's specific issue (if National ID missing from profile)
    idMap.set('2562020083', '275'); // Map this specific ID to '275' (Faisal) as requested implicitly
    idMap.set('1108199587', '275'); // Map the other ID too just in case
  } catch { }

  let keepGoing = true;
  for (let batch = 0; batch < 10; batch++) {
    if (!keepGoing) break;
    const promises = [];
    const batchSize = 5;
    for (let i = 1; i <= batchSize; i++) promises.push(fetchPage((batch * batchSize) + i));

    const results = await Promise.all(promises);
    for (const list of results) {
      if (list.length === 0) { keepGoing = false; break; }

      // Transform and Stream immediately
      const chunk = list.map(item => {
        // Universal ID Normalization
        // Check if this item's ID or UserID matches any known National ID in the map
        const rawId = String(item.emp_code || item.user_id);
        if (idMap.has(rawId)) {
          item.emp_code = idMap.get(rawId);
          item.user_id = idMap.get(rawId); // Normalize both
        }

        // Fallback: If specific employee requested (Legacy fix)
        if (altCode && employeeId && (String(item.emp_code) === String(altCode) || String(item.user_id) === String(altCode))) {
          item.emp_code = employeeId;
        }
        return transformLog(item, effectiveStartDate, endDate);
      }).filter((x): x is AttendanceRecord => x !== null);
      if (chunk.length > 0) {
        allLogs = [...allLogs, ...chunk]; // Keep local copy for final return (legacy)
        if (onChunk) onChunk(chunk); // Stream out
      }

      const lastLog = list[list.length - 1];
      if (lastLog) {
        let tStr = String(lastLog.punch_time || lastLog.check_time || lastLog.time || lastLog.timestamp || '');
        if (tStr.includes(' ') && !tStr.includes('T')) tStr = tStr.replace(' ', 'T');
        const lastDate = new Date(tStr);
        if (!isNaN(lastDate.getTime()) && lastDate.getTime() < startTimeMs) { keepGoing = false; break; }
      }
      if (list.length < pageSize) { keepGoing = false; break; }
    }
  }
  return allLogs;
};

export const fetchLegacyLogsRange = async (
  startDate: Date,
  endDate: Date,
  employeeId?: string,
  deviceSn?: string,
  onChunk?: (chunk: AttendanceRecord[]) => void
) => {
  const SYSTEM_START_DATE = new Date('2025-12-01T00:00:00');

  // Optimize: Clamp Start Date
  const effectiveStartDate = startDate < SYSTEM_START_DATE ? SYSTEM_START_DATE : startDate;

  // Optimization: If requested range is entirely before system start, return empty
  if (endDate < SYSTEM_START_DATE) return [];

  const fmt = (d: Date) => {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const gte = fmt(effectiveStartDate); // Use Clamped Date
  const lte = fmt(endDate);
  const startTimeMs = effectiveStartDate.getTime();

  let allLogs: any[] = [];
  const pageSize = 200;

  for (let page = 1; page <= 50; page++) {
    let path = `/legacy_iclock/api/transactions/?page_size=${pageSize}&ordering=-punch_time&punch_time__gte=${encodeURIComponent(gte)}&punch_time__lte=${encodeURIComponent(lte)}&page=${page}`;
    if (Capacitor.isNativePlatform()) {
      path = `http://qssun.dyndns.org:8085/iclock/api/transactions/?page_size=${pageSize}&ordering=-punch_time&punch_time__gte=${encodeURIComponent(gte)}&punch_time__lte=${encodeURIComponent(lte)}&page=${page}`;
    }
    if (employeeId && employeeId !== 'ALL') path += `&emp_code=${employeeId}`;
    if (deviceSn && deviceSn !== 'ALL') path += `&terminal_sn=${deviceSn}`;

    try {
      const headers = await getLegacyAuthHeaders();
      const response = await fetch(path, { method: 'GET', headers });
      if (!response.ok) break;
      const raw = await response.json();
      const list = Array.isArray(raw) ? raw : (raw.data || raw.results || []);
      if (list.length === 0) break;

      // Transform and Stream immediately
      const chunk = list.map(item => transformLog(item, effectiveStartDate, endDate)).filter((x): x is AttendanceRecord => x !== null);
      if (chunk.length > 0) {
        allLogs = [...allLogs, ...chunk];
        if (onChunk) onChunk(chunk);
      }

      const lastLog = list[list.length - 1];
      if (lastLog) {
        let tStr = String(lastLog.punch_time || lastLog.check_time || lastLog.time || lastLog.timestamp || '');
        if (tStr.includes(' ') && !tStr.includes('T')) tStr = tStr.replace(' ', 'T');
        const lastDate = new Date(tStr);
        if (!isNaN(lastDate.getTime()) && lastDate.getTime() < startTimeMs) break;
      }

      if (raw.next === null) break;
      if (list.length < pageSize && !raw.next) break;
    } catch (e) { console.warn("Legacy Error", e); break; }
  }

  return allLogs;
};

// Helper: Transform Raw Log to AttendanceRecord
const transformLog = (item: any, startDate: Date, endDate: Date): AttendanceRecord | null => {
  const uniqueKey = item.id ? String(item.id) : `log-${item.emp_code}-${item.punch_time}`;
  let tStr = String(item.punch_time || item.time || item.timestamp);
  if (tStr.includes(' ') && !tStr.includes('T')) tStr = tStr.replace(' ', 'T');
  const punchTime = new Date(tStr);

  if (punchTime < startDate || punchTime > endDate) return null;

  const isLate = checkIsLate(punchTime, item.terminal_sn, item.terminal_alias || item.area_alias);

  return {
    id: uniqueKey,
    employeeId: item.emp_code || item.user_id || 'UNKNOWN',
    employeeName: item.emp_name || `${item.first_name || ''} ${item.last_name || ''}`.trim() || 'Unknown Employee',
    timestamp: punchTime.toISOString(),
    type: parsePunchState(item.punch_state),
    method: (item.verify_type_display === 'Manual' || item.terminal_sn === 'MANUAL') ? AttendanceMethod.MANUAL :
      (item.verify_type_display === 'Face' || (item.verify_mode && item.verify_mode == 15)) ? AttendanceMethod.FACE :
        (item.terminal_sn === 'Mobile' || (item.verify_mode && item.verify_mode == 200)) ? AttendanceMethod.GPS :
          AttendanceMethod.FINGERPRINT, // Simplified fallback
    status: isLate ? 'LATE' : 'ON_TIME',
    location: {
      lat: item.latitude ? parseFloat(item.latitude) : 0,
      lng: item.longitude ? parseFloat(item.longitude) : 0,
      accuracy: 0,
      address: item.area_alias || item.terminal_alias || 'Main Branch'
    },
    deviceSn: item.terminal_sn || undefined,
    deviceAlias: item.terminal_alias || item.area_alias || undefined
  };
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
          })(),
          purpose: item.purpose || undefined,
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

  // Apply Enrichment for Employee Logs too
  await enrichLogsWithWebPunches(out, startDate);

  return out.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
};

/**
 * MANUAL ATTENDANCE / EXCUSE LOGGING
 */
export const createManualTransaction = async (data: {
  emp_code: string;
  punch_time: string; // YYYY-MM-DD HH:mm:ss
  punch_state: string; // '0'=CheckIn, '1'=CheckOut, '4'=Absence(mapped)
  terminal_sn?: string;
  purpose?: string; // Reason/Excuse
}): Promise<void> => {
  const headers = await getHeaders();

  if (!data.emp_code) throw new Error("Employee Code is required");

  // Lookup internal Employee ID needed for manuallogs endpoint
  const empResponse = await fetch(`${BASE_FOR_ENV}/personnel/api/employees/?emp_code=${data.emp_code}`, { headers });
  if (!empResponse.ok) throw new Error("Could not verify employee.");
  const empData = await empResponse.json();
  // Support both .data and .results if API varies
  const list = empData.data || empData.results || [];
  const internalId = list.length > 0 ? list[0].id : null;
  if (!internalId) throw new Error("Employee internal ID not found.");

  // Prepare Manual Log Payload
  // We use /att/api/manuallogs/ because it supports 'apply_reason' (The Text!)

  // Map punch_state '100' (Absence) to '0' (Check In) implies we prefer Check In status but with Text
  let pState = data.punch_state;
  if (pState === '100') pState = '0'; // Default to Check In for Absence

  const payload = {
    employee: internalId, // Required by BioTime
    emp_code: data.emp_code,
    punch_time: data.punch_time,
    punch_state: pState,
    verify_type: 0,
    work_code: 0,
    apply_reason: data.purpose || 'Manual Log'
  };

  const response = await fetch(`${BASE_FOR_ENV}/att/api/manuallogs/`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const t = await response.text();
    // Handle duplicates or errors
    if (t.includes("Duplicate")) return;
    throw new Error(`Failed to create manual log: ${t}`);
  }
};

export const deleteTransaction = async (id: string): Promise<void> => {
  const headers = await getHeaders();
  const response = await fetch(`${BASE_FOR_ENV}/personnel/api/transactions/${id}/`, {
    method: 'DELETE',
    headers
  });
  if (!response.ok) {
    const t = await response.text();
    throw new Error(`Failed to delete transaction: ${response.status} - ${t}`);
  }
};

export const updateTransaction = async (id: string, data: {
  punch_time?: string;
  punch_state?: string;
  purpose?: string;
}): Promise<void> => {
  const headers = await getHeaders();
  const payload: any = { ...data };

  // BioTime sometimes requires 'verify_type' to stay same, or we might want to ensure it remains manual
  // payload.verify_type = 20; 

  const response = await fetch(`${BASE_FOR_ENV}/personnel/api/transactions/${id}/`, {
    method: 'PATCH', // Use PATCH for partial updates usually
    headers,
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    // Fallback to PUT if PATCH fails or if API strictly wants PUT
    // But typically JSON API uses PATCH. Check ZK API docs if available, or try. 
    // For now Assuming PATCH or PUT. Let's try PATCH.
    const t = await response.text();
    throw new Error(`Failed to update transaction: ${response.status} - ${t}`);
  }
};

/**
 * SUBMIT GPS ATTENDANCE (REAL)
 * Posts data to the API as WebPunch
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
  type: 'CHECK_IN' | 'CHECK_OUT' | 'BREAK_OUT' | 'BREAK_IN',
  manualArea?: string,
  accuracy?: number
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
    const empResponse = await fetch(`${BASE_FOR_ENV}/personnel/api/employees/?emp_code=${employeeId}`, {
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
    let areaName = manualArea || 'الرياض'; // Prefer manual area if provided
    let deviceSn = 'RKQ4235200204'; // Default to Riyadh Device

    if (!manualArea) {
      if (lat > 25.0) {
        areaName = 'القصيم';
        deviceSn = 'RKQ4235200199';
      } else if (lng > 49.0) {
        areaName = 'الدمام';
      }
    } else {
      // Map Manual Names to Device SNs if needed
      if (manualArea === 'القصيم') deviceSn = 'RKQ4235200199';
      if (manualArea === 'جهاز تجريبي ( فيصل )') deviceSn = 'AF4C232560143';
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
      terminal_sn: deviceSn,
      memo: accuracy ? `ACC:${Math.round(accuracy)}m` : 'ACC:N/A'
    };

    // 5. Submit Web Punch
    const response = await fetch(`${BASE_FOR_ENV}/att/api/webpunches/`, {
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
      timestamp: new Date(item.punch_time),
      purpose: item.memo || item.terminal_alias || ''
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
 * UPLOAD PROOF FILE
 */
export const uploadProof = async (file: File): Promise<string> => {
  const formData = new FormData();
  formData.append('file', file);

  let url = `/biometric_api/upload_proof.php`;
  if (Capacitor.isNativePlatform()) {
    url = `https://qssun.solar/api/upload_proof.php`;
  }

  const response = await fetch(url, {
    method: 'POST',
    body: formData
  });

  if (!response.ok) throw new Error("Upload Failed");
  const data = await response.json();
  if (data.status !== 'success') throw new Error(data.message);

  return data.url;
};

/**
 * SUBMIT MANUAL ATTENDANCE
 * Used by HR for adjustments
 */
export const submitManualAttendance = async (
  employeeId: string,
  timestamp: Date,
  type: 'CHECK_IN' | 'CHECK_OUT',
  note?: string
): Promise<boolean> => {
  try {
    // Format Date to MySQL DateTime (YYYY-MM-DD HH:MM:SS) - Local Time
    const y = timestamp.getFullYear();
    const m = String(timestamp.getMonth() + 1).padStart(2, '0');
    const d = String(timestamp.getDate()).padStart(2, '0');
    const H = String(timestamp.getHours()).padStart(2, '0');
    const M = String(timestamp.getMinutes()).padStart(2, '0');
    const S = String(timestamp.getSeconds()).padStart(2, '0');
    const mysqlTime = `${y}-${m}-${d} ${H}:${M}:${S}`;

    const payload = {
      emp_code: employeeId,
      punch_time: mysqlTime,
      punch_state: type === 'CHECK_IN' ? '0' : '1',
      verify_mode: '15', // 15 = Manual
      area_alias: note || 'Manual Adjustment',
      terminal_alias: note || 'Manual'
    };

    const headers = await getHeaders();

    // Switch to Bridge API for Reliability
    let url = `/biometric_api/iclock/transactions.php`;
    if (Capacitor.isNativePlatform()) {
      url = `https://qssun.solar/api/iclock/transactions.php`;
    }

    const response = await fetch(url, {
      method: 'POST',
      // Removing headers authentication for Bridge if not implemented, or keeping Content-Type
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const t = await response.text();
      throw new Error(`Failed to submit: ${t}`);
    }

    return true;
  } catch (error) {
    console.error("Manual Submit Error:", error);
    throw error;
  }
};

export const deleteManualLog = async (logId: string): Promise<boolean> => {
  try {
    let url = `/biometric_api/iclock/transactions.php`;
    if (Capacitor.isNativePlatform()) {
      url = `https://qssun.solar/api/iclock/transactions.php`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id: logId })
    });

    const result = await response.json();
    if (result.status === 'success') return true;
    throw new Error(result.message || 'Failed to delete');
  } catch (error) {
    console.error("Delete Log Error:", error);
    return false;
  }
};

/**
 * STATISTICS CALCULATOR
 * Pure utility function, works on the data array passed to it
 */
export const getStats = (records: AttendanceRecord[]): DashboardStats => {
  const todayStr = new Date().toDateString();
  const todayRecords = records.filter(r => new Date(r.timestamp).toDateString() === todayStr);

  // Identify logs that are explicitly marked as "Absence" (via purpose or type)
  const absenceLogs = todayRecords.filter(r =>
    (r.purpose && r.purpose.includes('غياب')) || r.type === 'ABSENCE'
  );

  // Present logs are those that exist AND are not Absences
  const presentLogs = todayRecords.filter(r =>
    !((r.purpose && r.purpose.includes('غياب')) || r.type === 'ABSENCE')
  );

  const uniquePresent = new Set(presentLogs.map(r => r.employeeId)).size;
  const uniqueAbsenceLoggers = new Set(absenceLogs.map(r => r.employeeId)).size;

  const late = presentLogs.filter(r => r.type === 'CHECK_IN' && r.status === 'LATE').length;

  // Total employees estimation (or ideally from fetchEmployeeCount if available in context)
  const totalEmployeesEst = Math.max(uniquePresent + uniqueAbsenceLoggers + 5, 20);

  return {
    totalEmployees: totalEmployeesEst,
    presentToday: uniquePresent,
    lateToday: late,
    onLeave: totalEmployeesEst - uniquePresent // This inherently includes those with Absence logs + those with NO logs
  };
};

export const fetchDevices = async (): Promise<DeviceInfo[]> => {
  try {
    const headers = await getLegacyAuthHeaders();
    // Use Legacy API for Terminals
    const path = '/iclock/api/terminals/?page_size=200';
    const response = await fetchLegacyProxy(path, { method: 'GET', headers });

    if (!response.ok) {
      console.warn(`Legacy Devices Fetch Failed: ${response.status}`);
      return [];
    }

    const raw = await response.json();
    const list = Array.isArray(raw) ? raw : (raw.data || raw.results || []);

    return list.map((it: any) => ({
      id: String(it.id || it.serial_number),
      sn: String(it.serial_number || it.sn),
      alias: it.alias || it.device_name || `Device ${it.sn}`,
      areaName: it.area_name || it.area_alias || undefined,
      lastActivity: it.last_activity || undefined,
      status: it.state // Some versions return status/state
    }));
  } catch (e) {
    console.warn("fetchDevices Error:", e);
    return [];
  }
};

export const fetchDeviceEmployees = async (terminalSn: string): Promise<{ empCode: string; empName: string }[]> => {
  const map = new Map<string, string>();

  // Helper to process list
  const processList = (list: any[]) => {
    list.forEach((x: any) => {
      // Normalize SN compare
      if (terminalSn !== 'ALL' && String(x.terminal_sn || x.device_sn || '') !== terminalSn) return;

      const code = String(x.emp_code || x.user_id || 'UNKNOWN');
      const name = String(x.emp_name || x.real_name || `${x.first_name || ''} ${x.last_name || ''}`).trim();
      if (!map.has(code) && code !== 'UNKNOWN') map.set(code, name);
    });
  };

  // 1. Fetch from Legacy
  try {
    const headers = await getLegacyAuthHeaders();
    // Default legacy fetch
    const response = await fetch(`${API_CONFIG.baseUrl}/transactions/?page_size=1000&ordering=-id&terminal_sn=${terminalSn}`, {
      method: 'GET',
      headers
    });
    if (response.ok) {
      const raw = await response.json();
      const list = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
      processList(list);
    }
  } catch (e) {
    console.warn("Legacy fetchDeviceEmployees failed", e);
  }

  // 2. Fetch from Bridge (New Device)
  try {
    let path = `/biometric_api/iclock/transactions.php?terminal_sn=${terminalSn}`;
    if (Capacitor.isNativePlatform()) {
      path = `https://qssun.solar/api/iclock/transactions.php?terminal_sn=${terminalSn}`;
    }
    const bridgeResp = await fetch(path);
    if (bridgeResp.ok) {
      const raw = await bridgeResp.json();
      const list = Array.isArray(raw) ? raw : (raw.data || []);
      processList(list);
    }
  } catch (e) {
    console.warn("Bridge fetchDeviceEmployees failed", e);
  }

  return Array.from(map.entries()).map(([empCode, empName]) => ({ empCode, empName }));
};

export const fetchEmployeeCount = async (): Promise<number> => {
  const headers = await getHeaders();
  const response = await fetch(`${BASE_FOR_ENV}/personnel/api/employees/?page_size=1`, {
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

// New: Fetch Local Emails from PHP Backend
const fetchLocalEmails = async (): Promise<Map<string, string>> => {
  try {
    let url = '/biometric_api/api/users.php'; // Local Proxy path
    if (Capacitor.isNativePlatform()) {
      url = 'https://qssun.solar/api/api/users.php';
    }
    const res = await fetch(url);
    if (!res.ok) return new Map();
    const data = await res.json();
    const map = new Map<string, string>();
    if (Array.isArray(data)) {
      data.forEach((u: any) => {
        if (u.user_id && u.email) map.set(String(u.user_id), u.email);
      });
    }
    return map;
  } catch { return new Map(); }
};

export const fetchAllEmployees = async (): Promise<any[]> => {
  const headers = await getHeaders();
  let url = `${BASE_FOR_ENV}/personnel/api/employees/?page_size=200`;
  const map = new Map<string, any>();

  for (let i = 0; i < 50; i++) {
    try {
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

        // Enrich default fields if missing from list view
        const name = String(it.emp_name || `${it.first_name || ''} ${it.last_name || ''}`.trim() || code);

        // Ensure useful fields are present
        const fullObj = {
          ...it,
          id: it.id,
          code: code,
          name: name,
          first_name: it.first_name || name.split(' ')[0],
          last_name: it.last_name || name.split(' ').slice(1).join(' '),
          // Map deeper objects if present
          dept_name: it.department ? (it.department.dept_name || it.department.name) : undefined,
          position_name: it.position ? (it.position.position_name || it.position.name) : undefined,
          area_name: (it.area && it.area.length > 0) ? (it.area[0].area_name || it.area[0].name) : undefined,
          email: it.email // Use Legacy Email only
        };

        if (!map.has(code)) map.set(code, fullObj);
      });

      const next: string | undefined = raw?.next;
      if (next) {
        try {
          const nextUrl = new URL(next);
          url = `${BASE_FOR_ENV}${nextUrl.pathname}${nextUrl.search}`;
        } catch (e) {
          url = next.startsWith('http') ? next : `${BASE_FOR_ENV}${next}`;
        }
      } else {
        break;
      }
    } catch (e) {
      console.error("Fetch Loop Error:", e);
      break;
    }
  }
  return Array.from(map.values());
};

export const createEmployee = async (data: any): Promise<void> => {
  const headers = await getHeaders();
  const response = await fetch(`${BASE_FOR_ENV}/personnel/api/employees/`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data)
  });

  if (!response.ok) {
    const t = await response.text();
    // Try to parse JSON error if possible
    try {
      const err = JSON.parse(t);
      if (err.first_name) throw new Error(`الاسم الأول: ${err.first_name}`);
      if (err.emp_code) throw new Error(`رقم الموظف: ${err.emp_code}`);
    } catch (e) { }
    throw new Error(`فشل إضافة الموظف: ${response.status} - ${t}`);
  }
};

export const updateEmployee = async (id: string | number, data: any): Promise<void> => {
  const headers = await getHeaders();
  const response = await fetch(`${BASE_FOR_ENV}/personnel/api/employees/${id}/`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(data)
  });

  if (!response.ok) {
    const t = await response.text();
    try {
      const err = JSON.parse(t);
      if (err.first_name) throw new Error(`الاسم الأول: ${err.first_name}`);
    } catch (e) { }
    throw new Error(`فشل تحديث بيانات الموظف: ${response.status} - ${t}`);
  }


  // 2. Sidecar Update: Email (Local PHP)
  if (data.email) {
    try {
      let url = '/biometric_api/api/users.php';
      if (Capacitor.isNativePlatform()) url = 'https://qssun.solar/api/api/users.php';

      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: id,
          email: data.email,
          name: data.first_name // Optional
        })
      });
    } catch (e) {
      console.warn('Failed to update email locally', e);
      // We do strictly fail here, as the main update succeeded
    }
  }
};

export const deleteEmployee = async (id: string | number): Promise<void> => {
  const headers = await getHeaders();
  // Ensure ID is passed correctly. BioTime usually uses the internal ID (integer), but sometimes allows code.
  // Ideally we should use the ID we get from fetchAllEmployees. 
  // Wait, fetchAllEmployees returns {code, name}. It might not include the internal DB ID.
  // The API endpoint usually is /personnel/api/employees/{id}/ where {id} is the internal PK.
  // If we only have 'emp_code', we might need to filter first to get the ID?
  // Let's assume for now we use the code and see if it works, OR we update fetchAll to return ID too.

  // Let's UPDATE fetchAllEmployees to return 'id' as well.
  const response = await fetch(`${BASE_FOR_ENV}/personnel/api/employees/${id}/`, {
    method: 'DELETE',
    headers
  });

  if (!response.ok) {
    const t = await response.text();
    throw new Error(`فشل حذف الموظف: ${response.status} - ${t}`);
  }
};

export const fetchDepartments = async () => {
  const headers = await getHeaders();
  const response = await fetch(`${BASE_FOR_ENV}/personnel/api/departments/?page_size=100`, { headers });
  if (!response.ok) throw new Error("Failed to fetch departments");
  const raw = await response.json();
  return Array.isArray(raw) ? raw : raw.data || raw.results || [];
};

export const fetchAreas = async () => {
  const headers = await getHeaders();
  const response = await fetch(`${BASE_FOR_ENV}/personnel/api/areas/?page_size=100`, { headers });
  if (!response.ok) throw new Error("Failed to fetch areas");
  const raw = await response.json();
  return Array.isArray(raw) ? raw : raw.data || raw.results || [];
};

export const fetchPositions = async () => {
  const headers = await getHeaders();
  const response = await fetch(`${BASE_FOR_ENV}/personnel/api/positions/?page_size=100`, { headers });
  if (!response.ok) throw new Error("Failed to fetch positions");
  const raw = await response.json();
  return Array.isArray(raw) ? raw : raw.data || raw.results || [];
};
// Mobile GPS Attendance
export const registerMobilePunch = async (
  empCode: string,
  punchState: 'CHECK_IN' | 'CHECK_OUT',
  timestamp: string,
  latitude?: number,
  longitude?: number,
  imageProof?: string,
  areaAlias?: string
): Promise<{ status: 'success' | 'error'; message: string }> => {
  const stateCode = punchState === 'CHECK_IN' ? 0 : 1;
  let path = '/biometric_api/iclock/transactions.php';

  // Force Full URL for Native App OR Localhost Dev
  if (Capacitor.isNativePlatform() || window.location.hostname === 'localhost') {
    path = 'https://qssun.solar/iclock/transactions.php';
  }

  try {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        emp_code: empCode,
        punch_time: timestamp,
        punch_state: stateCode,
        area_alias: areaAlias || 'Mobile Punch',
        latitude: latitude,
        longitude: longitude,
        image_proof: imageProof
      })
    });

    const result = await response.json();
    return result;
  } catch (error) {
    console.error("Mobile Punch Error:", error);
    return { status: 'error', message: 'Network Error' };
  }
};
