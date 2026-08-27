import ExcelJS from "exceljs";
import { getGasFlareReferenceCandidates, getSourceEvidenceCache, replaceGasFlareReference, saveSourceEvidenceCache, type GasFlareReferenceInput } from "./db";

export const PUBLIC_FLARE_REFERENCE_URL = "https://thedocs.worldbank.org/en/doc/b34e0c054bb3fe3695e70154c28eef3f-0400072026/related/Flare-Volume-Estimates-by-individual-Flare-Location-2012-2025.xlsx";
export const FIRMS_GAS_FLARE_REFERENCE_SOURCE = "NASA FIRMS Gas Flares reference context; World Bank GFMR individual flare locations (2012–2025)";
const SOURCE_DATA_YEAR = 2025;
const LOADER_CACHE_KEY = "firms-gas-flare-reference:india:world-bank-gfmr:2025";
const CACHE_TTL_MS = 400 * 24 * 60 * 60_000;
const DEFAULT_RADIUS_KM = 2;

export type GasFlareReferenceMatch = {
  flareId: string;
  latitude: number;
  longitude: number;
  distanceKm: number;
  source: string;
  sourceDataYear: number;
  fieldType: string | null;
  fieldName: string | null;
  operator: string | null;
  location: string | null;
  latestAnnualVolumeMcm: number | null;
};
export type GasFlareReferenceLookup = {
  state: "available" | "cached" | "unavailable";
  candidateCount: number;
  dataYear: number | null;
  match?: GasFlareReferenceMatch;
};

type CacheRecord = { payload: string; fetchedAt: Date; expiresAt: Date };
type WorkbookRowsFetcher = () => Promise<unknown[][]>;
type ReferenceReplacer = (rows: GasFlareReferenceInput[]) => Promise<{ loadedAt: Date; rowCount: number }>;
type CandidateReader = (lat: number, lng: number, radiusKm: number) => Promise<Array<{
  flareId: string; latitude: string; longitude: string; location: string | null; fieldType: string | null; fieldName: string | null;
  operator: string | null; latestAnnualVolumeMcm: string | null; sourceDataYear: number;
}>>;

function cleanText(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

/** Parses an Excel worksheet represented as aligned row arrays; no download occurs here. */
export function parseIndiaGasFlareRows(rows: unknown[][]): GasFlareReferenceInput[] {
  const [headers = [], ...records] = rows;
  const headerIndex = (name: string) => headers.findIndex(value => cleanText(value)?.toLowerCase() === name.toLowerCase());
  const fields = {
    flareId: headerIndex("Flare id"), country: headerIndex("Country"), latitude: headerIndex("Latitude"), longitude: headerIndex("Longitude"),
    location: headerIndex("Location"), fieldType: headerIndex("Field Type"), fieldName: headerIndex("Field name"), operator: headerIndex("Operator"), volume: headerIndex(String(SOURCE_DATA_YEAR)),
  };
  if (Object.values(fields).some(index => index < 0)) throw new Error("Public gas-flare workbook is missing required reference columns.");
  return records.flatMap(record => {
    const flareId = cleanText(record[fields.flareId]);
    const country = cleanText(record[fields.country]);
    const latitude = Number(record[fields.latitude]);
    const longitude = Number(record[fields.longitude]);
    if (!flareId || country?.toLowerCase() !== "india" || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
    const volume = Number(record[fields.volume]);
    return [{
      flareId, country: "India" as const, latitude: latitude.toFixed(6), longitude: longitude.toFixed(6), location: cleanText(record[fields.location]),
      fieldType: cleanText(record[fields.fieldType]), fieldName: cleanText(record[fields.fieldName]), operator: cleanText(record[fields.operator]),
      latestAnnualVolumeMcm: Number.isFinite(volume) ? volume.toFixed(9) : null, sourceDataYear: SOURCE_DATA_YEAR, sourceUrl: PUBLIC_FLARE_REFERENCE_URL,
    }];
  });
}

async function readPublicWorkbookRows(): Promise<unknown[][]> {
  const response = await fetch(PUBLIC_FLARE_REFERENCE_URL, {
    headers: { Accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }, signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Public gas-flare reference returned HTTP ${response.status}`);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await response.arrayBuffer());
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error("Public gas-flare workbook did not contain a worksheet.");
  return Array.from({ length: worksheet.rowCount }, (_, index) => worksheet.getRow(index + 1).values as unknown[]);
}

function distanceKm(latA: number, lngA: number, latB: number, lngB: number) {
  const radians = (value: number) => value * Math.PI / 180;
  const dLat = radians(latB - latA);
  const dLng = radians(lngB - lngA);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(latA)) * Math.cos(radians(latB)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function pointCacheKey(lat: number, lng: number, radiusKm: number) {
  return `firms-gas-flare-reference:nearest:${lat.toFixed(5)}:${lng.toFixed(5)}:${radiusKm.toFixed(2)}`;
}

function parseCachedMatch(payload: string): GasFlareReferenceMatch | undefined {
  try {
    const value = JSON.parse(payload) as Partial<GasFlareReferenceMatch>;
    if (typeof value.flareId !== "string" || typeof value.latitude !== "number" || typeof value.longitude !== "number" || typeof value.distanceKm !== "number" || typeof value.source !== "string" || typeof value.sourceDataYear !== "number") return undefined;
    return {
      flareId: value.flareId, latitude: value.latitude, longitude: value.longitude, distanceKm: value.distanceKm, source: value.source, sourceDataYear: value.sourceDataYear,
      fieldType: typeof value.fieldType === "string" ? value.fieldType : null, fieldName: typeof value.fieldName === "string" ? value.fieldName : null,
      operator: typeof value.operator === "string" ? value.operator : null, location: typeof value.location === "string" ? value.location : null,
      latestAnnualVolumeMcm: typeof value.latestAnnualVolumeMcm === "number" ? value.latestAnnualVolumeMcm : null,
    };
  } catch {
    return undefined;
  }
}

let workbookRowsFetcher: WorkbookRowsFetcher = readPublicWorkbookRows;
let cacheReader: (key: string) => Promise<CacheRecord | undefined> = key => getSourceEvidenceCache(key);
let cacheWriter: (input: { cacheKey: string; provider: string; payload: string; fetchedAt: Date; expiresAt: Date }) => Promise<void> = input => saveSourceEvidenceCache(input);
let referenceReplacer: ReferenceReplacer = replaceGasFlareReference;
let candidateReader: CandidateReader = getGasFlareReferenceCandidates;

async function hydrateReference(): Promise<boolean> {
  try {
    const rows = parseIndiaGasFlareRows(await workbookRowsFetcher());
    if (rows.length === 0) throw new Error("Public gas-flare source contained no valid India rows.");
    const replaced = await referenceReplacer(rows);
    const fetchedAt = new Date();
    try {
      await cacheWriter({
        cacheKey: LOADER_CACHE_KEY, provider: "nasa-firms-gas-flares-world-bank-gfmr", payload: JSON.stringify({ rowCount: replaced.rowCount, dataYear: SOURCE_DATA_YEAR }), fetchedAt,
        expiresAt: new Date(fetchedAt.getTime() + CACHE_TTL_MS),
      });
    } catch { /* A cache-write failure cannot invalidate a complete atomic reference replacement. */ }
    return true;
  } catch {
    return false;
  }
}

let hydrationInFlight: Promise<boolean> | undefined;
/** Starts at most one public reference refresh. It does not run in a user lookup path after catalog availability is established. */
export function loadIndiaGasFlareReference() {
  if (!hydrationInFlight) hydrationInFlight = hydrateReference().finally(() => { hydrationInFlight = undefined; });
  return hydrationInFlight;
}

async function catalogIsAvailable() {
  try {
    const cached = await cacheReader(LOADER_CACHE_KEY);
    return Boolean(cached && cached.expiresAt.getTime() > Date.now());
  } catch {
    return false;
  }
}

/** Ensures startup refresh occurs only when the local public reference is absent or stale. */
export async function ensureIndiaGasFlareReference() {
  return await catalogIsAvailable() ? true : loadIndiaGasFlareReference();
}

/** Reads only the locally indexed public reference and exact-filters candidates by distance; it never downloads the source. */
export async function lookupNearestFirmsGasFlare(lat: number, lng: number, radiusKm = DEFAULT_RADIUS_KM): Promise<GasFlareReferenceLookup> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(radiusKm) || radiusKm <= 0) {
    return { state: "unavailable", candidateCount: 0, dataYear: null };
  }
  try {
    const candidates = await candidateReader(lat, lng, radiusKm);
    const nearest = candidates
      .map(candidate => ({ candidate, distanceKm: distanceKm(lat, lng, Number(candidate.latitude), Number(candidate.longitude)) }))
      .filter(item => Number.isFinite(item.distanceKm) && item.distanceKm <= radiusKm)
      .sort((left, right) => left.distanceKm - right.distanceKm)[0];
    const sourceAvailable = nearest !== undefined || await catalogIsAvailable();
    if (!nearest) {
      return { state: sourceAvailable ? "available" : "unavailable", candidateCount: candidates.length, dataYear: sourceAvailable ? SOURCE_DATA_YEAR : null };
    }
    const match: GasFlareReferenceMatch = {
      flareId: nearest.candidate.flareId, latitude: Number(nearest.candidate.latitude), longitude: Number(nearest.candidate.longitude), distanceKm: Number(nearest.distanceKm.toFixed(3)), source: FIRMS_GAS_FLARE_REFERENCE_SOURCE,
      sourceDataYear: nearest.candidate.sourceDataYear, fieldType: nearest.candidate.fieldType, fieldName: nearest.candidate.fieldName, operator: nearest.candidate.operator,
      location: nearest.candidate.location, latestAnnualVolumeMcm: nearest.candidate.latestAnnualVolumeMcm === null ? null : Number(nearest.candidate.latestAnnualVolumeMcm),
    };
    const fetchedAt = new Date();
    try {
      await cacheWriter({ cacheKey: pointCacheKey(lat, lng, radiusKm), provider: "nasa-firms-gas-flares-reference", payload: JSON.stringify(match), fetchedAt, expiresAt: new Date(fetchedAt.getTime() + CACHE_TTL_MS) });
    } catch { /* The local indexed match remains valid when a point-cache write fails. */ }
    return { state: "available", candidateCount: candidates.length, dataYear: match.sourceDataYear, match };
  } catch {
    try {
      const cached = await cacheReader(pointCacheKey(lat, lng, radiusKm));
      const match = cached && cached.expiresAt.getTime() > Date.now() ? parseCachedMatch(cached.payload) : undefined;
      return match ? { state: "cached", candidateCount: 1, dataYear: match.sourceDataYear, match } : { state: "unavailable", candidateCount: 0, dataYear: null };
    } catch {
      return { state: "unavailable", candidateCount: 0, dataYear: null };
    }
  }
}

/** Deterministic seams for parser, local lookup, source failure, and cache-fallback tests. */
export function setGasFlareReferenceForTests(overrides?: {
  fetchRows?: WorkbookRowsFetcher;
  readCache?: (key: string) => Promise<CacheRecord | undefined>;
  writeCache?: (input: { cacheKey: string; provider: string; payload: string; fetchedAt: Date; expiresAt: Date }) => Promise<void>;
  replace?: ReferenceReplacer;
  candidates?: CandidateReader;
}) {
  workbookRowsFetcher = overrides?.fetchRows ?? readPublicWorkbookRows;
  cacheReader = overrides?.readCache ?? (key => getSourceEvidenceCache(key));
  cacheWriter = overrides?.writeCache ?? (input => saveSourceEvidenceCache(input));
  referenceReplacer = overrides?.replace ?? replaceGasFlareReference;
  candidateReader = overrides?.candidates ?? getGasFlareReferenceCandidates;
  hydrationInFlight = undefined;
}
