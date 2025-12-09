import React, { useState, useEffect, useRef } from 'react';
import { LocationConfig } from '../types';
import { Map as MapIcon, Plus, Trash2, MapPin, Navigation, Save, Globe, Crosshair } from 'lucide-react';
import * as L from 'leaflet';

interface LocationManagerProps {
  locations: LocationConfig[];
  onAddLocation: (loc: LocationConfig) => void;
  onDeleteLocation: (id: string) => void;
}

const LocationManager: React.FC<LocationManagerProps> = ({ locations, onAddLocation, onDeleteLocation }) => {
  const [newLoc, setNewLoc] = useState<Partial<LocationConfig>>({
    name: '',
    lat: 24.7136, // Default to Riyadh
    lng: 46.6753,
    radius: 100, 
    active: true
  });
  const [loadingLoc, setLoadingLoc] = useState(false);
  
  // Leaflet Map Refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);

  // Initialize Map
  useEffect(() => {
    // Check if map container exists and map isn't already initialized
    if (mapContainerRef.current && !mapInstanceRef.current) {
        try {
            // Init map
            const map = L.map(mapContainerRef.current).setView([newLoc.lat!, newLoc.lng!], 15);
            
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors'
            }).addTo(map);

            mapInstanceRef.current = map;

            // Click Handler
            map.on('click', (e) => {
                setNewLoc(prev => ({ ...prev, lat: e.latlng.lat, lng: e.latlng.lng }));
            });

            // Initial Marker/Circle render
            const latLng = [newLoc.lat!, newLoc.lng!] as L.LatLngExpression;
            
            // Icon
            const icon = L.divIcon({
                className: 'custom-div-icon',
                html: `<div style="background-color: #3b82f6; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 4px 6px rgba(0,0,0,0.3);"></div>`,
                iconSize: [24, 24],
                iconAnchor: [12, 12]
            });
            
            markerRef.current = L.marker(latLng, { icon }).addTo(map);
            
            circleRef.current = L.circle(latLng, {
                color: '#3b82f6',
                fillColor: '#3b82f6',
                fillOpacity: 0.2,
                radius: newLoc.radius || 100
            }).addTo(map);

        } catch (e) {
            console.error("Leaflet Init Error:", e);
        }
    }

    // Cleanup function to remove map instance when component unmounts
    return () => {
        if (mapInstanceRef.current) {
            mapInstanceRef.current.remove();
            mapInstanceRef.current = null;
            markerRef.current = null;
            circleRef.current = null;
        }
    };
  }, []);

  // Update Map Markers when State Changes
  useEffect(() => {
    if (!mapInstanceRef.current || !newLoc.lat || !newLoc.lng) return;
    
    const latLng = [newLoc.lat, newLoc.lng] as L.LatLngExpression;

    // Update or Create Marker
    if (markerRef.current) {
        markerRef.current.setLatLng(latLng);
    }

    // Update or Create Circle
    if (circleRef.current) {
        circleRef.current.setLatLng(latLng);
        circleRef.current.setRadius(newLoc.radius || 100);
    }
    
  }, [newLoc.lat, newLoc.lng, newLoc.radius]);

  const getCurrentLocation = () => {
    setLoadingLoc(true);
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setNewLoc(prev => ({
            ...prev,
            lat: position.coords.latitude,
            lng: position.coords.longitude
          }));
          
          // Fly to location
          if (mapInstanceRef.current) {
              mapInstanceRef.current.flyTo([position.coords.latitude, position.coords.longitude], 17);
          }

          setLoadingLoc(false);
        },
        (error) => {
          alert("تعذر الحصول على الموقع الحالي. يرجى التأكد من تفعيل الـ GPS.");
          setLoadingLoc(false);
        },
        { enableHighAccuracy: true }
      );
    } else {
      alert("المتصفح لا يدعم تحديد الموقع.");
      setLoadingLoc(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLoc.name || !newLoc.lat || !newLoc.lng) {
      alert("يرجى تعبئة جميع الحقول المطلوبة");
      return;
    }

    const location: LocationConfig = {
      id: Date.now().toString(),
      name: newLoc.name,
      lat: newLoc.lat,
      lng: newLoc.lng,
      radius: newLoc.radius || 100,
      active: true
    };

    onAddLocation(location);
    // Reset but keep map somewhat centered
    setNewLoc(prev => ({ ...prev, name: '', radius: 100 }));
  };

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-3">
            <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg text-indigo-600 dark:text-indigo-400">
                <Globe size={24} />
            </div>
            إدارة النطاق الجغرافي
        </h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Map & Form Section */}
        <div className="lg:col-span-3 grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Form Column */}
            <div className="lg:col-span-1 bg-white dark:bg-[#1e293b] p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 h-full flex flex-col transition-colors relative overflow-hidden">
                {/* Decorative background */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-bl-full -mr-10 -mt-10 pointer-events-none"></div>

                <h3 className="font-bold text-lg mb-6 flex items-center gap-2 text-slate-800 dark:text-white relative z-10">
                    <Plus size={20} className="text-blue-600" />
                    إضافة موقع جديد
                </h3>
                
                <form onSubmit={handleSubmit} className="space-y-4 flex-1 relative z-10">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wide">اسم الموقع / الفرع</label>
                        <input
                            type="text"
                            placeholder="مثال: المبنى الرئيسي - الرياض"
                            value={newLoc.name}
                            onChange={e => setNewLoc({...newLoc, name: e.target.value})}
                            className="w-full p-3 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all placeholder-slate-400 text-sm"
                            required
                        />
                    </div>

                    <div className="pt-2">
                        <label className="flex justify-between text-xs font-bold text-slate-500 dark:text-slate-400 mb-2">
                            <span>نطاق التحضير (نصف القطر)</span>
                            <span className="text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded text-[10px]">{newLoc.radius} متر</span>
                        </label>
                        <input
                            type="range"
                            min="10"
                            max="500"
                            step="10"
                            value={newLoc.radius}
                            onChange={e => setNewLoc({...newLoc, radius: parseInt(e.target.value)})}
                            className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                        />
                        <p className="text-[10px] text-slate-400 mt-1">يحدد المسافة المسموحة للموظف للتحضير حول النقطة المحددة.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs font-mono text-slate-500 bg-slate-50 dark:bg-slate-900 p-2 rounded-lg border border-slate-200 dark:border-slate-700/50" dir="ltr">
                        <div>LAT: {newLoc.lat?.toFixed(5)}</div>
                        <div>LNG: {newLoc.lng?.toFixed(5)}</div>
                    </div>

                    <div className="mt-auto pt-4 space-y-3">
                        <button 
                            type="button"
                            onClick={getCurrentLocation}
                            disabled={loadingLoc}
                            className="w-full py-2.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-xl text-sm font-bold hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition flex items-center justify-center gap-2 border border-indigo-100 dark:border-indigo-900/30"
                        >
                            {loadingLoc ? <Navigation className="animate-spin" size={16}/> : <Crosshair size={16}/>}
                            تحديد موقعي الحالي
                        </button>

                        <button
                            type="submit"
                            className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-bold hover:bg-blue-700 transition flex items-center justify-center gap-2 shadow-lg shadow-blue-500/30"
                        >
                            <Save size={18} />
                            حفظ الموقع
                        </button>
                    </div>
                </form>
            </div>

            {/* Map Column */}
            <div className="lg:col-span-2 h-[500px] lg:h-auto min-h-[400px] bg-slate-100 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden relative shadow-inner">
                 <div ref={mapContainerRef} className="absolute inset-0 z-0 text-slate-500 flex items-center justify-center bg-slate-200 dark:bg-slate-700">
                     {!mapInstanceRef.current && <span className="animate-pulse">جاري تحميل الخريطة...</span>}
                 </div>
                 <div className="absolute top-4 right-4 z-[400] bg-white/90 dark:bg-slate-900/90 backdrop-blur px-4 py-2 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 pointer-events-none">
                    <span className="flex items-center gap-2">
                        <MapPin size={14} className="text-blue-500"/>
                        اضغط على الخريطة لتحديد المركز
                    </span>
                 </div>
            </div>
        </div>

        {/* Locations List */}
        <div className="lg:col-span-3 mt-8">
            <h3 className="font-bold text-lg mb-4 text-slate-800 dark:text-white flex items-center gap-2">
                <MapIcon size={20} />
                المواقع المحفوظة
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {locations.length === 0 && (
                    <div className="col-span-full text-center py-12 bg-white dark:bg-[#1e293b] rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 transition-colors flex flex-col items-center justify-center">
                        <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
                            <MapPin className="text-slate-300 dark:text-slate-600 w-8 h-8" />
                        </div>
                        <p className="text-slate-500 dark:text-slate-400 font-medium">لا توجد مواقع جغرافية مضافة حالياً</p>
                    </div>
                )}

                {locations.map(loc => (
                    <div key={loc.id} className="bg-white dark:bg-[#1e293b] p-5 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 flex justify-between items-start group hover:border-blue-200 dark:hover:border-blue-800 transition-all hover:-translate-y-1">
                        <div>
                            <div className="flex items-center gap-3 mb-3">
                                <div className="p-2.5 bg-blue-50 dark:bg-blue-900/20 rounded-xl text-blue-600 dark:text-blue-400 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                                    <MapPin size={20} />
                                </div>
                                <h4 className="font-bold text-slate-800 dark:text-white text-lg">{loc.name}</h4>
                            </div>
                            <div className="text-sm text-slate-500 dark:text-slate-400 space-y-2 mb-2">
                                <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 w-fit px-2 py-1 rounded text-xs font-mono text-slate-400" dir="ltr">
                                    <Globe size={12}/> {loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}
                                </div>
                                <p className="flex items-center gap-2 text-xs font-medium">
                                    <span className="w-2 h-2 bg-green-500 rounded-full inline-block animate-pulse"></span>
                                    نطاق مسموح: {loc.radius} متر
                                </p>
                            </div>
                        </div>
                        <button 
                            onClick={() => onDeleteLocation(loc.id)}
                            className="text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 p-2 rounded-lg transition"
                            title="حذف الموقع"
                        >
                            <Trash2 size={18} />
                        </button>
                    </div>
                ))}
            </div>
        </div>
      </div>
    </div>
  );
};

export default LocationManager;