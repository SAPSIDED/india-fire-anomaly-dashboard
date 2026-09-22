import { getSourceEvidenceCache, saveSourceEvidenceCache } from "./db";

const FOREST_COVER_DISTRICT_SERVICE = "https://livingatlas.esri.in/server1/rest/services/ForestSurvey/District_Wise_Forest_Cover_2023/MapServer/0";
const FOREST_FIRE_DISTRICT_SERVICE = "https://livingatlas.esri.in/server1/rest/services/ForestSurvey/District_Wise_Forest_Fire/MapServer/0";
const FSI_SOURCE = "Forest Survey of India / ISFR 2023 via Esri India Living Atlas";
const FSI_POINT_SOURCE = process.env.FSI_POINT_FOREST_QUERY_URL?.replace(/\/+$/, "") ?? null;
const CACHE_TTL_MS = 30 * 24 * 60 * 60_000;
const REQUEST_TIMEOUT_MS = 8_000;

type EvidenceState = "available" | "cached" | "unavailable";
export type ForestGate = "inside" | "outside" | "unknown";

export type FsiForestContext = {
  state: EvidenceState;
  source: string;
  pointForestStatus: ForestGate;
  pointForestClass: "very_dense_forest" | "moderately_dense_forest" | "open_forest" | "scrub" | "non_forest" | "water_bodies" | null;
  districtName: string | null;
  stateName: string | null;
  forestAreaSqKm: number | null;
  forestSharePct: number | null;
  districtFireDetections2022_23: number | null;
  districtFireDetections2023_24: number | null;
  historicalForestFireDetections: number | null;
  detail: string;
};

type CacheRecord = { payload: string; fetchedAt: Date; expiresAt: Date };
let cacheReader: (key: string) => Promise<CacheRecord | undefined> = async key => {
  const value = await getSourceEvidenceCache(key);
  return value ? { payload: value.payload, fetchedAt: value.fetchedAt, expiresAt: value.expiresAt } : undefined;
};
let cacheWriter: (input: { cacheKey: string; provider: string; payload: string; fetchedAt: Date; expiresAt: Date }) => Promise<void> = async input => { await saveSourceEvidenceCache(input); };

function cacheKey(lat: number, lng: number) { return `fsi-forest-context:${lat.toFixed(4)}:${lng.toFixed(4)}`; }
function validCoordinate(lat: number, lng: number) { return Number.isFinite(lat) && Number.isFinite(lng) && lat >= 6 && lat <= 38 && lng >= 68 && lng <= 98; }
function numeric(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; }
function attr(attributes: Record<string, unknown>, ...names: string[]) {
  const found = names.find(name => attributes[name] !== undefined && attributes[name] !== null);
  return found ? attributes[found] : undefined;
}

function queryUrl(service: string, lat: number, lng: number, outFields = "*") {
  const params = new URLSearchParams({
    f: "json",
    geometry: JSON.stringify({ x: lng, y: lat, spatialReference: { wkid: 4326 } }),
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields,
    returnGeometry: "false",
  });
  return `${service}/query?${params}`;
}

async function requestJson(url: string) {
  const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`FSI service returned HTTP ${response.status}`);
  const payload = await response.json() as { features?: Array<{ attributes?: Record<string, unknown> }>; error?: unknown };
  if (payload.error || !payload.features?.[0]?.attributes) throw new Error("FSI service returned no point-intersecting feature.");
  return payload.features[0].attributes;
}

function densityClass(attributes: Record<string, unknown>): FsiForestContext["pointForestClass"] {
  const vdf = numeric(attr(attributes, "vdf2023")) ?? 0;
  const mdf = numeric(attr(attributes, "mdf2023")) ?? 0;
  const open = numeric(attr(attributes, "of2023")) ?? 0;
  const scrub = numeric(attr(attributes, "scrub")) ?? 0;
  if (vdf > 0) return "very_dense_forest";
  if (mdf > 0) return "moderately_dense_forest";
  if (open > 0) return "open_forest";
  if (scrub > 0) return "scrub";
  return "non_forest";
}

function fireCount(attributes: Record<string, unknown>) {
  const values = Object.entries(attributes).filter(([key]) => /(2022.?23|2023.?24|fire|viirs|snpp)/i.test(key)).map(([, value]) => numeric(value)).filter((value): value is number => value !== null);
  return values.length ? Math.max(...values) : null;
}

function emptyContext(detail: string, state: EvidenceState = "unavailable"): FsiForestContext {
  return { state, source: FSI_SOURCE, pointForestStatus: "unknown", pointForestClass: null, districtName: null, stateName: null, forestAreaSqKm: null, forestSharePct: null, districtFireDetections2022_23: null, districtFireDetections2023_24: null, historicalForestFireDetections: null, detail };
}

export function unavailableFsiForestContext(detail = "FSI/ISFR forest context was not available within the live evidence window.") {
  return emptyContext(detail);
}

function parseCached(payload: string) {
  try {
    const value = JSON.parse(payload) as FsiForestContext;
    return value && typeof value.detail === "string" ? value : undefined;
  } catch { return undefined; }
}

/**
 * FSI's public ISFR 2023 district layer supplies authoritative forest totals and
 * historical fire counts. A true point-in-forest gate is used only when the
 * deployment provides FSI_POINT_FOREST_QUERY_URL; district totals never get
 * misrepresented as point-level forest membership.
 */
export async function fetchFsiForestContext(lat: number, lng: number): Promise<FsiForestContext> {
  if (!validCoordinate(lat, lng)) return emptyContext("The hotspot coordinate is outside the supported India bounds.");
  const key = cacheKey(lat, lng);
  try {
    const [forestAttributes, fireAttributes] = await Promise.all([
      requestJson(queryUrl(FOREST_COVER_DISTRICT_SERVICE, lat, lng, "districtname,statename,calarea,vdf2023,mdf2023,of2023,total,percalarea,scrub")),
      requestJson(queryUrl(FOREST_FIRE_DISTRICT_SERVICE, lat, lng)),
    ]);
    const forestArea = numeric(attr(forestAttributes, "total"));
    const districtArea = numeric(attr(forestAttributes, "calarea"));
    const f2022 = numeric(attr(fireAttributes, "viirs_2022_23", "viirs2022_23", "VIIRS_2022_23"));
    const f2023 = numeric(attr(fireAttributes, "viirs_2023_24", "viirs2023_24", "VIIRS_2023_24"));
    const historical = f2022 !== null || f2023 !== null ? Math.max(f2022 ?? 0, f2023 ?? 0) : fireCount(fireAttributes);
    let pointForestStatus: ForestGate = "unknown";
    let pointForestClass: FsiForestContext["pointForestClass"] = null;
    if (FSI_POINT_SOURCE) {
      try {
        const point = await requestJson(queryUrl(FSI_POINT_SOURCE, lat, lng));
        const value = String(attr(point, "class", "forest_class", "landcover", "category") ?? "").toLowerCase();
        pointForestClass = value.includes("very dense") ? "very_dense_forest" : value.includes("moderately") ? "moderately_dense_forest" : value.includes("open forest") ? "open_forest" : value.includes("scrub") ? "scrub" : value.includes("water") ? "water_bodies" : value.includes("non") ? "non_forest" : null;
        pointForestStatus = pointForestClass && ["very_dense_forest", "moderately_dense_forest", "open_forest"].includes(pointForestClass) ? "inside" : pointForestClass ? "outside" : "unknown";
      } catch { /* A missing point layer must remain unknown, never guessed. */ }
    }
    const result: FsiForestContext = {
      state: "available", source: FSI_SOURCE, pointForestStatus, pointForestClass,
      districtName: String(attr(forestAttributes, "districtname") ?? attr(fireAttributes, "districtname") ?? "") || null,
      stateName: String(attr(forestAttributes, "statename") ?? attr(fireAttributes, "statename") ?? "") || null,
      forestAreaSqKm: forestArea, forestSharePct: forestArea !== null && districtArea ? Number((forestArea / districtArea * 100).toFixed(2)) : numeric(attr(forestAttributes, "percalarea")),
      districtFireDetections2022_23: f2022, districtFireDetections2023_24: f2023, historicalForestFireDetections: historical,
      detail: pointForestStatus === "unknown" ? "FSI/ISFR 2023 confirms district forest cover and historical forest-fire detections, but no point-level FSI forest polygon was configured; wildfire eligibility remains withheld rather than inferred from a district total." : `FSI point forest gate is ${pointForestStatus}; ISFR 2023 historical forest-fire detections in the district: ${historical ?? "unavailable"}.`,
    };
    const fetchedAt = new Date();
    try { await cacheWriter({ cacheKey: key, provider: "fsi-isfr-2023", payload: JSON.stringify(result), fetchedAt, expiresAt: new Date(fetchedAt.getTime() + CACHE_TTL_MS) }); } catch { /* preserve live result */ }
    return result;
  } catch {
    try {
      const cached = await cacheReader(key);
      if (cached && cached.expiresAt.getTime() > Date.now()) return { ...(parseCached(cached.payload) ?? emptyContext("The FSI cache payload was invalid.")), state: "cached" };
    } catch { /* fall through */ }
    return emptyContext("FSI/ISFR forest context was unavailable after a bounded request; wildfire eligibility remains withheld.");
  }
}

export function setFsiForestContextCacheForTests(overrides?: { read?: typeof cacheReader; write?: typeof cacheWriter }) {
  cacheReader = overrides?.read ?? (async key => { const value = await getSourceEvidenceCache(key); return value ? { payload: value.payload, fetchedAt: value.fetchedAt, expiresAt: value.expiresAt } : undefined; });
  cacheWriter = overrides?.write ?? (async input => { await saveSourceEvidenceCache(input); });
}
