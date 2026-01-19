import React, { useState, useEffect } from 'react';
import { MapPin, Camera, CheckCircle, XCircle, Loader, Navigation } from 'lucide-react';
import { User, LocationConfig } from '../types';
import { registerMobilePunch } from '../services/api';

interface MobilePunchProps {
    currentUser: User;
    locations: LocationConfig[];
}

// Haversine Formula for Distance (Meters)
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

const MobilePunch: React.FC<MobilePunchProps> = ({ currentUser, locations }) => {
    const [location, setLocation] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [watchId, setWatchId] = useState<number | null>(null);

    // ... (useEffect remains same) ...

    const handlePunch = async (type: 'CHECK_IN' | 'CHECK_OUT') => {
        if (!location) {
            setError("Waiting for GPS location...");
            return;
        }
        setLoading(true);
        setSuccessMsg(null);
        setError(null);

        // Check Geofence
        let isInsideOne = false;
        let matchedLocationName = '';

        locations.forEach(loc => {
            if (!loc.active) return;
            const dist = calculateDistance(location.lat, location.lng, loc.lat, loc.lng);
            if (dist <= loc.radius) {
                isInsideOne = true;
                matchedLocationName = loc.name;
            }
        });

        const isRemote = !isInsideOne;

        // AUTH CHECK: Only allow specific users to punch Remotely
        // Faisal ALNutayfi (1093394672) - User ID from context
        const AUTHORIZED_REMOTE_USERS = ['1093394672', '109339462']; // Added typo version just in case

        if (isRemote) {
            const userId = currentUser.employeeId || currentUser.username;
            if (!AUTHORIZED_REMOTE_USERS.includes(userId)) {
                setError("عذراً، تسجيل الحضور عن بعد غير مصرح به لحسابك. (Remote Punching Not Allowed)");
                setLoading(false);
                return;
            }
        }

        // Format localized timestamp
        const now = new Date();
        const pad = (n: number) => n.toString().padStart(2, '0');
        const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

        // FUTURE: Image Capture Logic Here (Selfie)
        const imageProof = undefined;

        const result = await registerMobilePunch(
            currentUser.employeeId || currentUser.username, // Use mapped ID
            type,
            timestamp,
            location.lat,
            location.lng,
            imageProof,
            isRemote ? `Remote Punch (GPS: ${Math.round(location.accuracy)}m)` : `Mobile Punch (${matchedLocationName})`,
            isRemote
        );

        setLoading(false);

        if (result.status === 'success') {
            setSuccessMsg(result.message); // Show Server Response (contains GPS confirmation)
            // Haptic Feedback (if supported)
            if (navigator.vibrate) navigator.vibrate(200);
        } else {
            setError(`Failed: ${result.message}`);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-[80vh] p-6 space-y-8 bg-gray-900 text-white animate-in fade-in duration-500">

            {/* Header Info */}
            <div className="text-center space-y-2">
                <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-500 bg-clip-text text-transparent">
                    Mobile Attendance
                </h1>
                <p className="text-gray-400">Recorded for: <span className="text-white font-mono">{currentUser.name || currentUser.username}</span></p>
            </div>

            {/* Location Status */}
            <div className={`flex items-center space-x-2 px-4 py-2 rounded-full border ${location ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-red-500/50 bg-red-500/10'}`}>
                {location ? <Navigation className="w-5 h-5 text-emerald-400 animate-pulse" /> : <Loader className="w-5 h-5 animate-spin text-red-400" />}
                <span className="text-sm font-medium">
                    {location
                        ? `GPS Active (±${Math.round(location.accuracy)}m)`
                        : "Acquiring Satellite Fix..."}
                </span>
            </div>

            {/* Main Buttons */}
            <div className="grid grid-cols-1 gap-6 w-full max-w-sm">
                <button
                    onClick={() => handlePunch('CHECK_IN')}
                    disabled={loading || !location}
                    className="relative group overflow-hidden bg-emerald-600 hover:bg-emerald-500 active:scale-95 transition-all p-8 rounded-2xl shadow-lg shadow-emerald-900/50 border border-emerald-500/30"
                >
                    <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="flex flex-col items-center space-y-3">
                        <CheckCircle className="w-16 h-16 text-white" />
                        <span className="text-2xl font-bold tracking-wider">CHECK IN</span>
                        <span className="text-xs text-emerald-200">Start Work / تسجيل دخول</span>
                    </div>
                </button>

                <button
                    onClick={() => handlePunch('CHECK_OUT')}
                    disabled={loading || !location}
                    className="relative group overflow-hidden bg-rose-600 hover:bg-rose-500 active:scale-95 transition-all p-8 rounded-2xl shadow-lg shadow-rose-900/50 border border-rose-500/30"
                >
                    <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="flex flex-col items-center space-y-3">
                        <XCircle className="w-16 h-16 text-white" />
                        <span className="text-2xl font-bold tracking-wider">CHECK OUT</span>
                        <span className="text-xs text-rose-200">End Work / تسجيل خروج</span>
                    </div>
                </button>
            </div>

            {/* Location Debug Info (Small) */}
            {location && (
                <div className="text-xs text-gray-500 font-mono">
                    Lat: {location.lat.toFixed(6)} | Lng: {location.lng.toFixed(6)}
                </div>
            )}

            {/* Feedback Messages */}
            {error && (
                <div className="w-full max-w-sm p-4 bg-red-900/20 border border-red-500/50 rounded-lg text-red-200 text-center animate-bounce">
                    {error}
                </div>
            )}

            {successMsg && (
                <div className="w-full max-w-sm p-4 bg-emerald-900/20 border border-emerald-500/50 rounded-lg text-emerald-200 text-center animate-pulse">
                    {successMsg}
                </div>
            )}

        </div>
    );
};

export default MobilePunch;
