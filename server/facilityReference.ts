import { lookupNearestFirmsGasFlare, type GasFlareReferenceLookup } from "./flareReference";

const VNF_RADIUS_KM = 2;
const VNF_FACILITY_MATCH_KM = 1;

export type VnfCandidate = { latitude: number; longitude: number; observedAt?: string };
export type FacilitySignalInput = {
  lat: number;
  lng: number;
  industrialFacilityCategory?: "refinery" | "power_plant" | "steel" | "lng_terminal" | "mining" | "agricultural_zone" | null;
  industrialFacilityLatitude?: number | null;
  industrialFacilityLongitude?: number | null;
  industrialFacilityDistanceM?: number | null;
  gppdReference?: unknown;
  firmsCurrentState?: "available" | "cached" | "unavailable";
  firmsCurrentDetections?: number;
  firmsHistoryState?: "available" | "cached" | "unavailable";
  firmsHistoryDetections?: number;
};
export type FacilitySignals = {
  flareMatch: boolean;
  flareMatchConfidence: "high" | "none";
  miningMatch: boolean;
  vnfState: "available" | "cached" | "unavailable";
  vnfCandidateCount: number;
  flareReferenceState: "available" | "cached" | "unavailable";
  flareReferenceCandidateCount: number;
  flareReferenceDataYear: number | null;
  detail: string;
};

type FlareReferenceLookup = (lat: number, lng: number, radiusKm: number) => Promise<GasFlareReferenceLookup>;

function distanceKm(latA: number, lngA: number, latB: number, lngB: number) {
  const radians = (value: number) => value * Math.PI / 180;
  const dLat = radians(latB - latA);
  const dLng = radians(lngB - lngA);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(latA)) * Math.cos(radians(latB)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

let flareReferenceLookup: FlareReferenceLookup = lookupNearestFirmsGasFlare;

/**
 * Performs a bounded **local** reference lookup only. It never downloads VNF,
 * EOG, or the public workbook during a hotspot request. EOG VNF remains an
 * optional unconfigured adapter and does not affect this result.
 */
export async function assessFacilitySignals(input: FacilitySignalInput): Promise<FacilitySignals> {
  const miningMatch = input.industrialFacilityCategory === "mining" && (input.industrialFacilityDistanceM ?? Infinity) <= VNF_RADIUS_KM * 1000;
  let reference: GasFlareReferenceLookup = { state: "unavailable", candidateCount: 0, dataYear: null };
  try {
    reference = await flareReferenceLookup(input.lat, input.lng, VNF_RADIUS_KM);
  } catch { /* Independent flare context remains explicitly unavailable. */ }

  const hasRelevantOsmFacility = (input.industrialFacilityCategory === "refinery" || input.industrialFacilityCategory === "lng_terminal")
    && Number.isFinite(input.industrialFacilityLatitude) && Number.isFinite(input.industrialFacilityLongitude);
  const candidateNearRelevantFacility = hasRelevantOsmFacility && reference.match !== undefined
    && distanceKm(reference.match.latitude, reference.match.longitude, Number(input.industrialFacilityLatitude), Number(input.industrialFacilityLongitude)) <= VNF_FACILITY_MATCH_KM;
  const currentThermalObservation = input.firmsCurrentState === "available" && (input.firmsCurrentDetections ?? 0) > 0;
  // Reuses the existing routine-heat persistence threshold rather than adding
  // another classification threshold: at least five observed FIRMS detections
  // in the existing seven-day local history window.
  const persistentThermalObservation = input.firmsHistoryState === "available" && (input.firmsHistoryDetections ?? 0) >= 5;
  // GPPD supplies an independent nearby power-plant reference but does not
  // classify refineries/LNG terminals, so it cannot independently make a gas-flare claim.
  const gppdCrossReferenceAvailable = Boolean(input.gppdReference);
  const flareMatch = reference.state === "available" && candidateNearRelevantFacility && currentThermalObservation && persistentThermalObservation;
  const detail = flareMatch
    ? `Live NASA FIRMS thermal activity is persistent in the existing seven-day window and aligns with a public Gas Flares reference location near a typed ${input.industrialFacilityCategory?.replaceAll("_", " ")} OSM facility${gppdCrossReferenceAvailable ? "; nearby GPPD context was also available" : ""}.`
    : miningMatch
      ? "A nearby OSM facility is typed as mining; this is separate context and not a flare match."
      : reference.state === "cached"
        ? "Cached public gas-flare reference context is available, but cached data cannot issue a high-confidence gas-flare match."
        : reference.state === "unavailable"
          ? "Public gas-flare reference context is unavailable; no gas-flare match is issued."
          : !reference.match
            ? "No public gas-flare reference location is within the local search radius."
            : !currentThermalObservation
              ? "A nearby gas-flare reference exists, but no current live NASA FIRMS thermal observation is present."
              : !persistentThermalObservation
                ? "A nearby gas-flare reference exists, but the existing seven-day FIRMS window does not meet the established recurring-heat persistence threshold."
                : "No gas-flare match is issued.";
  return {
    flareMatch, flareMatchConfidence: flareMatch ? "high" : "none", miningMatch,
    // Retained for compatibility with the optional EOG VNF adapter. It remains
    // intentionally unavailable when no licensed EOG source has been configured.
    vnfState: "unavailable", vnfCandidateCount: 0,
    flareReferenceState: reference.state, flareReferenceCandidateCount: reference.candidateCount, flareReferenceDataYear: reference.dataYear,
    detail,
  };
}

/** Deterministic seams; fixtures never represent live satellite observations. */
export function setFacilityReferenceForTests(overrides?: {
  lookup?: FlareReferenceLookup;
}) {
  flareReferenceLookup = overrides?.lookup ?? lookupNearestFirmsGasFlare;
}
