import { getGppdReferenceCandidates, getSourceEvidenceCache, replaceGppdReference, saveSourceEvidenceCache, type GppdReferenceInput } from "./db";

const GPPD_INDIA_CSV_URL = "https://raw.githubusercontent.com/wri/global-power-plant-database/master/source_databases_csv/database_IND.csv";
const GPPD_SOURCE = "WRI Global Power Plant Database v1.3.0 (CC BY 4.0)";
const GPPD_LOADER_CACHE_KEY = "gppd-reference:india:v1.3.0";
const GPPD_CACHE_TTL_MS = 30 * 24 * 60 * 60_000;
const DEFAULT_RADIUS_KM = 2;

export type GppdPlantReference = {
  name: string;
  fuelType: string | null;
  capacityMw: number | null;
  distanceKm: number;
  source: string;
};

type CacheRecord = { payload: string; fetchedAt: Date; expiresAt: Date };
type CacheWriteInput = { cacheKey: string; provider: string; payload: string; fetchedAt: Date; expiresAt: Date };
type CsvFetcher = () => Promise<string>;
type ReferenceReplacer = (rows: GppdReferenceInput[]) => Promise<{ loadedAt: Date; rowCount: number }>;
type CandidateReader = (lat: number, lng: number, radiusKm: number) => Promise<Array<{ name: string; primaryFuel: string | null; capacityMw: string | null; latitude: string; longitude: string }>>;

let csvFetcher: CsvFetcher = async () => {
  const response = await fetch(GPPD_INDIA_CSV_URL, { headers: { Accept: "text/csv" }, signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`GPPD source returned HTTP ${response.status}`);
  return response.text();
};
let cacheReader: (cacheKey: string) => Promise<CacheRecord | undefined> = async cacheKey => getSourceEvidenceCache(cacheKey);
let cacheWriter: (input: CacheWriteInput) => Promise<void> = async input => { await saveSourceEvidenceCache(input); };
let referenceReplacer: ReferenceReplacer = replaceGppdReference;
let candidateReader: CandidateReader = getGppdReferenceCandidates;

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"') { cell += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { cells.push(cell); cell = ""; }
    else cell += char;
  }
  cells.push(cell);
  return cells;
}

export function parseIndiaGppdCsv(csv: string): GppdReferenceInput[] {
  const lines = csv.trim().split(/\r?\n/);
  const headers = parseCsvLine(lines.shift() ?? "");
  const index = (name: string) => headers.indexOf(name);
  const fields = { country: index("country"), name: index("name"), gppdId: index("gppd_idnr"), capacityMw: index("capacity_mw"), latitude: index("latitude"), longitude: index("longitude"), primaryFuel: index("primary_fuel") };
  if (Object.values(fields).some(value => value < 0)) throw new Error("GPPD CSV is missing required reference fields.");
  return lines.flatMap(line => {
    const row = parseCsvLine(line);
    const latitude = Number(row[fields.latitude]);
    const longitude = Number(row[fields.longitude]);
    if (row[fields.country] !== "IND" || !row[fields.name] || !row[fields.gppdId] || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
    const capacity = Number(row[fields.capacityMw]);
    return [{
      country: "IND" as const,
      gppdId: row[fields.gppdId], name: row[fields.name], primaryFuel: row[fields.primaryFuel] || null,
      capacityMw: Number.isFinite(capacity) ? capacity.toFixed(3) : null,
      latitude: latitude.toFixed(6), longitude: longitude.toFixed(6), sourceUrl: GPPD_INDIA_CSV_URL,
    }];
  });
}

function distanceKm(latA: number, lngA: number, latB: number, lngB: number) {
  const radians = (value: number) => value * Math.PI / 180;
  const dLat = radians(latB - latA);
  const dLng = radians(lngB - lngA);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(latA)) * Math.cos(radians(latB)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function pointCacheKey(lat: number, lng: number, radiusKm: number) {
  return `gppd-reference:nearest:${lat.toFixed(5)}:${lng.toFixed(5)}:${radiusKm.toFixed(2)}`;
}

function parseCachedPlant(payload: string): GppdPlantReference | undefined {
  try {
    const parsed = JSON.parse(payload) as Partial<GppdPlantReference>;
    if (typeof parsed.name !== "string" || typeof parsed.distanceKm !== "number" || typeof parsed.source !== "string") return undefined;
    if (parsed.fuelType !== null && typeof parsed.fuelType !== "string") return undefined;
    if (parsed.capacityMw !== null && typeof parsed.capacityMw !== "number") return undefined;
    return { name: parsed.name, fuelType: parsed.fuelType ?? null, capacityMw: parsed.capacityMw ?? null, distanceKm: parsed.distanceKm, source: parsed.source };
  } catch {
    return undefined;
  }
}

async function hydrateReference(): Promise<boolean> {
  try {
    const csv = await csvFetcher();
    const rows = parseIndiaGppdCsv(csv);
    if (rows.length === 0) throw new Error("GPPD source contained no valid India rows.");
    const replaced = await referenceReplacer(rows);
    const fetchedAt = new Date();
    try {
      await cacheWriter({ cacheKey: GPPD_LOADER_CACHE_KEY, provider: "wri-gppd-india", payload: JSON.stringify({ rowCount: replaced.rowCount, source: GPPD_SOURCE }), fetchedAt, expiresAt: new Date(fetchedAt.getTime() + GPPD_CACHE_TTL_MS) });
    } catch { /* A cache write failure cannot invalidate a successful GPPD database load. */ }
    return true;
  } catch {
    return false;
  }
}

/** Starts a reference refresh only when no load is already in flight; source failure deliberately does not throw. */
let hydrationInFlight: Promise<boolean> | undefined;
export function loadIndiaGppdReference() {
  if (!hydrationInFlight) hydrationInFlight = hydrateReference().finally(() => { hydrationInFlight = undefined; });
  return hydrationInFlight;
}

/** Returns the nearest India GPPD plant within radius, or omits reference context on any source/database failure. */
export async function lookupNearestGppdPlant(lat: number, lng: number, radiusKm = DEFAULT_RADIUS_KM): Promise<GppdPlantReference | undefined> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(radiusKm) || radiusKm <= 0) return undefined;
  try {
    const candidates = await candidateReader(lat, lng, radiusKm);
    const nearest = candidates
      .map(plant => ({ plant, distanceKm: distanceKm(lat, lng, Number(plant.latitude), Number(plant.longitude)) }))
      .filter(candidate => Number.isFinite(candidate.distanceKm) && candidate.distanceKm <= radiusKm)
      .sort((left, right) => left.distanceKm - right.distanceKm)[0];
    if (!nearest) {
      void loadIndiaGppdReference();
      return undefined;
    }
    const result = { name: nearest.plant.name, fuelType: nearest.plant.primaryFuel, capacityMw: nearest.plant.capacityMw === null ? null : Number(nearest.plant.capacityMw), distanceKm: Number(nearest.distanceKm.toFixed(3)), source: GPPD_SOURCE };
    const fetchedAt = new Date();
    try {
      await cacheWriter({ cacheKey: pointCacheKey(lat, lng, radiusKm), provider: "wri-gppd-nearest", payload: JSON.stringify(result), fetchedAt, expiresAt: new Date(fetchedAt.getTime() + GPPD_CACHE_TTL_MS) });
    } catch { /* A cache write failure cannot discard a valid indexed reference match. */ }
    return result;
  } catch {
    try {
      const cached = await cacheReader(pointCacheKey(lat, lng, radiusKm));
      if (!cached || cached.expiresAt.getTime() <= Date.now()) return undefined;
      return parseCachedPlant(cached.payload);
    } catch {
      return undefined;
    }
  }
}

/** Deterministic seams for live, cached-fallback, and unavailable-source tests. */
export function setGppdReferenceForTests(overrides?: {
  fetchCsv?: CsvFetcher;
  readCache?: (cacheKey: string) => Promise<CacheRecord | undefined>;
  writeCache?: (input: CacheWriteInput) => Promise<void>;
  replace?: ReferenceReplacer;
  candidates?: CandidateReader;
}) {
  csvFetcher = overrides?.fetchCsv ?? (async () => {
    const response = await fetch(GPPD_INDIA_CSV_URL, { headers: { Accept: "text/csv" }, signal: AbortSignal.timeout(12_000) });
    if (!response.ok) throw new Error(`GPPD source returned HTTP ${response.status}`);
    return response.text();
  });
  cacheReader = overrides?.readCache ?? (async cacheKey => getSourceEvidenceCache(cacheKey));
  cacheWriter = overrides?.writeCache ?? (async input => { await saveSourceEvidenceCache(input); });
  referenceReplacer = overrides?.replace ?? replaceGppdReference;
  candidateReader = overrides?.candidates ?? getGppdReferenceCandidates;
  hydrationInFlight = undefined;
}
