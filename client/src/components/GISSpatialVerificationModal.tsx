import React from "react";
import { Building2, CircleDashed, Flame, Globe2, History, LoaderCircle, X, Zap } from "lucide-react";
import type { VerificationRailResult, VerificationRailTarget } from "./HotspotVerificationRail";
import "./GISSpatialVerificationModal.css";

type Props = {
  selected: VerificationRailTarget;
  state: "ready" | "loading" | "complete" | "error";
  result?: VerificationRailResult;
  onClose: () => void;
};

const formatClass = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase());
const formatDistance = (metres: number) => metres >= 1000 ? `${(metres / 1000).toFixed(2)} km away` : `${Math.round(metres)} m away`;
const formatRadius = (selected: VerificationRailTarget) => `${selected.score > 70 ? 9 : 6} km spatial analysis radius`;

function EvidenceCard({ icon, label, children, status = "available" }: { icon: React.ReactNode; label: string; children: React.ReactNode; status?: "available" | "missing" | "loading" }) {
  return <article className={`gis-evidence-card ${status}`}>
    <div className="gis-evidence-heading"><span className="gis-evidence-icon" aria-hidden="true">{icon}</span><b>{label}</b><small>{status === "loading" ? "CHECKING" : status === "missing" ? "NOT FOUND" : "SOURCE DATA"}</small></div>
    <div className="gis-evidence-body">{children}</div>
  </article>;
}

export function GISSpatialVerificationModal({ selected, state, result, onClose }: Props) {
  const loading = state === "loading" || state === "ready";
  const error = state === "error";
  const osm = result?.industrial;
  const hasOsm = Boolean(osm?.industrialFacilityName || osm?.industrialFacilityType);
  const hasGppd = Boolean(result?.gppdReference);
  const radius = formatRadius(selected);

  return <div className="gis-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="gis-modal-title" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="gis-modal" onMouseDown={event => event.stopPropagation()}>
      <button type="button" className="gis-modal-close" onClick={onClose} aria-label="Close GIS spatial verification"><X size={19} /></button>
      <header className="gis-modal-header">
        <span className="eyebrow">SPATIAL EVIDENCE / LIVE TARGET</span>
        <h2 id="gis-modal-title">GIS Spatial Verification</h2>
        <p><b>Hotspot #{selected.id.replace(/^FIRMS-/, "")}</b><span>{selected.coords}</span></p>
      </header>
      <div className="gis-modal-caption"><span>SPATIAL CONTEXT</span><small>What is geographically around this thermal anomaly.</small></div>
      {loading && <div className="gis-modal-loading" role="status"><LoaderCircle size={17} /><span>Retrieving source-backed spatial evidence for this exact hotspot…</span></div>}
      {error && <div className="gis-modal-error" role="alert">The existing source verification request did not complete. No unavailable evidence has been replaced with an estimate.</div>}
      <div className="gis-evidence-grid">
        <EvidenceCard icon={<Flame size={16} />} label="FIRMS DETECTION" status={loading ? "loading" : "available"}>
          <strong>Thermal anomaly detected</strong>
          <span>FRP: {result?.firmsCurrent.frpMw != null ? `${result.firmsCurrent.frpMw.toFixed(2)} MW` : "Unavailable"}</span>
          <small>Detection time: {selected.recency.replace("Observed ", "")}</small>
        </EvidenceCard>
        <EvidenceCard icon={<Building2 size={16} />} label="OSM FACILITY" status={loading ? "loading" : hasOsm ? "available" : "missing"}>
          {loading ? <span>Checking nearby OpenStreetMap infrastructure…</span> : hasOsm ? <><strong>{osm?.industrialFacilityName ?? "Unnamed OSM facility"}</strong><span>{osm?.industrialFacilityCategory ? formatClass(osm.industrialFacilityCategory) : osm?.industrialFacilityType ?? "Industrial context"}</span><small>{osm?.industrialFacilityDistanceM != null ? formatDistance(osm.industrialFacilityDistanceM) : "Distance unavailable"}</small></> : <span>No relevant OSM facility found within the analysis radius.</span>}
        </EvidenceCard>
        <EvidenceCard icon={<Zap size={16} />} label="GPPD FACILITY" status={loading ? "loading" : hasGppd ? "available" : "missing"}>
          {loading ? <span>Checking the power-plant reference dataset…</span> : hasGppd ? <><strong>{result?.gppdReference?.name}</strong><span>{result?.gppdReference?.fuelType ?? "Fuel type not listed"}{result?.gppdReference?.capacityMw != null ? ` · ${result.gppdReference.capacityMw.toLocaleString()} MW` : ""}</span><small>{result?.gppdReference?.distanceKm.toFixed(2)} km away</small></> : <span>No relevant GPPD facility found within the analysis radius.</span>}
        </EvidenceCard>
        <EvidenceCard icon={<Globe2 size={16} />} label="LAND COVER" status={loading ? "loading" : result?.landCover ? "available" : "missing"}>
          {loading ? <span>Resolving land-cover context…</span> : result?.landCover ? <><strong>{formatClass(result.landCover.landCoverClass)}</strong><small>{result.landCover.source}</small></> : <span>No land-cover data available for this result.</span>}
        </EvidenceCard>
        <EvidenceCard icon={<History size={16} />} label="HISTORICAL ACTIVITY" status={loading ? "loading" : result?.firmsHistory ? "available" : "missing"}>
          {loading ? <span>Checking seven-day and long-term persistence…</span> : result?.firmsHistory ? <><strong>{result.longTermHistory ? `${result.longTermHistory.totalDetectionCount} stored detections` : "Previous detection history"}</strong><span>{result.firmsHistory.detail}</span><small>{result.longTermHistory ? `${result.longTermHistory.activeMonths} active month${result.longTermHistory.activeMonths === 1 ? "" : "s"}` : "Long-term history unavailable"}</small></> : <span>No historical data available.</span>}
        </EvidenceCard>
        <EvidenceCard icon={<CircleDashed size={16} />} label="INVESTIGATION ZONE" status="available">
          <strong>{radius}</strong><span>Existing map screening radius for this target.</span><small>Centered on {selected.coords}</small>
        </EvidenceCard>
      </div>
      <footer className="gis-modal-footer">Spatial evidence combines hotspot location, nearby infrastructure, land cover, historical activity, and the existing investigation zone. It supports review; it does not by itself prove an incident.</footer>
    </section>
  </div>;
}

export default GISSpatialVerificationModal;
