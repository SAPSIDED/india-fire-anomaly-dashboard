import { getSourceEvidenceCache, saveSourceEvidenceCache } from "./db";

const LAND_COVER_IDENTIFY_URL = "https://ic.imagery1.arcgis.com/arcgis/rest/services/Sentinel2_10m_LandCover/ImageServer/identify";
const LAND_COVER_SOURCE = "Esri Sentinel-2 10m Land Use/Land Cover Time Series";
const LAND_COVER_CACHE_TTL_MS = 30 * 24 * 60 * 60_000;
const REQUEST_TIMEOUT_MS = 8_000;
const RETRY_DELAYS_MS = [0, 300];

export type LandCoverResult = {
  landCoverClass: string;
  source: string;
};

type CacheRecord = { payload: string; fetchedAt: Date; expiresAt: Date };
type CacheWriteInput = { cacheKey: string; provider: string; payload: string; fetchedAt: Date; expiresAt: Date };

let cacheReader: (cacheKey: string) => Promise<CacheRecord | undefined> = async cacheKey => {
  const record = await getSourceEvidenceCache(cacheKey);
  return record ? { payload: record.payload, fetchedAt: record.fetchedAt, expiresAt: record.expiresAt } : undefined;
};
let cacheWriter: (input: CacheWriteInput) => Promise<void> = async input => {
  await saveSourceEvidenceCache(input);
};

const LAND_COVER_CLASSES: Record<number, string> = {
  1: "water",
  2: "forest_vegetation",
  4: "flooded_vegetation",
  5: "cropland",
  7: "built_up",
  8: "bare_other",
  9: "snow_ice",
  10: "cloud_obscured",
  11: "grassland_rangeland",
};

function cacheKeyFor(lat: number, lon: number) {
  return `landcover-esri:${lat.toFixed(5)}:${lon.toFixed(5)}`;
}

function parseCachedResult(payload: string): LandCoverResult | undefined {
  try {
    const parsed = JSON.parse(payload) as Partial<LandCoverResult>;
    if (typeof parsed.landCoverClass !== "string" || typeof parsed.source !== "string") return undefined;
    return { landCoverClass: parsed.landCoverClass, source: parsed.source };
  } catch {
    return undefined;
  }
}

function resultFromValue(value: unknown): LandCoverResult | undefined {
  const code = Number(value);
  const landCoverClass = LAND_COVER_CLASSES[code];
  return landCoverClass ? { landCoverClass, source: LAND_COVER_SOURCE } : undefined;
}

async function requestLandCover(lat: number, lon: number): Promise<LandCoverResult> {
  let lastError: unknown;
  for (const delay of RETRY_DELAYS_MS) {
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    try {
      const params = new URLSearchParams({
        geometry: JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } }),
        geometryType: "esriGeometryPoint",
        sr: "4326",
        returnCatalogItems: "false",
        returnGeometry: "false",
        f: "json",
      });
      const response = await fetch(`${LAND_COVER_IDENTIFY_URL}?${params}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`Land-cover service returned HTTP ${response.status}`);
      const payload = await response.json() as { value?: unknown; error?: unknown };
      if (payload.error) throw new Error("Land-cover service returned an error payload.");
      const result = resultFromValue(payload.value);
      if (!result) throw new Error("Land-cover service returned an unrecognised class value.");
      return result;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Land-cover service request failed.");
}

/** Returns an available or cached land-cover class; failures are intentionally omitted from corroboration. */
export async function fetchLandCover(lat: number, lon: number): Promise<LandCoverResult | undefined> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return undefined;
  const cacheKey = cacheKeyFor(lat, lon);
  try {
    const result = await requestLandCover(lat, lon);
    const fetchedAt = new Date();
    try {
      await cacheWriter({
        cacheKey,
        provider: "esri-sentinel2-landcover",
        payload: JSON.stringify(result),
        fetchedAt,
        expiresAt: new Date(fetchedAt.getTime() + LAND_COVER_CACHE_TTL_MS),
      });
    } catch {
      // A cache write failure must not discard a successfully retrieved public land-cover value.
    }
    return result;
  } catch {
    try {
      const cached = await cacheReader(cacheKey);
      if (!cached || cached.expiresAt.getTime() <= Date.now()) return undefined;
      return parseCachedResult(cached.payload);
    } catch {
      return undefined;
    }
  }
}

/** Deterministic test-only cache seam; production always uses sourceEvidenceCache. */
export function setLandCoverCacheForTests(overrides?: {
  read?: (cacheKey: string) => Promise<CacheRecord | undefined>;
  write?: (input: CacheWriteInput) => Promise<void>;
}) {
  cacheReader = overrides?.read ?? (async cacheKey => {
    const record = await getSourceEvidenceCache(cacheKey);
    return record ? { payload: record.payload, fetchedAt: record.fetchedAt, expiresAt: record.expiresAt } : undefined;
  });
  cacheWriter = overrides?.write ?? (async input => { await saveSourceEvidenceCache(input); });
}
