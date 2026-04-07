"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { useLocale } from "@/context/locale-context";
import { useAuth } from "@clerk/nextjs";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Search, 
  MapPin, 
  Navigation, 
  ArrowLeft, 
  Filter, 
  X,
  Building2,
  BedDouble,
  Maximize2,
  Check,
  Undo2,
  RotateCcw,
  Save,
  Bell,
  School,
  Baby,
  ShoppingCart,
  Loader2
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";

export default function MapSearchClient() {
  const { userId } = useAuth();
  const { resolvedTheme } = useTheme();
  const { t, locale } = useLocale();
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const tileLayerRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  
  const [listings, setListings] = useState<any[]>([]);
  const [filteredListings, setFilteredListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedListing, setSelectedListing] = useState<any>(null);
  
  const [filters, setFilters] = useState({
    type: "",
    minPrice: "",
    maxPrice: "",
    rooms: "",
  });
  const [drawingActive, setDrawingActive] = useState(false);
  const [polygonPoints, setPolygonPoints] = useState<any[] | null>(null);

  // POI State
  const [activePois, setActivePois] = useState<string[]>([]);
  const [poiData, setPoiData] = useState<any[]>([]);
  const [poiLoading, setPoiLoading] = useState(false);
  const poiMarkersRef = useRef<any[]>([]);
  const activePoisRef = useRef<string[]>([]);

  useEffect(() => {
    activePoisRef.current = activePois;
  }, [activePois]);

  // Calculate distance between two points
  const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  useEffect(() => {
    fetch("/api/listings/map")
      .then(res => res.json())
      .then(data => {
        setListings(data);
        setFilteredListings(data);
        setLoading(false);
      });
  }, []);

  // Fetch POIs from Overpass API with mirror rotation and retries
  const fetchPOIs = async (categories: string[]) => {
    if (categories.length === 0 || !mapRef.current) {
      setPoiData([]);
      return;
    }

    setPoiLoading(true);
    const bounds = mapRef.current.getBounds();
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    
    // Overpass QL query
    let query = `[out:json][timeout:20];(`;
    if (categories.includes("school")) query += `node["amenity"="school"](${sw.lat},${sw.lng},${ne.lat},${ne.lng});way["amenity"="school"](${sw.lat},${sw.lng},${ne.lat},${ne.lng});`;
    if (categories.includes("kindergarten")) query += `node["amenity"="kindergarten"](${sw.lat},${sw.lng},${ne.lat},${ne.lng});way["amenity"="kindergarten"](${sw.lat},${sw.lng},${ne.lat},${ne.lng});`;
    if (categories.includes("supermarket")) query += `node["shop"="supermarket"](${sw.lat},${sw.lng},${ne.lat},${ne.lng});`;
    query += `);out body;>;out skel qt;`;

    const mirrors = [
      "https://overpass-api.de/api/interpreter",
      "https://lz4.overpass-api.de/api/interpreter",
      "https://z.overpass-api.de/api/interpreter",
      "https://overpass.kumi.systems/api/interpreter",
      "https://overpass.openstreetmap.ru/api/interpreter",
      "https://overpass.nchc.org.tw/api/interpreter"
    ];

    let success = false;
    let allData: any[] = [];

    // Attempt to fetch from mirrors with retry logic
    const tryFetch = async (queryStr: string) => {
      for (const mirror of mirrors) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout
          
          const response = await fetch(`${mirror}?data=${encodeURIComponent(queryStr)}`, { 
            signal: controller.signal,
            headers: { 'Accept': 'application/json' }
          });
          
          clearTimeout(timeoutId);

          if (!response.ok) continue;

          const text = await response.text();
          if (!text.trim().startsWith('{')) continue;

          const data = JSON.parse(text);
          return data.elements || [];
        } catch (error) {
          continue;
        }
      }
      return null;
    };

    const result = await tryFetch(query);
    if (result) {
      setPoiData(result);
      success = true;
    }

    if (!success) {
      console.warn("All Overpass mirrors timed out for full query. Feature might be degraded.");
      setPoiData([]);
    }
    setPoiLoading(false);
  };

  useEffect(() => {
    if (activePois.length > 0) {
      fetchPOIs(activePois);
    } else {
      setPoiData([]);
    }
  }, [activePois]);

  // Update POI markers when data changes
  useEffect(() => {
    const L = (window as any).L;
    if (!L || !mapRef.current) return;

    // Clear existing POI markers
    poiMarkersRef.current.forEach(m => m.remove());
    poiMarkersRef.current = [];

    poiData.forEach(poi => {
      const lat = poi.lat || (poi.center && poi.center.lat);
      const lon = poi.lon || (poi.center && poi.center.lon);
      if (!lat || !lon) return;

      let iconHtml = "";
      let bgColor = "";
      const type = poi.tags?.amenity || poi.tags?.shop;

      if (type === "school") {
        bgColor = "#4caf50"; // Green
        iconHtml = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m4 6 8-4 8 4-8 4-8-4z"/><path d="m22 10-10 5L2 10"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>`;
      } else if (type === "kindergarten") {
        bgColor = "#e91e63"; // Pink
        iconHtml = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12h.01"/><path d="M15 12h.01"/><path d="M10 16c.5.3 1.2.5 2 .5s1.5-.2 2-.5"/><path d="M19 6.3a9 9 0 0 1 1.8 3.9 2 2 0 0 1 0 3.6 9 9 0 0 1-17.6 0 2 2 0 0 1 0-3.6A9 9 0 0 1 5 6.3"/><path d="m12 10 7-7"/><path d="M12 10 5 3"/></svg>`;
      } else if (type === "supermarket") {
        bgColor = "#2196f3"; // Blue
        iconHtml = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>`;
      }

      const icon = L.divIcon({
        className: "",
        html: `
          <div class="poi-marker" style="
            background: ${bgColor};
            color: white;
            width: 28px;
            height: 28px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            border: 2px solid ${resolvedTheme === "dark" ? "#1e293b" : "white"};
            transition: all 0.2s;
          ">
            ${iconHtml}
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const marker = L.marker([lat, lon], { icon })
        .addTo(mapRef.current)
        .bindPopup(`<strong>${poi.tags?.name || (locale === "uz" ? "Nomsiz joy" : "Безымянное место")}</strong><br/>${type}`);
      
      poiMarkersRef.current.push(marker);
    });
  }, [poiData, locale]);

  // Load Leaflet and Geoman scripts/CSS
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-css";
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }

    if (!document.getElementById("geoman-css")) {
      const link = document.createElement("link");
      link.id = "geoman-css";
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/@geoman-io/leaflet-geoman-free@latest/dist/leaflet-geoman.css";
      document.head.appendChild(link);
    }

    const loadScripts = async () => {
      if (!(window as any).L) {
        await new Promise((resolve) => {
          const script = document.createElement("script");
          script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
          script.onload = resolve;
          document.body.appendChild(script);
        });
      }
      if (!(window as any).L.PM) {
        await new Promise((resolve) => {
          const pmScript = document.createElement("script");
          pmScript.src = "https://unpkg.com/@geoman-io/leaflet-geoman-free@latest/dist/leaflet-geoman.min.js";
          pmScript.onload = resolve;
          document.body.appendChild(pmScript);
        });
      }
      setLoading(false);
    };

    loadScripts();
  }, []);

  // Initialize Map
  useEffect(() => {
    if (loading || !mapContainer.current || mapRef.current) return;

    const L = (window as any).L;
    if (!L) return;

    const map = L.map(mapContainer.current, {
      zoomControl: false
    }).setView([41.2995, 69.2401], 12); // Toshkent center
    mapRef.current = map;

    const tileUrl = resolvedTheme === "dark" 
      ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";

    const tileLayer = L.tileLayer(tileUrl, {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 20,
    }).addTo(map);
    
    tileLayerRef.current = tileLayer;

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    updateMarkers();
  }, [loading]);

  // Handle POI refresh on map move
  useEffect(() => {
    if (!mapRef.current) return;
    
    const handleMoveEnd = () => {
      if (activePoisRef.current.length > 0) {
        fetchPOIs(activePoisRef.current);
      }
    };

    mapRef.current.on('moveend', handleMoveEnd);
    return () => {
      mapRef.current?.off('moveend', handleMoveEnd);
    };
  }, [loading]);

  // Sync Map Theme
  useEffect(() => {
    if (!tileLayerRef.current) return;
    
    const tileUrl = resolvedTheme === "dark" 
      ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
    
    tileLayerRef.current.setUrl(tileUrl);
  }, [resolvedTheme]);

  const updateMarkers = () => {
    const L = (window as any).L;
    if (!L || !mapRef.current) return;

    // Clear existing markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    filteredListings.forEach(listing => {
      const icon = L.divIcon({
        className: "",
        html: `
          <div class="marker-pin-modern-map" style="
            background: ${resolvedTheme === "dark" ? "#1e293b" : "white"};
            padding: 5px 12px;
            border-radius: 20px;
            color: ${resolvedTheme === "dark" ? "white" : "#0f172a"};
            font-weight: 900;
            font-size: 13px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05);
            white-space: nowrap;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            cursor: pointer;
            position: relative;
            transform-origin: bottom center;
          ">
            $${(listing.price / 1000).toFixed(0)}k
            <div style="
              position: absolute;
              bottom: -4px;
              left: 50%;
              transform: translateX(-50%);
              width: 0; height: 0;
              border-left: 5px solid transparent;
              border-right: 5px solid transparent;
              border-top: 5px solid ${resolvedTheme === "dark" ? "#1e293b" : "white"};
            "></div>
          </div>
        `,
        iconSize: [50, 30],
        iconAnchor: [25, 30],
      });

      // Filter by polygon if active
      if (polygonPoints && !isPointInPolygon([listing.latitude, listing.longitude], polygonPoints)) {
        return;
      }

      const marker = L.marker([listing.latitude, listing.longitude], { icon })
        .addTo(mapRef.current)
        .on('click', () => setSelectedListing(listing));
      
      markersRef.current.push(marker);
    });
  };

  useEffect(() => {
    updateMarkers();
  }, [filteredListings, polygonPoints]);

  const isPointInPolygon = (point: number[], polygon: any[]) => {
    const x = point[0], y = point[1];
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].lat, yi = polygon[i].lng;
      const xj = polygon[j].lat, yj = polygon[j].lng;
      const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  };

  const toggleDrawing = () => {
    if (!mapRef.current) return;
    if (drawingActive) {
      mapRef.current.pm.disableDraw();
      setDrawingActive(false);
    } else {
      mapRef.current.pm.enableDraw('Polygon', {
        snappable: true,
        snapDistance: 20,
      });
      setDrawingActive(true);
      
      mapRef.current.on('pm:create', (e: any) => {
        const layer = e.layer;
        const coords = layer.getLatLngs()[0];
        setPolygonPoints(coords);
        setDrawingActive(false);
        mapRef.current.pm.disableDraw();
        
        // Remove the drawn layer from map as we use our own state to filter
        layer.remove();
      });
    }
  };

  const clearPolygon = () => {
    setPolygonPoints(null);
  };

  const handleSaveSearch = async () => {
    if (!userId) {
      alert(locale === "uz" ? "Qidiruvni saqlash uchun tizimga kiring." : "Войдите, чтобы сохранить поиск.");
      return;
    }
    try {
      const res = await fetch("/api/user/saved-searches", {
        method: "POST",
        body: JSON.stringify({
          name: `Search ${new Date().toLocaleDateString()}`,
          filters,
          polygon: polygonPoints
        })
      });
      if (res.ok) {
        alert(locale === "uz" ? "Qidiruv saqlandi! Yangi e'lonlar haqida bildirishnoma olasiz." : "Поиск сохранен! Вы получите уведомление о новых объявлениях.");
      }
    } catch (e) {
      console.error("Save search failed:", e);
    }
  };

  const applyFilters = () => {
    let result = [...listings];
    if (filters.type) result = result.filter(l => l.type === filters.type);
    if (filters.minPrice) result = result.filter(l => l.price >= parseInt(filters.minPrice));
    if (filters.maxPrice) result = result.filter(l => l.price <= parseInt(filters.maxPrice));
    if (filters.rooms) result = result.filter(l => l.rooms === parseInt(filters.rooms));
    setFilteredListings(result);
  };

  const centerOnUser = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      const { latitude, longitude } = pos.coords;
      mapRef.current?.setView([latitude, longitude], 14);
    });
  };

  return (
    <div className="fixed inset-0 pt-[68px] 3xl:pt-[100px] flex overflow-hidden bg-background">
      {/* Sidebar Filter/List */}
      <div className="w-full md:w-[400px] h-full flex flex-col border-r bg-card z-20 shadow-xl overflow-hidden">
        <div className="p-4 border-b space-y-4">
          <div className="flex items-center gap-2">
            <Link href="/">
              <Button variant="ghost" size="icon" className="shrink-0 h-9 w-9 rounded-xl">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder={t("hero.search_placeholder")} 
                className="pl-9 h-10 rounded-xl bg-muted/50 border-none"
              />
            </div>
          </div>

          <div className="flex gap-2 pb-1 overflow-x-auto no-scrollbar">
            <Button 
              size="sm" 
              variant={filters.type === "sale" ? "default" : "outline"} 
              onClick={() => {
                const newType = filters.type === "sale" ? "" : "sale";
                setFilters({...filters, type: newType});
              }}
              className="rounded-full h-8 px-4 text-xs font-bold"
            >
              {t("listing.sale")}
            </Button>
            <Button 
              size="sm" 
              variant={filters.type === "rent" ? "default" : "outline"}
              onClick={() => {
                const newType = filters.type === "rent" ? "" : "rent";
                setFilters({...filters, type: newType});
              }}
              className="rounded-full h-8 px-4 text-xs font-bold"
            >
              {t("listing.rent")}
            </Button>
            <Button size="sm" variant="outline" className="rounded-full h-8 px-4 text-xs font-bold flex items-center gap-1.5">
              <Filter className="h-3 w-3" /> {locale === "uz" ? "Filtrlar" : "Фильтры"}
            </Button>
          </div>

          <div className="pt-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">
              {locale === "uz" ? "Yaqin atrofdagi ob'ektlar" : "Объекты поблизости"}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button 
                size="sm" 
                variant={activePois.includes("school") ? "default" : "outline"}
                className={cn(
                  "rounded-xl h-9 px-3 text-[11px] font-bold border-2 transition-all",
                  activePois.includes("school") ? "bg-[#4caf50] hover:bg-[#43a047] border-[#4caf50]" : "hover:border-[#4caf50] text-[#4caf50]"
                )}
                onClick={() => {
                  setActivePois(prev => prev.includes("school") ? prev.filter(p => p !== "school") : [...prev, "school"]);
                }}
              >
                <School className="h-3.5 w-3.5 mr-1.5" />
                {locale === "uz" ? "Maktablar" : "Школы"}
              </Button>
              <Button 
                size="sm" 
                variant={activePois.includes("kindergarten") ? "default" : "outline"}
                className={cn(
                  "rounded-xl h-9 px-3 text-[11px] font-bold border-2 transition-all",
                  activePois.includes("kindergarten") ? "bg-[#e91e63] hover:bg-[#d81b60] border-[#e91e63]" : "hover:border-[#e91e63] text-[#e91e63]"
                )}
                onClick={() => {
                  setActivePois(prev => prev.includes("kindergarten") ? prev.filter(p => p !== "kindergarten") : [...prev, "kindergarten"]);
                }}
              >
                <Baby className="h-3.5 w-3.5 mr-1.5" />
                {locale === "uz" ? "Bog'chalar" : "Сады"}
              </Button>
              <Button 
                size="sm" 
                variant={activePois.includes("supermarket") ? "default" : "outline"}
                className={cn(
                  "rounded-xl h-9 px-3 text-[11px] font-bold border-2 transition-all",
                  activePois.includes("supermarket") ? "bg-[#2196f3] hover:bg-[#1e88e5] border-[#2196f3]" : "hover:border-[#2196f3] text-[#2196f3]"
                )}
                onClick={() => {
                  setActivePois(prev => prev.includes("supermarket") ? prev.filter(p => p !== "supermarket") : [...prev, "supermarket"]);
                }}
              >
                <ShoppingCart className="h-3.5 w-3.5 mr-1.5" />
                {locale === "uz" ? "Marketlar" : "Маркеты"}
              </Button>
              {poiLoading && (
                <div className="flex items-center ml-2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Listings List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-muted/5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">
              {filteredListings.length} {locale === "uz" ? "ta e'lon topildi" : "объявлений найдено"}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {filteredListings.map(listing => (
              <div 
                key={listing.id}
                onMouseEnter={() => {
                   mapRef.current?.setView([listing.latitude, listing.longitude], 15);
                }}
                className={cn(
                  "flex bg-card border rounded-2xl overflow-hidden hover:shadow-lg transition-all cursor-pointer group",
                  selectedListing?.id === listing.id ? "ring-2 ring-primary" : ""
                )}
                onClick={() => setSelectedListing(listing)}
              >
                <div className="relative w-32 shrink-0 aspect-square overflow-hidden bg-muted">
                  <Image 
                    src={listing.images[0]?.url || "/placeholder-property.jpg"} 
                    fill 
                    alt={listing.title} 
                    className="object-cover group-hover:scale-110 transition-transform duration-500"
                  />
                </div>
                <div className="p-3 flex-1 min-w-0 flex flex-col justify-between">
                  <div>
                    <h4 className="font-bold text-sm truncate group-hover:text-primary transition-colors">{listing.title}</h4>
                    <p className="text-base font-black text-primary mt-0.5 tabular-nums">
                      ${listing.price.toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 mt-1 opacity-60">
                    <div className="flex items-center gap-1 text-[11px] font-bold">
                      <BedDouble className="h-3 w-3" /> {listing.rooms}
                    </div>
                    <div className="flex items-center gap-1 text-[11px] font-bold">
                      <Maximize2 className="h-3 w-3" /> {listing.area}m²
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Map Container */}
      <div className="flex-1 relative">
        <div ref={mapContainer} className="w-full h-full z-10" />
        
        {/* Floating Controls */}
        <div className="absolute top-4 right-4 z-20 flex flex-col gap-2">
          <Button 
            size="icon" 
            variant="secondary" 
            className="h-10 w-10 rounded-xl bg-card/90 backdrop-blur-md shadow-lg"
            onClick={centerOnUser}
          >
            <Navigation className="h-5 w-5" />
          </Button>

          <Button 
            size="icon" 
            variant={drawingActive ? "default" : "secondary"}
            className={cn(
              "h-10 w-10 rounded-xl bg-card/90 backdrop-blur-md shadow-lg transition-all",
              drawingActive && "ring-2 ring-primary bg-primary text-white"
            )}
            onClick={toggleDrawing}
          >
            <Undo2 className="h-5 w-5" />
          </Button>

          {polygonPoints && (
            <Button 
              size="icon" 
              variant="destructive"
              className="h-10 w-10 rounded-xl shadow-lg"
              onClick={clearPolygon}
            >
              <RotateCcw className="h-5 w-5" />
            </Button>
          )}

          <Button 
            size="icon" 
            variant="secondary"
            className="h-10 w-10 rounded-xl bg-card/90 backdrop-blur-md shadow-lg"
            onClick={handleSaveSearch}
          >
            <Bell className="h-5 w-5" />
          </Button>
        </div>

        {/* Desktop Quick Info Popup */}
        {selectedListing && (
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30 w-[calc(100%-32px)] max-w-sm bg-card dark:bg-slate-900 rounded-[32px] p-2 shadow-2xl border border-border/20 animate-in fade-in slide-in-from-bottom-5">
             <div className="flex gap-4">
                <Link href={`/listings/${selectedListing.id}`} className="relative w-32 h-32 rounded-[24px] overflow-hidden shrink-0 hover:opacity-90 transition-opacity">
                   <Image src={selectedListing.images[0]?.url || "/placeholder-property.jpg"} fill alt="" className="object-cover" />
                </Link>
                <div className="flex-1 py-1 pr-4 min-w-0 flex flex-col justify-between">
                   <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-bold px-2 py-0.5 bg-primary/10 text-primary rounded-full uppercase">{selectedListing.type}</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSelectedListing(null)}><X className="h-4 w-4" /></Button>
                      </div>
                       <Link href={`/listings/${selectedListing.id}`}>
                          <h3 className="font-black text-lg truncate mt-1 hover:text-primary transition-colors cursor-pointer">{selectedListing.title}</h3>
                       </Link>
                       <p className="text-xl font-black text-primary">${selectedListing.price.toLocaleString()}</p>
                    </div>
                   <Link href={`/listings/${selectedListing.id}`} className="block">
                      <Button className="w-full h-9 rounded-xl text-xs font-bold">Batafsil ko'rish</Button>
                   </Link>
                </div>
             </div>
          </div>
        )}
      </div>

      <style jsx global>{`
        .leaflet-div-icon {
          background: transparent !important;
          border: none !important;
        }
        .marker-pin-modern-map:hover {
          transform: scale(1.15) translateY(-5px);
          z-index: 1000 !important;
          background: #3D5AFE !important;
          color: white !important;
          box-shadow: 0 10px 30px rgba(61,90,254,0.3);
        }
        .marker-pin-modern-map:hover div {
          border-top-color: #3D5AFE !important;
        }
        .poi-marker:hover {
          transform: scale(1.4);
          z-index: 1001 !important;
        }
        .leaflet-container {
          background: #f1f5f9 !important;
        }
        .leaflet-control-zoom {
          border: none !important;
          box-shadow: 0 8px 32px rgba(0,0,0,0.12) !important;
          margin-right: 20px !important;
          margin-bottom: 20px !important;
        }
        .leaflet-control-zoom-in, .leaflet-control-zoom-out {
          background: rgba(255, 255, 255, 0.9) !important;
          backdrop-filter: blur(10px) !important;
          border-radius: 14px !important;
          border: 1px solid rgba(0,0,0,0.05) !important;
          margin: 4px !important;
          color: #1e293b !important;
          width: 36px !important;
          height: 36px !important;
          line-height: 36px !important;
          font-weight: 900 !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          transition: all 0.2s !important;
        }
        .leaflet-control-zoom-in:hover, .leaflet-control-zoom-out:hover {
          background: white !important;
          color: #3D5AFE !important;
          transform: scale(1.05);
        }
      `}</style>
    </div>
  );
}
