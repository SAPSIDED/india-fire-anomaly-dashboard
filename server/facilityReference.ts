import { getSourceEvidenceCache, saveSourceEvidenceCache } from "./db";

const VNF_PROVIDER = "noaa-viirs-nightfire";
const VNF_RADIUS_KM = 2;
const VNF_FACILITY_MATCH_KM = 1;
const VNF_CACHE_TTL_MS = 60 * 60_000;

export type VnfCandidate = { latitude: number; longitude: number; observedAt?: string };
export type FacilitySignalInput = {
  lat: number;
  lng: number;
  industrialFacilityCategory?: "refinery" | "power_plant" | "steel" | "lng_terminal" | "mining" | "agricultural_zone" | null;
  industrialFacilityLatitude?: number | null;
  industrialFacilityLongitude?: number | null;
  industrialFacilityDistanceM?: number | null;
  gppdReference?: unknown;
};
export type FacilitySignals = {
  flareMatch: boolean;
  flareMatchConfidence: "high" | "none";
  miningMatch: boolean;
  vnfState: "available" | "cached" | "unavailable";
  vnfCandidateCount: number;
  detail: string;
};

type BoundedVnfAdapter = (lat: number, lng: number, radiusKm: number) => Promise<VnfCandidate[]>;
type CacheRecord = { payload: string; fetchedAt: Date; expiresAt: Date };

function distanceKm(latA: number, lngA: number, latB: number, lngB: number) {
  const radians = (value: number) => value * Math.PI / 180;
  const dLat = radians(latB - latA);
  const dLng = radians(lngB - lngA);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(latA)) * Math.cos(radians(latB)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function pointCacheKey(lat: number, lng: number, radiusKm: number) {
  return `vnf-reference:nearby:${lat.toFixed(5)}:${lng.toFixed(5)}:${radiusKm.toFixed(2)}`;
}

function parseCandidates(payload: string): VnfCandidate[] | undefined {
  try {
    const parsed = JSON.parse(payload) as unknown;
    if (!Array.isArray(parsed)) return undefined;
    return parsed.flatMap(candidate => {
      const value = candidate as Partial<VnfCandidate>;
      if (!Number.isFinite(value.latitude) || !Number.isFinite(value.longitude)) return [];
      return [{ latitude: Number(value.latitude), longitude: Number(value.longitude), ...(typeof value.observedAt === "string" ? { observedAt: value.observedAt } : {}) }];
    });
  } catch {
    return undefined;
  }
}

let boundedVnfAdapter: BoundedVnfAdapter = async (lat, lng, radiusKm) => {
  const endpoint = process.env.VNF_BOUNDED_CANDIDATE_URL;
  if (!endpoint) throw new Error("No licensed bounded VNF candidate endpoint is configured.");
  const url = new URL(endpoint);
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lng", String(lng));
  url.searchParams.set("radiusKm", String(radiusKm));
  const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error(`VNF bounded source returned HTTP ${response.status}`);
  const payload = await response.json() as { candidates?: unknown };
  const candidates = parseCandidates(JSON.stringify(payload.candidates ?? []));
  if (!candidates) throw new Error("VNF bounded source returned an invalid candidate payload.");
  return candidates;
};
let cacheReader: (key: string) => Promise<CacheRecord | undefined> = key => getSourceEvidenceCache(key);
let cacheWriter: (input: { cacheKey: string; provider: string; payload: string; fetchedAt: Date; expiresAt: Date }) => Promise<void> = input => saveSourceEvidenceCache(input);

/**
 * Performs only a bounded candidate lookup. The project intentionally has no
 * per-request VNF catalog download: without an approved point endpoint or a
 * maintained local index, this returns unavailable and does not throw.
 */
export async function assessFacilitySignals(input: FacilitySignalInput): Promise<FacilitySignals> {
  const miningMatch = input.industrialFacilityCategory === "mining" && (input.industrialFacilityDistanceM ?? Infinity) <= VNF_RADIUS_KM * 1000;
  const cacheKey = pointCacheKey(input.lat, input.lng, VNF_RADIUS_KM);
  let candidates: VnfCandidate[] = [];
  let vnfState: FacilitySignals["vnfState"] = "unavailable";
  try {
    candidates = await boundedVnfAdapter(input.lat, input.lng, VNF_RADIUS_KM);
    vnfState = "available";
    const fetchedAt = new Date();
    try {
      await cacheWriter({ cacheKey, provider: VNF_PROVIDER, payload: JSON.stringify(candidates), fetchedAt, expiresAt: new Date(fetchedAt.getTime() + VNF_CACHE_TTL_MS) });
    } catch { /* A cache write failure cannot invalidate live bounded VNF evidence. */ }
  } catch {
    try {
      const cached = await cacheReader(cacheKey);
      const parsed = cached && cached.expiresAt.getTime() > Date.now() ? parseCandidates(cached.payload) : undefined;
      if (parsed) { candidates = parsed; vnfState = "cached"; }
    } catch { /* Unavailable VNF evidence remains non-blocking. */ }
  }

  const hasRelevantOsmFacility = (input.industrialFacilityCategory === "refinery" || input.industrialFacilityCategory === "lng_terminal")
    && Number.isFinite(input.industrialFacilityLatitude) && Number.isFinite(input.industrialFacilityLongitude);
  const candidateNearRelevantFacility = hasRelevantOsmFacility && candidates.some(candidate =>
    distanceKm(candidate.latitude, candidate.longitude, Number(input.industrialFacilityLatitude), Number(input.industrialFacilityLongitude)) <= VNF_FACILITY_MATCH_KM,
  );
  // GPPD supplies an independent nearby power-plant reference but does not
  // classify refineries/LNG terminals, so it cannot independently make a gas-flare claim.
  const gppdCrossReferenceAvailable = Boolean(input.gppdReference);
  const flareMatch = vnfState === "available" && candidateNearRelevantFacility;
  const detail = flareMatch
    ? `Live VNF candidate is within ${VNF_FACILITY_MATCH_KM} km of a typed ${input.industrialFacilityCategory?.replaceAll("_", " ")} OSM facility${gppdCrossReferenceAvailable ? "; nearby GPPD context was also available" : ""}.`
    : miningMatch
      ? "A nearby OSM facility is typed as mining; this is separate context and not a flare match."
      : vnfState === "cached"
        ? "Cached VNF candidate context is available, but cached data cannot issue a high-confidence gas-flare match."
        : vnfState === "unavailable"
          ? "VNF bounded candidate evidence is unavailable; no gas-flare match is issued."
          : "No live VNF candidate is co-located with a typed refinery or LNG-terminal OSM facility.";
  return { flareMatch, flareMatchConfidence: flareMatch ? "high" : "none", miningMatch, vnfState, vnfCandidateCount: candidates.length, detail };
}

/** Deterministic seams; test fixtures never represent live VNF observations. */
export function setFacilityReferenceForTests(overrides?: {
  lookup?: BoundedVnfAdapter;
  readCache?: (key: string) => Promise<CacheRecord | undefined>;
  writeCache?: (input: { cacheKey: string; provider: string; payload: string; fetchedAt: Date; expiresAt: Date }) => Promise<void>;
}) {
  boundedVnfAdapter = overrides?.lookup ?? (async (lat, lng, radiusKm) => {
    const endpoint = process.env.VNF_BOUNDED_CANDIDATE_URL;
    if (!endpoint) throw new Error("No licensed bounded VNF candidate endpoint is configured.");
    const url = new URL(endpoint);
    url.searchParams.set("lat", String(lat)); url.searchParams.set("lng", String(lng)); url.searchParams.set("radiusKm", String(radiusKm));
    const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8_000) });
    if (!response.ok) throw new Error(`VNF bounded source returned HTTP ${response.status}`);
    const payload = await response.json() as { candidates?: unknown };
    const candidates = parseCandidates(JSON.stringify(payload.candidates ?? []));
    if (!candidates) throw new Error("VNF bounded source returned an invalid candidate payload.");
    return candidates;
  });
  cacheReader = overrides?.readCache ?? (key => getSourceEvidenceCache(key));
  cacheWriter = overrides?.writeCache ?? (input => saveSourceEvidenceCache(input));
}
