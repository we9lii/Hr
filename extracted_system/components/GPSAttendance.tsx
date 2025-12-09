import React, { useState, useEffect } from 'react';
import { MapPin, Loader2, CheckCircle, AlertTriangle } from 'lucide-react';
import { submitGPSAttendance } from '../services/api';

const GPSAttendance: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [location, setLocation] = useState<{lat: number, lng: number} | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (err) => setError("تعذر الحصول على الموقع.")
      );
    } else {
      setError("المتصفح لا يدعم تحديد الموقع الجغرافي.");
    }
  }, []);

  const handleCheckIn = async () => {
    if (!location) return;
    setLoading(true);
    try {
      await submitGPSAttendance("ADMIN_TEST", location.lat, location.lng, 'CHECK_IN');
      setSuccess(true);
    } catch (e) {
      setError("فشل الاتصال");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center animate-fade-in bg-white dark:bg-slate-800 rounded-xl shadow-sm">
        <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-4">
          <CheckCircle className="text-green-600 dark:text-green-400 w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-2">تم التحضير (وضع المسؤول)</h2>
        <button onClick={() => setSuccess(false)} className="text-primary hover:underline">عودة</button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden transition-colors">
      <div className="p-6 border-b border-gray-100 dark:border-slate-700">
        <h2 className="text-xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
          <MapPin className="text-primary" />
          اختبار نظام الـ GPS
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">هذه الصفحة لاختبار الإحداثيات والاتصال من لوحة التحكم.</p>
      </div>

      <div className="p-6">
        <div className="relative w-full h-48 bg-gray-100 dark:bg-slate-700 rounded-xl overflow-hidden mb-6 flex items-center justify-center border-2 border-dashed border-gray-300 dark:border-slate-600">
          {location ? (
             <div className="text-center">
                 <MapPin className="text-red-600 w-8 h-8 mx-auto mb-2 animate-bounce" />
                 <p dir="ltr" className="font-mono text-gray-600 dark:text-gray-300">{location.lat.toFixed(6)}, {location.lng.toFixed(6)}</p>
             </div>
          ) : (
            <div className="flex flex-col items-center text-gray-400">
              <Loader2 className="w-8 h-8 animate-spin mb-2" />
              <span>جاري تحديد الموقع...</span>
            </div>
          )}
        </div>

        {error && <p className="text-red-500 text-sm mb-4 text-center">{error}</p>}

        <div className="flex justify-center">
           <button
             onClick={handleCheckIn}
             disabled={!location || loading}
             className="px-8 py-3 bg-primary text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
           >
             {loading ? 'جاري الإرسال...' : 'اختبار تسجيل دخول'}
           </button>
        </div>
      </div>
    </div>
  );
};

export default GPSAttendance;