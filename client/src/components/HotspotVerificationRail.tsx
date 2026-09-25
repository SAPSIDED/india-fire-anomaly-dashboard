import React, { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { HotspotVerificationState } from "@/lib/hotspotVerification";
import { MLPredictionPanel } from "@/components/MLPredictionPanel";
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

type SourceEvidence = {
  state: "available" | "cached" | "unavailable";
  detail: string;
  frpMw?: number | null;
};

export type VerificationRailResult = {
  firmsCurrent: SourceEvidence;
  industrial: SourceEvidence & {
    industrialFacilityName?: string | null;
    industrialFacilityType?: string | null;
    industrialFacilityCategory?: string | null;
    industrialFacilityDistanceM?: number | null;
    industrialFacilityOsmUrl?: string | null;
  };
  firmsHistory: SourceEvidence;
  landCover?: {
    landCoverClass: string;
    source: string;
  };
  longTermHistory?: {
    totalDetectionCount: number;
    activeMonths: number;
  };
  gppdReference?: {
    name: string;
    fuelType: string | null;
    capacityMw: number | null;
    distanceKm: number;
    source: string;
  };
  classification: {
    classification: string;
    confidence: string;
    reason: string;
  };
};

type MLPrediction = {
  classification:
    | "wildfire"
    | "industrial_facility"
    | "agricultural_burning"
    | "mining";
  wildfireProbability: number;
  industrialProbability: number;
  agriculturalProbability: number;
  miningProbability: number;
};

type Props = {
  selected: VerificationRailTarget;
  state: HotspotVerificationState;
  result?: VerificationRailResult;
  onVerify: () => void;
  lastMLPrediction?: MLPrediction | null;
  liveHotspotCount?: number;
};

const formatClassification = (value: string) =>
  value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const formatDistance = (metres: number) =>
  metres >= 1_000
    ? `${(metres / 1_000).toFixed(2)} km`
    : `${Math.round(metres)} m`;

const formatCapacity = (capacityMw: number | null) =>
  capacityMw === null
    ? "capacity not listed"
    : `${capacityMw.toLocaleString()} MW`;

export function HotspotVerificationRail({
  selected,
  state,
  result,
  onVerify,
  lastMLPrediction = null,
  liveHotspotCount = 0,
}: Props) {
  const loading = state === "loading";
  const failed = state === "error";
  const complete = state === "complete" && result;
  const [activeStep, setActiveStep] = useState<number | null>(null);

  useEffect(() => {
    if (!loading) {
      setActiveStep(null);
      return;
    }

    setActiveStep(0);
    const timer = window.setInterval(() => {
      setActiveStep((current) => current === null ? 0 : (current + 1) % 4);
    }, 1_350);

    return () => window.clearInterval(timer);
  }, [loading]);

  const persistence = result?.longTermHistory
    ? `${result.longTermHistory.totalDetectionCount} stored detection${
        result.longTermHistory.totalDetectionCount === 1 ? "" : "s"
      }; ${result.longTermHistory.activeMonths} active month${
        result.longTermHistory.activeMonths === 1 ? "" : "s"
      }.`
    : "Long-term database history is unavailable for this result.";

  return (
    <aside
      className="analysis-rail"
      aria-label="Selected anomaly analysis"
      aria-live="polite"
      aria-busy={loading}
    >
      <div className="rail-topline">
        <span>SELECTED ANOMALY INVESTIGATION</span>
      </div>

      <h3>{selected.facility}</h3>

      <div className="field-report-header">
        <dl className="instrument-support">
          <div>
            <dt>FRP (MW)</dt>
            <dd>
              {complete && typeof result.firmsCurrent.frpMw === "number" && Number.isFinite(result.firmsCurrent.frpMw)
                ? result.firmsCurrent.frpMw.toFixed(2)
                : "Unavailable"}
            </dd>
          </div>
          <div>
            <dt>RECENCY</dt>
            <dd>{selected.recency.replace("Observed ", "")}</dd>
          </div>
        </dl>
      </div>

      {loading && (
        <div className="verification-live-status" role="status">
          <span className="verification-evidence-convergence" aria-hidden="true">
            <i /><i /><i /><i /><b />
          </span>
          <i aria-hidden="true" />
          <div>
            <b>Live source verification in progress</b>
            <span>
              Checking FIRMS, OSM context, history, and land cover for this
              exact coordinate. No classification is issued until the existing
              request returns.
            </span>
          </div>
        </div>
      )}

      <div
        className={`screening-ladder ${
          loading
            ? "is-loading"
            : complete
              ? "is-complete"
              : failed
                ? "is-error"
                : ""
        }`}
      >
        <p>
          INVESTIGATION PATH
          <small>
            {loading
              ? "LIVE CHECK IN PROGRESS"
              : complete
                ? "LIVE RESULTS"
                : failed
                  ? "RETRY AVAILABLE"
                  : "READY"}
          </small>
        </p>

        <div className={`investigation-step ${activeStep === 0 ? "is-active" : ""}`} aria-current={activeStep === 0 ? "step" : undefined}>
          <b>01</b>
          <span>
            Thermal observation
            <small>
              {loading
                ? "Checking current NOAA-20 evidence…"
                : failed
                  ? "The current FIRMS check did not complete. The selected marker is retained for retry."
                  : complete
                    ? result.firmsCurrent.detail
                    : "Select this hotspot to query current FIRMS evidence."}
            </small>
          </span>
        </div>

        <div className={`investigation-step ${activeStep === 1 ? "is-active" : ""}`} aria-current={activeStep === 1 ? "step" : undefined}>
          <b>02</b>
          <span>
            Geographic context
            <small>
              {loading
                ? "Checking nearby industrial OSM context…"
                : failed
                  ? "Industrial-context results were not issued because this verification did not complete."
                  : complete
                    ? result.industrial.detail
                    : "Industrial proximity not yet queried."}
            </small>

            {complete &&
              (result.industrial.industrialFacilityType ||
                result.gppdReference) && (
                <span
                  className="facility-context"
                  aria-label="Nearest facility context"
                >
                  <span className="facility-context-label">
                    CONTEXT ONLY — NOT INCIDENT PROOF
                  </span>

                  {result.industrial.industrialFacilityType && (
                    <span className="facility-context-item">
                      <b>Nearest OSM feature</b>

                      <span>
                        {result.industrial.industrialFacilityName ??
                          "Unnamed OSM feature"}{" "}
                        · {result.industrial.industrialFacilityType}
                        {result.industrial.industrialFacilityCategory
                          ? ` · ${result.industrial.industrialFacilityCategory.replaceAll(
                              "_",
                              " ",
                            )}`
                          : ""}
                        {result.industrial.industrialFacilityDistanceM !==
                          null &&
                        result.industrial.industrialFacilityDistanceM !==
                          undefined
                          ? ` · ${formatDistance(
                              result.industrial.industrialFacilityDistanceM,
                            )}`
                          : ""}
                      </span>

                      {result.industrial.industrialFacilityOsmUrl && (
                        <a
                          href={result.industrial.industrialFacilityOsmUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open in OpenStreetMap ↗
                        </a>
                      )}
                    </span>
                  )}

                  {result.gppdReference && (
                    <span className="facility-context-item">
                      <b>Nearby power-plant reference</b>

                      <span>
                        {result.gppdReference.name} ·{" "}
                        {result.gppdReference.fuelType ?? "fuel not listed"} ·{" "}
                        {formatCapacity(result.gppdReference.capacityMw)} ·{" "}
                        {result.gppdReference.distanceKm.toFixed(2)} km
                      </span>

                      <small>{result.gppdReference.source}</small>
                    </span>
                  )}
                </span>
              )}
          </span>
        </div>

        <div className={`investigation-step ${activeStep === 2 ? "is-active" : ""}`} aria-current={activeStep === 2 ? "step" : undefined}>
          <b>03</b>
          <span>
            Historical behaviour
            <small>
              {loading
                ? "Checking seven-day and database persistence…"
                : failed
                  ? "No new seven-day or long-term history result is shown after a failed verification."
                  : complete
                    ? `${result.firmsHistory.detail} ${persistence}`
                    : "Seven-day and long-term history not yet queried."}
            </small>
          </span>
        </div>

        <div className={`investigation-step ${activeStep === 3 ? "is-active" : ""}`} aria-current={activeStep === 3 ? "step" : undefined}>
          <b>04</b>
          <span>
            Independent evidence
            <small>
              {loading
                ? "Checking land-cover and independent satellite context…"
                : failed
                  ? "Independent evidence was not completed. No classification is issued from this failed request."
                  : complete
                    ? result.landCover
                      ? (
                        <span className="land-cover-evidence">
                          <b>
                            Land cover: {formatClassification(result.landCover.landCoverClass)}
                          </b>
                          <small>
                            {result.landCover.landCoverClass.replaceAll("_", " ")} · {result.landCover.source}
                          </small>
                        </span>
                      )
                      : "Land-cover evidence is unavailable; no substitute is shown."
                    : "Land-cover context not yet queried."}
            </small>
          </span>
        </div>
      </div>

      <div className="verdict-cards">
        <div
          className={`screening-callout ${
            complete ? "has-classification" : ""
          } ${failed ? "has-error" : ""}`}
        >
          <span>
            {complete
              ? "RULE-BASED CLASSIFICATION"
              : failed
                ? "VERIFICATION UNAVAILABLE"
                : "SCREENING STATUS"}
          </span>

          <strong>
            {loading
              ? "Verifying selected hotspot…"
              : failed
                ? "Check did not complete"
                : complete
                  ? formatClassification(result.classification.classification)
                  : selected.score > 0
                    ? "Requires source verification"
                    : "Awaiting selection"}
          </strong>

          <p>
            {loading
              ? "The existing corroboration pipeline is querying source evidence for this exact coordinate. No classification is issued until it returns."
              : failed
                ? "The selection is retained and no industrial-fire conclusion was issued. Retry the same existing per-coordinate check when the temporary source or network issue clears."
                : complete
                  ? (
                    <>
                      <b>
                        {result.classification.confidence.toUpperCase()}{" "}
                        CONFIDENCE.
                      </b>{" "}
                      {result.classification.reason}
                    </>
                  )
                  : "A thermal candidate is not a confirmed industrial fire. Select Run source verification to load source-backed results."}
          </p>

          <button onClick={onVerify} disabled={loading}>
            {loading
              ? "Verification running…"
              : failed
                ? "Retry source verification"
                : complete
                  ? "Review full evidence"
                  : "Run source verification"}{" "}
            <ChevronRight size={15} />
          </button>
        </div>

        <MLPredictionPanel prediction={lastMLPrediction} />

        <section
          className={`gis-spatial-card ${complete ? "is-complete" : ""}`}
          aria-labelledby="gis-spatial-analysis-title"
        >
          <span className="gis-spatial-eyebrow">GIS-BASED SPATIAL ANALYSIS</span>
          <h4 id="gis-spatial-analysis-title">
            {loading
              ? "Spatial check in progress"
              : failed
                ? "Spatial context unavailable"
                : complete
                  ? "Geographic context correlated"
                  : "Spatial evidence layer"}
          </h4>
          <p>
            {loading
              ? "Correlating this coordinate with nearby infrastructure, land cover, and persistence."
              : failed
                ? "No spatial conclusion was issued because source verification did not complete."
                : complete
                  ? "GIS shows what surrounds the anomaly and how its location behaves over time."
                  : "See the geographic evidence gathered for this hotspot after verification."}
          </p>

          <dl className="gis-spatial-facts">
            <div>
              <dt>LOCATION</dt>
              <dd>{selected.coords}</dd>
            </div>
            <div>
              <dt>FACILITY CONTEXT</dt>
              <dd>
                {complete
                  ? result.industrial.industrialFacilityName
                    ? `${result.industrial.industrialFacilityName}${result.industrial.industrialFacilityDistanceM != null ? ` · ${formatDistance(result.industrial.industrialFacilityDistanceM)}` : ""}`
                    : result.gppdReference
                      ? `${result.gppdReference.name} · ${result.gppdReference.distanceKm.toFixed(2)} km`
                      : "No named facility in radius"
                  : "Awaiting spatial verification"}
              </dd>
            </div>
            <div>
              <dt>LAND COVER</dt>
              <dd>{complete ? result.landCover ? formatClassification(result.landCover.landCoverClass) : "Unavailable" : "Awaiting spatial verification"}</dd>
            </div>
            <div>
              <dt>PERSISTENCE</dt>
              <dd>{complete && result.longTermHistory ? `${result.longTermHistory.totalDetectionCount} detections · ${result.longTermHistory.activeMonths} active months` : "Awaiting history"}</dd>
            </div>
          </dl>

          <small className="gis-spatial-note">
            Geographic evidence supports interpretation; it is not incident proof by itself.
          </small>
        </section>
      </div>
    </aside>
  );
}
