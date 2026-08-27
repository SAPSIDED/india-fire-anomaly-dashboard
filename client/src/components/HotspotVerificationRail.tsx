import React from "react";
import { ChevronRight, MapPin } from "lucide-react";
import type { HotspotVerificationState } from "@/lib/hotspotVerification";
import "./HotspotVerificationRail.css";

export type VerificationRailTarget = {
  id: string;
  facility: string;
  place: string;
  coords: string;
  frp: string;
  confidence: string;
  recency: string;
  score: number;
};

type SourceEvidence = { state: "available" | "cached" | "unavailable"; detail: string };

export type VerificationRailResult = {
  firmsCurrent: SourceEvidence;
  industrial: SourceEvidence;
  firmsHistory: SourceEvidence;
  landCover?: { landCoverClass: string; source: string };
  longTermHistory?: { totalDetectionCount: number; activeMonths: number };
  classification: { classification: string; confidence: string; reason: string };
};

type Props = {
  selected: VerificationRailTarget;
  state: HotspotVerificationState;
  result?: VerificationRailResult;
  onVerify: () => void;
};

const formatClassification = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase());

export function HotspotVerificationRail({ selected, state, result, onVerify }: Props) {
  const loading = state === "loading";
  const failed = state === "error";
  const complete = state === "complete" && result;
  const persistence = result?.longTermHistory
    ? `${result.longTermHistory.totalDetectionCount} stored detection${result.longTermHistory.totalDetectionCount === 1 ? "" : "s"}; ${result.longTermHistory.activeMonths} active month${result.longTermHistory.activeMonths === 1 ? "" : "s"}.`
    : "Long-term database history is unavailable for this result.";

  return (
    <aside className="analysis-rail" aria-label="Selected anomaly analysis" aria-live="polite" aria-busy={loading}>
      <div className="rail-topline"><span>SELECTED TARGET</span><b className={selected.score > 70 ? "critical" : "elevated"}>{selected.score}/100</b></div>
      <h3>{selected.facility}</h3>
      <p className="target-location"><MapPin size={13} /> {selected.place}</p>
      <div className="target-code"><span>{selected.id}</span><span>{selected.coords}</span></div>
      <dl className="instrument-grid"><div><dt>FRP</dt><dd>{selected.frp}</dd></div><div><dt>CONFIDENCE</dt><dd>{selected.confidence}</dd></div><div><dt>RECENCY</dt><dd>{selected.recency.replace("Observed ", "")}</dd></div></dl>
      {loading && <div className="verification-live-status" role="status">
        <i aria-hidden="true" />
        <div><b>Live source verification in progress</b><span>Checking FIRMS, OSM context, history, and land cover for this exact coordinate. No classification is issued until the existing request returns.</span></div>
      </div>}
      <div className={`screening-ladder ${loading ? "is-loading" : complete ? "is-complete" : failed ? "is-error" : ""}`}>
        <p>INVESTIGATION PATH <small>{loading ? "LIVE CHECK IN PROGRESS" : complete ? "LIVE RESULTS" : failed ? "RETRY AVAILABLE" : "READY"}</small></p>
        <div><b>01</b><span>Thermal observation<small>{loading ? "Checking current NOAA-20 evidence…" : failed ? "The current FIRMS check did not complete. The selected marker is retained for retry." : complete ? result.firmsCurrent.detail : "Select this hotspot to query current FIRMS evidence."}</small></span></div>
        <div><b>02</b><span>Geographic context<small>{loading ? "Checking nearby industrial OSM context…" : failed ? "Industrial-context results were not issued because this verification did not complete." : complete ? result.industrial.detail : "Industrial proximity not yet queried."}</small></span></div>
        <div><b>03</b><span>Historical behaviour<small>{loading ? "Checking seven-day and database persistence…" : failed ? "No new seven-day or long-term history result is shown after a failed verification." : complete ? `${result.firmsHistory.detail} ${persistence}` : "Seven-day and long-term history not yet queried."}</small></span></div>
        <div><b>04</b><span>Independent evidence<small>{loading ? "Checking land-cover and independent satellite context…" : failed ? "Independent evidence was not completed. No classification is issued from this failed request." : complete ? result.landCover ? `${result.landCover.landCoverClass.replaceAll("_", " ")} · ${result.landCover.source}.` : "Land-cover evidence is unavailable; no substitute is shown." : "Land-cover context not yet queried."}</small></span></div>
      </div>
      <div className={`screening-callout ${complete ? "has-classification" : ""} ${failed ? "has-error" : ""}`}>
        <span>{complete ? "RULE-BASED CLASSIFICATION" : failed ? "VERIFICATION UNAVAILABLE" : "SCREENING STATUS"}</span>
        <strong>{loading ? "Verifying selected hotspot…" : failed ? "Check did not complete" : complete ? formatClassification(result.classification.classification) : selected.score > 0 ? "Requires source verification" : "Awaiting selection"}</strong>
        <p>{loading ? "The existing corroboration pipeline is querying source evidence for this exact coordinate. No classification is issued until it returns." : failed ? "The selection is retained and no industrial-fire conclusion was issued. Retry the same existing per-coordinate check when the temporary source or network issue clears." : complete ? <><b>{result.classification.confidence.toUpperCase()} CONFIDENCE.</b> {result.classification.reason}</> : "A thermal candidate is not a confirmed industrial fire. Select Run source verification to load source-backed results."}</p>
        <button onClick={onVerify} disabled={loading}>{loading ? "Verification running…" : failed ? "Retry source verification" : complete ? "Review full evidence" : "Run source verification"} <ChevronRight size={15} /></button>
      </div>
    </aside>
  );
}
