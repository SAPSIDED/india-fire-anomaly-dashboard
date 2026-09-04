/// <reference types="@types/google.maps" />

import { Fragment, useEffect, useRef, useState } from "react";
import { Circle as LeafletCircle, MapContainer as LeafletMapContainer, Marker as LeafletMarker, TileLayer as LeafletTileLayer, Tooltip as LeafletTooltip } from "react-leaflet";
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
const MAPS_PROXY_URL = `${FORGE_BASE_URL}/v1/maps/proxy`;

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
  onClick: () => void;
};

interface MapViewProps {
  className?: string;
  initialCenter?: google.maps.LatLngLiteral;
  initialZoom?: number;
  onMapReady?: (map: google.maps.Map) => void;
  fallbackHotspots?: FallbackMapHotspot[];
}

function hotspotIcon(color: string) {
  return L.divIcon({
    className: "fireguard-leaflet-marker",
    html: `<span style="--marker-color:${color}"><i></i></span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

function LeafletFallback({ center, zoom, hotspots, className }: { center: google.maps.LatLngLiteral; zoom: number; hotspots: FallbackMapHotspot[]; className?: string }) {
  return (
    <LeafletMapContainer center={[center.lat, center.lng]} zoom={zoom} className={cn("h-full w-full", className)} scrollWheelZoom zoomControl>
      <LeafletTileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {hotspots.map(hotspot => (
        <Fragment key={hotspot.id}>
          <LeafletCircle
            center={[hotspot.location.lat, hotspot.location.lng]}
            radius={hotspot.radiusM}
            pathOptions={{ color: hotspot.color, weight: 1, opacity: 0.72, fillColor: hotspot.color, fillOpacity: 0.08 }}
            eventHandlers={{ click: hotspot.onClick }}
          />
          <LeafletMarker position={[hotspot.location.lat, hotspot.location.lng]} icon={hotspotIcon(hotspot.color)} eventHandlers={{ click: hotspot.onClick }}>
            <LeafletTooltip direction="top" offset={[0, -12]}>{hotspot.title}</LeafletTooltip>
          </LeafletMarker>
        </Fragment>
      ))}
    </LeafletMapContainer>
  );
}

export function MapView({ className, initialCenter = { lat: 37.7749, lng: -122.4194 }, initialZoom = 12, onMapReady, fallbackHotspots = [] }: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const initializing = useRef(false);
  const retryCount = useRef(0);
  const [useLeaflet, setUseLeaflet] = useState(false);

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
        fullscreenControl: true,
        zoomControl: true,
        streetViewControl: true,
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
    init();
  }, [init]);

  if (useLeaflet) {
    return <div className={cn("relative w-full h-[500px] overflow-hidden", className)}><LeafletFallback center={initialCenter} zoom={initialZoom} hotspots={fallbackHotspots} /><div className="map-provider-badge">OpenStreetMap fallback · live FireGuard markers</div></div>;
  }

  return <div ref={mapContainer} className={cn("relative w-full h-[500px]", className)}><div className="map-loading-label">Loading base map…</div></div>;
}
