import { AttendanceMethod, AttendanceRecord, DashboardStats, User } from '../types';

// Real API Configuration
const API_CONFIG = {
  baseUrl: 'http://qssun.dyndns.org:8085/personnel/api',
  username: 'admin',
  password: 'Admin@123', 
};

// Helper to generate Basic Auth Headers
const getHeaders = () => {
    const credentials = btoa(`${API_CONFIG.username}:${API_CONFIG.password}`);
    return {
        'Authorization': `Basic ${credentials}`,
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
export const fetchAttendanceLogs = async (): Promise<AttendanceRecord[]> => {
  try {
    const response = await fetch(`${API_CONFIG.baseUrl}/transactions/`, {
      method: 'GET',
      headers: getHeaders()
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Server Error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    
    // Mapping Logic: Convert ZK API JSON format to our App's format
    // Adjust these field names based on the EXACT JSON response from your middleware
    return data.map((item: any, index: number) => {
        // Determine Status based on time (Simplified logic, can be enhanced)
        const punchTime = new Date(item.punch_time || item.time || item.timestamp);
        const isLate = punchTime.getHours() > 8 || (punchTime.getHours() === 8 && punchTime.getMinutes() > 15);

        return {
            id: item.id ? String(item.id) : `log-${index}`,
            employeeId: item.emp_code || item.user_id || 'UNKNOWN',
            employeeName: item.emp_name || `${item.first_name || ''} ${item.last_name || ''}`.trim() || 'Unknown Employee',
            timestamp: punchTime.toISOString(),
            // Assuming ZK convention: 0/CheckIn, 1/CheckOut. Adjust key as needed.
            type: (item.punch_state === '0' || item.punch_state === 'CHECK_IN') ? 'CHECK_IN' : 'CHECK_OUT',
            method: item.verify_mode === 'FACE' ? AttendanceMethod.FACE : 
                    item.verify_mode === 'GPS' ? AttendanceMethod.GPS : 
                    AttendanceMethod.FINGERPRINT,
            status: isLate ? 'LATE' : 'ON_TIME',
            location: item.latitude && item.longitude ? {
                lat: parseFloat(item.latitude),
                lng: parseFloat(item.longitude),
                address: item.area_alias || 'موقع مسجل'
            } : undefined
        };
    }).sort((a: AttendanceRecord, b: AttendanceRecord) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

  } catch (error) {
    console.error("Fetch Logs Error:", error);
    // Return empty array to indicate no data found / connection error
    // The UI should handle the empty state.
    throw error;
  }
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

      const response = await fetch(`${API_CONFIG.baseUrl}/transactions/add/`, {
          method: 'POST',
          headers: getHeaders(),
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