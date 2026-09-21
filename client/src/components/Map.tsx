/// <reference types="@types/google.maps" />

import { Fragment, useEffect, useRef, useState } from "react";
import { Circle as LeafletCircle, LayersControl, MapContainer as LeafletMapContainer, Marker as LeafletMarker, Popup as LeafletPopup, TileLayer as LeafletTileLayer, Tooltip as LeafletTooltip } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { usePersistFn } from "@/hooks/usePersistFn";
import { cn } from "@/lib/utils";

declare global {
  interface Window {
    google?: typeof google;
  }
}

const API_KEY = import.meta.env.VITE_FRONTEND_FORGE_API_KEY;
const FORGE_BASE_URL = import.meta.env.VITE_FRONTEND_FORGE_API_URL || "https://forge.butterfly-effect.dev";
const MAPS_PROXY_URL = window.location.hostname.endsWith("vercel.app") ? "/maps-proxy" : `${FORGE_BASE_URL}/v1/maps/proxy`;

let mapsScriptPromise: Promise<void> | null = null;

function loadMapScript() {
  if (window.google?.maps) return Promise.resolve();
  if (mapsScriptPromise) return mapsScriptPromise;

  mapsScriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `${MAPS_PROXY_URL}/maps/api/js?key=${API_KEY}&v=weekly&libraries=marker,places,geocoding,geometry`;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.onload = () => window.google?.maps ? resolve() : reject(new Error("Google Maps loaded without an initialized API."));
    script.onerror = () => reject(new Error("Failed to load Google Maps script."));
    document.head.appendChild(script);
  }).catch(error => {
    mapsScriptPromise = null;
    throw error;
  });

  return mapsScriptPromise;
}

export type FallbackMapHotspot = {
  id: string;
  location: { lat: number; lng: number };
  title: string;
  color: string;
  radiusM: number;
  frpMw?: number | null;
  namedFacilityMatch?: boolean;
  activeMonths?: number | null;
  onClick: () => void;
  onSelect?: () => void;
};

export type MapWind = {
  state: "available" | "cached" | "unavailable";
  windSpeedKmh: number | null;
  windDirectionDeg: number | null;
};

export function thermalMarkerColor(value: number | null | undefined, allValues: Array<number | null | undefined>) {
  const values = allValues.filter((item): item is number => typeof item === "number" && Number.isFinite(item));
  if (typeof value !== "number" || !Number.isFinite(value) || values.length < 2) return "#b86751";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const ratio = max === min ? 0.5 : Math.max(0, Math.min(1, (value - min) / (max - min)));
  const stops = [
    { at: 0, color: [246, 216, 137] },
    { at: 0.5, color: [232, 143, 75] },
    { at: 1, color: [194, 61, 55] },
  ];
  const left = ratio <= 0.5 ? stops[0] : stops[1];
  const right = ratio <= 0.5 ? stops[1] : stops[2];
  const local = (ratio - left.at) / (right.at - left.at);
  const rgb = left.color.map((channel, index) => Math.round(channel + (right.color[index] - channel) * local));
  return `rgb(${rgb.join(", ")})`;
}

function layerColor(hotspot: FallbackMapHotspot, activeLayer: string, allHotspots: FallbackMapHotspot[]) {
  if (activeLayer === "OSM context") return "#668a78";
  if (activeLayer === "Persistence") return "#786aa8";
  return thermalMarkerColor(hotspot.frpMw, allHotspots.map(item => item.frpMw));
}

function layerRadius(hotspot: FallbackMapHotspot, activeLayer: string) {
  if (activeLayer === "Persistence") return hotspot.radiusM * 1.15;
  if (activeLayer === "OSM context") return hotspot.radiusM * 0.82;
  return hotspot.radiusM;
}

interface MapViewProps {
  className?: string;
  initialCenter?: google.maps.LatLngLiteral;
  initialZoom?: number;
  onMapReady?: (map: google.maps.Map) => void;
  fallbackHotspots?: FallbackMapHotspot[];
  activeLayer?: string;
  onFirstHotspotClick?: () => void;
  wind?: MapWind;
}

function hotspotIcon(color: string, variant: "thermal" | "factory" = "thermal", size = 30, opacity = 0.82) {
  if (variant === "factory") {
    return L.divIcon({
      className: "fireguard-factory-marker",
      html: `<span style="--marker-color:${color};--marker-opacity:${opacity}" aria-label="Confirmed nearby OSM industrial facility"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M4 27V14l7 4v-8l7 4V7l10 6v14H4Z" fill="var(--marker-color)" fill-opacity=".92" stroke="#f2eee6" stroke-width="1.7"/><path d="M8 27v-6h4v6m5 0v-6h4v6m5 0v-6h3v6" fill="none" stroke="#f2eee6" stroke-width="1.5"/></svg></span>`,
      iconSize: [34, 34],
      iconAnchor: [17, 17],
    });
  }
  return L.divIcon({
    className: "fireguard-leaflet-marker",
    html: `<span style="--marker-color:${color};--marker-size:${size}px;--marker-opacity:${opacity}"><i></i></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function thermalScale(hotspot: FallbackMapHotspot, allHotspots: FallbackMapHotspot[]) {
  const values = allHotspots.map(item => item.frpMw).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (typeof hotspot.frpMw !== "number" || values.length < 2) return { size: 30, opacity: 0.82 };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const ratio = max === min ? 0.5 : (hotspot.frpMw - min) / (max - min);
  return { size: 28 + Math.round(ratio * 18), opacity: 0.58 + ratio * 0.36 };
}

function persistenceRings(hotspot: FallbackMapHotspot) {
  const months = typeof hotspot.activeMonths === "number" && Number.isFinite(hotspot.activeMonths) ? Math.max(0, hotspot.activeMonths) : 0;
  return Math.min(4, months);
}

function satellitePreviewUrl(location: { lat: number; lng: number }) {
  const delta = 0.025;
  const bbox = [location.lng - delta, location.lat - delta, location.lng + delta, location.lat + delta].join(",");
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=${encodeURIComponent(bbox)}&bboxSR=4326&size=260,132&imageSR=4326&format=jpg&f=image`;
}

function HotspotHoverPreview({ hotspot }: { hotspot: FallbackMapHotspot }) {
  return <div className="fireguard-hotspot-hover-preview">
    <img src={satellitePreviewUrl(hotspot.location)} alt="Satellite preview around the current FIRMS location" loading="lazy" />
    <strong>{hotspot.title.replace(" — click to verify", "")}</strong>
    <span>Hover preview · public Esri World Imagery</span>
    <code>{hotspot.location.lat.toFixed(4)}°N · {hotspot.location.lng.toFixed(4)}°E</code>
  </div>;
}

function HotspotProviderPopup({ hotspot, activeLayer }: { hotspot: FallbackMapHotspot; activeLayer: string }) {
  const overlayLabel = activeLayer === "Thermal" ? "Thermal intensity · FRP when verified" : activeLayer === "OSM context" ? "OSM context · facility matches" : activeLayer === "Persistence" ? "Persistence · active months" : activeLayer;
  return <div className="fireguard-hotspot-popup">
    <span className="fireguard-popup-kicker">LIVE EVIDENCE · NASA FIRMS</span>
    <strong>{hotspot.title.replace(" — click to verify", "")}</strong>
    <code>{hotspot.location.lat.toFixed(4)}°N · {hotspot.location.lng.toFixed(4)}°E</code>
    <div className="fireguard-provider-grid" aria-label="Evidence provider summary">
      <span><b>PROVIDER</b>NASA FIRMS</span>
      <span><b>VIEW</b>{overlayLabel}</span>
      <span><b>RADIUS</b>{Math.round(hotspot.radiusM / 1000)} km</span>
      <span><b>STATUS</b>Awaiting verification</span>
    </div>
    <small>Satellite detection context is independent of the final FireGuard conclusion.</small>
    <button type="button" onClick={hotspot.onClick}>Run source verification</button>
  </div>;
}

function LeafletFallback({ center, zoom, hotspots, className, activeLayer, radarActive }: { center: google.maps.LatLngLiteral; zoom: number; hotspots: FallbackMapHotspot[]; className?: string; activeLayer: string; radarActive: boolean }) {
  return (
    <LeafletMapContainer key={activeLayer} center={[center.lat, center.lng]} zoom={zoom} className={cn("h-full w-full", className)} scrollWheelZoom zoomControl><div className={cn("map-radar-sweep", radarActive && "map-radar-sweep-active")} aria-hidden="true" />
      <LayersControl position="topright" collapsed={false}>
        <LayersControl.BaseLayer checked={activeLayer !== "Persistence"} name="Map">
          <LeafletTileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer checked={false} name="Satellite">
          <LeafletTileLayer attribution='Tiles &copy; Esri' url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer checked={activeLayer === "Persistence"} name="Terrain">
          <LeafletTileLayer attribution='Map data &copy; OpenStreetMap contributors' url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png" />
        </LayersControl.BaseLayer>
      </LayersControl>

      {hotspots.map(hotspot => {
        const color = layerColor(hotspot, activeLayer, hotspots);
        const scale = activeLayer === "Thermal" ? thermalScale(hotspot, hotspots) : { size: 30, opacity: 0.82 };
        const rings = activeLayer === "Persistence" ? persistenceRings(hotspot) : 0;
        const iconVariant = activeLayer === "OSM context" && hotspot.namedFacilityMatch ? "factory" : "thermal";
        return <Fragment key={hotspot.id}>
          <LeafletCircle
            center={[hotspot.location.lat, hotspot.location.lng]}
            radius={layerRadius(hotspot, activeLayer)}
            pathOptions={{ color, weight: activeLayer === "Thermal" ? 1 : 1.5, opacity: scale.opacity, fillColor: color, fillOpacity: activeLayer === "Thermal" ? 0.08 : 0.13 }}
            eventHandlers={{ click: () => { hotspot.onSelect?.(); } }}
          >
            <LeafletPopup closeButton>
              <HotspotProviderPopup hotspot={hotspot} activeLayer={activeLayer} />
            </LeafletPopup>
          </LeafletCircle>
          {Array.from({ length: rings }, (_, index) => <LeafletCircle key={`${hotspot.id}-ring-${index}`} center={[hotspot.location.lat, hotspot.location.lng]} radius={layerRadius(hotspot, activeLayer) + (index + 1) * 2_500} pathOptions={{ color: "#786aa8", weight: 1.2, opacity: 0.7 - index * 0.12, fillOpacity: 0, dashArray: "4 7" }} />)}
          <LeafletMarker position={[hotspot.location.lat, hotspot.location.lng]} icon={hotspotIcon(color, iconVariant, scale.size, scale.opacity)} eventHandlers={{ click: () => { hotspot.onSelect?.(); } }}>
            <LeafletTooltip direction="top" offset={[0, -12]} opacity={1} interactive>
              <HotspotHoverPreview hotspot={hotspot} />
            </LeafletTooltip>
            <LeafletPopup closeButton>
              <HotspotProviderPopup hotspot={hotspot} activeLayer={activeLayer} />
            </LeafletPopup>
          </LeafletMarker>
        </Fragment>;
      })}
    </LeafletMapContainer>
  );
}

export function MapView({ className, initialCenter = { lat: 37.7749, lng: -122.4194 }, initialZoom = 12, onMapReady, fallbackHotspots = [], activeLayer = "Thermal", onFirstHotspotClick, wind }: MapViewProps) {
  const mapShell = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const initializing = useRef(false);
  const retryCount = useRef(0);
  const [useLeaflet, setUseLeaflet] = useState(false);
  const [radarActive, setRadarActive] = useState(true);

  const init = usePersistFn(async () => {
    if (map.current || initializing.current || useLeaflet) return;
    initializing.current = true;
    try {
      await loadMapScript();
      if (!mapContainer.current || !window.google?.maps) throw new Error("Map container or Google Maps API is unavailable.");
      map.current = new window.google.maps.Map(mapContainer.current, {
        zoom: initialZoom,
        center: initialCenter,
        mapTypeControl: true,
        fullscreenControl: false,
        zoomControl: true,
        streetViewControl: false,
        mapId: "DEMO_MAP_ID",
      });
      retryCount.current = 0;
      onMapReady?.(map.current);
    } catch (error) {
      initializing.current = false;
      if (retryCount.current < 2) {
        retryCount.current += 1;
        window.setTimeout(() => void init(), 900 * retryCount.current);
        return;
      }
      console.warn("Google Maps proxy unavailable; using the Vercel-safe OpenStreetMap fallback.", error);
      setUseLeaflet(true);
      return;
    }
    initializing.current = false;
  });

  useEffect(() => {
    const shell = mapShell.current;
    if (!shell || typeof IntersectionObserver === "undefined") {
      setRadarActive(true);
      const timeout = window.setTimeout(() => setRadarActive(false), 3600);
      return () => window.clearTimeout(timeout);
    }
    let timeout: number | undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting || entry.intersectionRatio < 0.2) return;
      setRadarActive(true);
      if (timeout) window.clearTimeout(timeout);
      timeout = window.setTimeout(() => setRadarActive(false), 3600);
    }, { threshold: [0.2] });
    observer.observe(shell);
    return () => {
      observer.disconnect();
      if (timeout) window.clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    init();
    const syncFullscreen = () => setIsFullscreen(document.fullscreenElement === mapShell.current);
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, [init]);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    void mapShell.current?.requestFullscreen().catch(() => undefined);
  };

  const shellClassName = cn("relative w-full h-[500px] map-shell", isFullscreen && "map-shell-fullscreen", className);
  const fullscreenButton = <button type="button" className="map-fullscreen-button" onClick={toggleFullscreen} aria-label={isFullscreen ? "Exit full screen map" : "View map full screen"}>{isFullscreen ? "Exit full screen" : "Full screen map"}</button>;
  const windAngle = wind?.windDirectionDeg == null ? 0 : (wind.windDirectionDeg + 180) % 360;
  const windField = <div className="wind-field" aria-hidden="true" style={{ transform: `rotate(${windAngle}deg)` }}>{Array.from({ length: 12 }, (_, index) => <i key={index} className="wind-stream" style={{ top: `${8 + (index % 6) * 16}%`, left: `${-18 + Math.floor(index / 6) * 50}%`, animationDelay: `${index * -0.45}s` }} />)}</div>;
  const windOverlay = <>{windField}<div className="wind-overlay" aria-label={wind?.windSpeedKmh == null ? "Live wind unavailable" : `Live wind ${wind.windSpeedKmh.toFixed(1)} kilometers per hour toward ${(windAngle).toFixed(0)} degrees`}><span className="wind-overlay-kicker">LIVE WIND / SPREAD VECTOR</span><strong>{wind?.windSpeedKmh == null ? "—" : `${wind.windSpeedKmh.toFixed(1)} km/h`}</strong><span className="wind-arrow" style={{ transform: `rotate(${windAngle}deg)` }}>↑</span><small>{wind?.windDirectionDeg == null ? "Awaiting Open-Meteo" : `toward ${windAngle.toFixed(0)}° · ${wind.state}`}</small></div></>;

  if (useLeaflet) {
    return <div ref={mapShell} className={cn(shellClassName, "overflow-hidden")}><LeafletFallback center={initialCenter} zoom={initialZoom} hotspots={fallbackHotspots.map(hotspot => ({ ...hotspot, onSelect: () => { onFirstHotspotClick?.(); hotspot.onSelect?.(); } }))} activeLayer={activeLayer} radarActive={radarActive} />{windOverlay}{fullscreenButton}</div>;
  }

  return <div ref={mapShell} className={shellClassName}><div ref={mapContainer} className="relative w-full h-full"><div className={cn("map-radar-sweep", radarActive && "map-radar-sweep-active")} aria-hidden="true" /><div className="map-loading-label">Loading base map…</div></div>{windOverlay}{fullscreenButton}</div>;
}
