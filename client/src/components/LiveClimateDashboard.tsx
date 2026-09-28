import React, { useEffect, useState } from "react";
import { Factory, Wind } from "lucide-react";
import { PreventiveMeasures } from "@/components/PreventiveMeasures";

export type ClimateReading = {
  state: "available" | "cached" | "unavailable";
  temperatureC: number | null;
  windSpeedKmh: number | null;
  windDirectionDeg: number | null;
  timezone: string | null;
  checkedAt: string;
};

export type PersistenceAlert = {
  hotspotId: number;
  latitude: number;
  longitude: number;
  acquiredDate: string | Date;
  acquiredTime: string | null;
  persistenceDetections: number;
  activeMonths: number;
  facility: { name: string; fuelType: string | null; capacityMw: number | null; distanceKm: number } | null;
};

function direction(degrees: number | null) {
  if (degrees === null || !Number.isFinite(degrees)) return "—";
  return ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"][Math.round(degrees / 22.5) % 16];
}

export function ClimateClock({ timezone }: { timezone: string | null }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 1000); return () => window.clearInterval(timer); }, []);
  return <div className="climate-clock" aria-label="Live climate clock"><span>CLIMATE CLOCK</span><strong>{now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: timezone || undefined })}</strong><small>{timezone || "India / local station time"}</small></div>;
}

type ClimateHotspot = { id: string; location: { lat: number; lng: number } };

function formatCoordinate(value: number, positive: string, negative: string) {
  return `${Math.abs(value).toFixed(3)}°${value < 0 ? negative : positive}`;
}

export function LiveClimateDashboard({ weather, selectedHotspot, weatherLoading, alerts, loading, onSelectAlert, classification }: { weather?: ClimateReading; selectedHotspot?: ClimateHotspot; weatherLoading?: boolean; alerts: PersistenceAlert[]; loading?: boolean; onSelectAlert?: (alert: PersistenceAlert) => void; classification?: string | null }) {
  const spreadDirection = weather?.windDirectionDeg === null || weather?.windDirectionDeg === undefined ? null : (weather.windDirectionDeg + 180) % 360;
  const weatherStatus = weather?.state === "available"
    ? "Open-Meteo · live response"
    : weather?.state === "cached"
      ? "Cached weather · within 5 min"
      : weather?.state === "unavailable"
        ? "Local weather unavailable"
        : weatherLoading
          ? "Loading local weather…"
          : selectedHotspot
            ? "Waiting for local weather"
            : "No location selected";
  return <>
    <section className="live-climate-dashboard" aria-labelledby="climate-dashboard-title">
    <div className="climate-dashboard-head"><div><p className="eyebrow">LIVE WIND CONDITIONS</p><h2 id="climate-dashboard-title">Conditions that move the risk.</h2><p>Select a hotspot to load its local Open-Meteo wind context. Weather is contextual only and does not change classification; the vector indicates a likely downwind direction from that hotspot.</p></div></div>
    <div className="climate-wind-animation" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /><i /></div>
    <div className="climate-metrics" aria-live="polite">
      <div className="climate-metric climate-hotspot-metric" role="group" aria-label="Selected hotspot details">
        <span>SELECTED HOTSPOT</span>
        {selectedHotspot ? <>
          <strong>{selectedHotspot.id}</strong>
          <small className="climate-hotspot-coordinates">{formatCoordinate(selectedHotspot.location.lat, "N", "S")} · {formatCoordinate(selectedHotspot.location.lng, "E", "W")}</small>
          <small className="climate-hotspot-status">{weatherStatus}</small>
        </> : <>
          <strong>No hotspot selected</strong>
          <small>Select a hotspot to see local wind conditions</small>
        </>}
      </div>
      <div className="climate-metric"><Wind size={17} /><span>WIND</span><strong>{weather?.windSpeedKmh == null ? "—" : `${weather.windSpeedKmh.toFixed(1)} km/h`}</strong><small>{weather?.windDirectionDeg == null ? "Direction unavailable" : `${direction(weather.windDirectionDeg)} · from ${weather.windDirectionDeg.toFixed(0)}°`}</small></div>
      <div className="climate-metric wind-vector"><span>SPREAD VECTOR</span><strong style={{ transform: `rotate(${spreadDirection ?? 0}deg)` }}>↑</strong><small>{spreadDirection == null ? "Awaiting live wind" : `Likely spread direction from this hotspot · ${direction(spreadDirection)} · toward ${spreadDirection.toFixed(0)}°`}</small></div>
    </div>
    </section>
    <PreventiveMeasures classification={classification} />
    <section className="persistence-section" aria-labelledby="persistence-title">
    <div className="alerts-heading"><h2 id="persistence-title"><span aria-hidden="true">⚠️</span> PERSISTING THERMAL REGIONS</h2><small>{loading ? "Refreshing…" : `${alerts.length} active alert${alerts.length === 1 ? "" : "s"}`}</small></div>
      {alerts.length === 0 ? <div className="alerts-empty">No current region meets the persistence alert threshold. New FIRMS observations will appear here after the next snapshot refresh.</div> : <div className="alert-list">{alerts.map(alert => <button type="button" className="persistence-alert" key={alert.hotspotId} onClick={() => onSelectAlert?.(alert)} aria-label={`Select FIRMS-${alert.hotspotId}, ${alert.persistenceDetections} detections across ${alert.activeMonths} active months`}><div><b>FIRMS-{alert.hotspotId}</b><span>{alert.latitude.toFixed(3)}°N · {alert.longitude.toFixed(3)}°E</span></div><strong>{alert.persistenceDetections} detections · {alert.activeMonths} active month{alert.activeMonths === 1 ? "" : "s"}</strong>{alert.facility ? <p><Factory size={14} /> <b>{alert.facility.name}</b> · {alert.facility.distanceKm.toFixed(1)} km · {alert.facility.fuelType || "industrial reference"}</p> : <p>Persistent thermal activity · facility reference unavailable</p>}</button>)}</div>}
    </section>
    <footer className="climate-source-note">Source: Open-Meteo current weather · NASA FIRMS snapshot/history · WRI GPPD reference. This is an operational alert screen, not a fire-spread forecast.</footer>
  </>;
}
