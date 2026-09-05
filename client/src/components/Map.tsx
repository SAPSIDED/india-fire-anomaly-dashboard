/// <reference types="@types/google.maps" />

import { Fragment, useEffect, useRef, useState } from "react";
import { Circle as LeafletCircle, LayersControl, MapContainer as LeafletMapContainer, Marker as LeafletMarker, Popup as LeafletPopup, TileLayer as LeafletTileLayer, Tooltip as LeafletTooltip } from "react-leaflet";
import L, { type LatLngLiteral } from "leaflet";
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
  onClick: () => void;
};

interface MapViewProps {
  className?: string;
  initialCenter?: google.maps.LatLngLiteral;
  initialZoom?: number;
  onMapReady?: (map: google.maps.Map) => void;
  fallbackHotspots?: FallbackMapHotspot[];
  activeLayer?: string;
}

function hotspotIcon(color: string) {
  return L.divIcon({
    className: "fireguard-leaflet-marker",
    html: `<span style="--marker-color:${color}"><i></i></span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

function explorerIcon() {
  return L.divIcon({
    className: "fireguard-explorer-marker",
    html: '<span class="fireguard-explorer-puppet" aria-hidden="true"><i class="fireguard-explorer-head"></i><i class="fireguard-explorer-body"></i><i class="fireguard-explorer-arm fireguard-explorer-arm-left"></i><i class="fireguard-explorer-arm fireguard-explorer-arm-right"></i></span>',
    iconSize: [42, 52],
    iconAnchor: [21, 48],
    popupAnchor: [0, -43],
  });
}

function HotspotProviderPopup({ hotspot, activeLayer }: { hotspot: FallbackMapHotspot; activeLayer: string }) {
  const overlayLabel = activeLayer === "Thermal" ? "Thermal signal" : activeLayer === "OSM context" ? "OSM context" : activeLayer === "Persistence" ? "Persistence" : activeLayer === "Exposure" ? "Exposure" : activeLayer;
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

function LeafletFallback({ center, zoom, hotspots, className, activeLayer }: { center: google.maps.LatLngLiteral; zoom: number; hotspots: FallbackMapHotspot[]; className?: string; activeLayer: string }) {
  const [explorerPosition, setExplorerPosition] = useState<LatLngLiteral>(center);
  const [explorerOpen, setExplorerOpen] = useState(true);
  const nearestHotspot = hotspots.reduce<{ hotspot: FallbackMapHotspot; distance: number } | null>((nearest, hotspot) => {
    const distance = Math.hypot((hotspot.location.lat - explorerPosition.lat) * 111, (hotspot.location.lng - explorerPosition.lng) * 102);
    return !nearest || distance < nearest.distance ? { hotspot, distance } : nearest;
  }, null);

  return (
    <LeafletMapContainer key={activeLayer} center={[center.lat, center.lng]} zoom={zoom} className={cn("h-full w-full", className)} scrollWheelZoom zoomControl>
      <LayersControl position="topright" collapsed={false}>
        <LayersControl.BaseLayer checked={activeLayer !== "Exposure" && activeLayer !== "Persistence"} name="Map">
          <LeafletTileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer checked={activeLayer === "Exposure"} name="Satellite">
          <LeafletTileLayer attribution='Tiles &copy; Esri' url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer checked={activeLayer === "Persistence"} name="Terrain">
          <LeafletTileLayer attribution='Map data &copy; OpenStreetMap contributors' url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png" />
        </LayersControl.BaseLayer>
      </LayersControl>

      <LeafletMarker
        position={[explorerPosition.lat, explorerPosition.lng]}
        icon={explorerIcon()}
        draggable
        eventHandlers={{
          click: () => setExplorerOpen(true),
          dragend: event => {
            const position = event.target.getLatLng();
            setExplorerPosition({ lat: position.lat, lng: position.lng });
            setExplorerOpen(true);
          },
        }}
      >
        {explorerOpen && <LeafletPopup closeButton autoPan>
          <div className="fireguard-explorer-popup">
            <strong>Explore this location</strong>
            <span>Drag the field guide to inspect a point.</span>
            <code>{explorerPosition.lat.toFixed(4)}°N · {explorerPosition.lng.toFixed(4)}°E</code>
            {nearestHotspot ? <>
              <small>{nearestHotspot.distance.toFixed(1)} km from the nearest live FIRMS marker.</small>
              <button type="button" onClick={nearestHotspot.hotspot.onClick}>Open hotspot verification</button>
            </> : <small>Move the guide over a live marker to open its source popup.</small>}
          </div>
        </LeafletPopup>}
      </LeafletMarker>

      {hotspots.map(hotspot => (
        <Fragment key={hotspot.id}>
          <LeafletCircle
            center={[hotspot.location.lat, hotspot.location.lng]}
            radius={hotspot.radiusM}
            pathOptions={{ color: hotspot.color, weight: 1, opacity: 0.72, fillColor: hotspot.color, fillOpacity: 0.08 }}
            eventHandlers={{ click: hotspot.onClick }}
          >
            <LeafletPopup closeButton>
              <HotspotProviderPopup hotspot={hotspot} activeLayer={activeLayer} />
            </LeafletPopup>
          </LeafletCircle>
          <LeafletMarker position={[hotspot.location.lat, hotspot.location.lng]} icon={hotspotIcon(hotspot.color)} eventHandlers={{ click: () => undefined }}>
            <LeafletTooltip direction="top" offset={[0, -12]}>{hotspot.title}</LeafletTooltip>
            <LeafletPopup closeButton>
              <HotspotProviderPopup hotspot={hotspot} activeLayer={activeLayer} />
            </LeafletPopup>
          </LeafletMarker>
        </Fragment>
      ))}
    </LeafletMapContainer>
  );
}

export function MapView({ className, initialCenter = { lat: 37.7749, lng: -122.4194 }, initialZoom = 12, onMapReady, fallbackHotspots = [], activeLayer = "Thermal" }: MapViewProps) {
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
    return <div className={cn("relative w-full h-[500px] overflow-hidden", className)}><LeafletFallback center={initialCenter} zoom={initialZoom} hotspots={fallbackHotspots} activeLayer={activeLayer} /><div className="map-provider-badge">OpenStreetMap fallback · live FireGuard markers · drag the explorer</div></div>;
  }

  return <div ref={mapContainer} className={cn("relative w-full h-[500px]", className)}><div className="map-loading-label">Loading base map…</div></div>;
}
