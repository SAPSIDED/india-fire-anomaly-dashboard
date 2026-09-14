import React, { useEffect, useState } from "react";
import { AlertTriangle, Factory, Wind } from "lucide-react";

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

function ClimateClock({ timezone }: { timezone: string | null }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 1000); return () => window.clearInterval(timer); }, []);
  return <div className="climate-clock" aria-label="Live climate clock"><span>CLIMATE CLOCK</span><strong>{now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: timezone || undefined })}</strong><small>{timezone || "India / local station time"}</small></div>;
}

export function LiveClimateDashboard({ weather, alerts, loading }: { weather?: ClimateReading; alerts: PersistenceAlert[]; loading?: boolean }) {
  const spreadDirection = weather?.windDirectionDeg === null || weather?.windDirectionDeg === undefined ? null : (weather.windDirectionDeg + 180) % 360;
  return <section className="live-climate-dashboard" aria-label="Live climate and persistence alerts">
    <div className="climate-dashboard-head"><div><p className="eyebrow">LIVE CLIMATE / PERSISTENCE WATCH</p><h2>Conditions that move the risk.</h2><p>Wind is shown as the likely downwind spread vector; persistence alerts use stored NASA FIRMS detections and nearby reference facilities.</p></div><ClimateClock timezone={weather?.timezone ?? null} /></div>
    <div className="climate-metrics" aria-live="polite">
      <div className="climate-metric"><Wind size={17} /><span>WIND</span><strong>{weather?.windSpeedKmh == null ? "—" : `${weather.windSpeedKmh.toFixed(1)} km/h`}</strong><small>{weather?.windDirectionDeg == null ? "Direction unavailable" : `${direction(weather.windDirectionDeg)} · from ${weather.windDirectionDeg.toFixed(0)}°`}</small></div>
      <div className="climate-metric wind-vector"><span>SPREAD VECTOR</span><strong style={{ transform: `rotate(${spreadDirection ?? 0}deg)` }}>↑</strong><small>{spreadDirection == null ? "Awaiting live wind" : `${direction(spreadDirection)} · toward ${spreadDirection.toFixed(0)}°`}</small></div>
      <div className="climate-metric"><span>TEMPERATURE</span><strong>{weather?.temperatureC == null ? "—" : `${weather.temperatureC.toFixed(1)}°C`}</strong><small>{weather?.state === "cached" ? "Cached within 5 min" : weather?.state === "available" ? "Live Open-Meteo" : "Awaiting reading"}</small></div>
    </div>
    <div className="persistence-alerts"><div className="alerts-heading"><span><AlertTriangle size={15} /> PERSISTING THERMAL REGIONS</span><small>{loading ? "Refreshing…" : `${alerts.length} active alert${alerts.length === 1 ? "" : "s"}`}</small></div>
      {alerts.length === 0 ? <div className="alerts-empty">No current region meets the persistence alert threshold. New FIRMS observations will appear here after the next snapshot refresh.</div> : <div className="alert-list">{alerts.slice(0, 8).map(alert => <article className="persistence-alert" key={alert.hotspotId}><div><b>FIRMS-{alert.hotspotId}</b><span>{alert.latitude.toFixed(3)}°N · {alert.longitude.toFixed(3)}°E</span></div><strong>{alert.persistenceDetections} detections · {alert.activeMonths} active month{alert.activeMonths === 1 ? "" : "s"}</strong>{alert.facility ? <p><Factory size={14} /> <b>{alert.facility.name}</b> · {alert.facility.distanceKm.toFixed(1)} km · {alert.facility.fuelType || "industrial reference"}</p> : <p>Persistent thermal activity · facility reference unavailable</p>}</article>)}</div>}
    </div>
    <footer className="climate-source-note">Source: Open-Meteo current weather · NASA FIRMS snapshot/history · WRI GPPD reference. This is an operational alert screen, not a fire-spread forecast.</footer>
  </section>;
}
