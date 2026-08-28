import { detectionHistory, sourceEvidenceCache } from "../drizzle/schema";
import { getDb } from "./db";
import { fetchLandCover, type LandCoverResult } from "./landcover";

const REQUEST_DELAY_MS = 250;
const LAND_COVER_PROVIDER = "esri-sentinel2-landcover";

export type HistoryCoordinate = { latitude: string | number; longitude: string | number };
export type LandCoverCacheEntry = { cacheKey: string; provider: string; payload: string };
export type LandCoverBackfillResult = {
  historyRows: number;
  uniqueLocations: number;
  alreadyCached: number;
  attempted: number;
  succeeded: number;
  failed: number;
};

function coordinateKey(latitude: number, longitude: number) {
  return `${latitude.toFixed(5)}:${longitude.toFixed(5)}`;
}

function cacheKey(latitude: number, longitude: number) {
  return `landcover-esri:${coordinateKey(latitude, longitude)}`;
}

function hasValidLandCoverPayload(payload: string) {
  try {
    const parsed = JSON.parse(payload) as { landCoverClass?: unknown; source?: unknown };
    return typeof parsed.landCoverClass === "string" && typeof parsed.source === "string";
  } catch {
    return false;
  }
}

function pause(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}

/**
 * Calls the existing land-cover fetcher only for unique stored FIRMS locations with no valid persisted
 * land-cover entry. This function is intentionally manual-only and makes no scheduler or pipeline changes.
 */
export async function backfillMissingLandCover(input: {
  historyRows: HistoryCoordinate[];
  cachedEntries: LandCoverCacheEntry[];
  fetch?: (latitude: number, longitude: number) => Promise<LandCoverResult | undefined>;
  delayMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  logFailure?: (message: string) => void;
}): Promise<LandCoverBackfillResult> {
  const knownCacheKeys = new Set(input.cachedEntries
    .filter(entry => entry.provider === LAND_COVER_PROVIDER && hasValidLandCoverPayload(entry.payload))
    .map(entry => entry.cacheKey));
  const uniqueLocations = new Map<string, { latitude: number; longitude: number }>();
  for (const row of input.historyRows) {
    const latitude = Number(row.latitude);
    const longitude = Number(row.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    uniqueLocations.set(coordinateKey(latitude, longitude), { latitude, longitude });
  }
  const locations = Array.from(uniqueLocations.values());
  const missing = locations.filter(location => !knownCacheKeys.has(cacheKey(location.latitude, location.longitude)));
  const fetcher = input.fetch ?? fetchLandCover;
  const delayMs = input.delayMs ?? REQUEST_DELAY_MS;
  const sleep = input.sleep ?? pause;
  const logFailure = input.logFailure ?? console.warn;
  let succeeded = 0;
  let failed = 0;
  for (let index = 0; index < missing.length; index += 1) {
    if (index > 0 && delayMs > 0) await sleep(delayMs);
    const location = missing[index];
    try {
      const result = await fetcher(location.latitude, location.longitude);
      if (result) succeeded += 1;
      else {
        failed += 1;
        logFailure(`[LandCoverBackfill] No land-cover result for ${location.latitude.toFixed(5)},${location.longitude.toFixed(5)}; skipping.`);
      }
    } catch (error) {
      failed += 1;
      const detail = error instanceof Error ? error.message : "unknown error";
      logFailure(`[LandCoverBackfill] Failed ${location.latitude.toFixed(5)},${location.longitude.toFixed(5)}; skipping (${detail}).`);
    }
  }
  return {
    historyRows: input.historyRows.length,
    uniqueLocations: locations.length,
    alreadyCached: locations.length - missing.length,
    attempted: missing.length,
    succeeded,
    failed,
  };
}

/** Runs the manual backfill using only the existing stored FIRMS history and existing cache table. */
export async function runLandCoverBackfill() {
  const db = await getDb();
  if (!db) throw new Error("Land-cover backfill requires the existing project database.");
  const [historyRows, cachedEntries] = await Promise.all([
    db.select({ latitude: detectionHistory.latitude, longitude: detectionHistory.longitude }).from(detectionHistory),
    db.select({ cacheKey: sourceEvidenceCache.cacheKey, provider: sourceEvidenceCache.provider, payload: sourceEvidenceCache.payload }).from(sourceEvidenceCache),
  ]);
  return backfillMissingLandCover({ historyRows, cachedEntries });
}

if (process.argv[1]?.endsWith("backfillLandCover.ts")) {
  runLandCoverBackfill().then(result => {
    console.log(`[LandCoverBackfill] Completed: ${JSON.stringify(result)}`);
    process.exit(0);
  }).catch(error => {
    console.error(`[LandCoverBackfill] Cannot start: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  });
}
