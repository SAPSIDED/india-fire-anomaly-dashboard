/**
 * LIVE CORROBORATION — resilient, evidence-first ingestion for the industrial-fire verifier.
 * Live sources are retried within a strict budget, OSM uses fallback hosts, and only successful responses are cached.
 * Cached evidence is labelled with its timestamp and cannot become a live fire confirmation.
 */
import { setDefaultResultOrder } from "node:dns";
import { classifyCorroborationEvidence } from "./classification";
import { getActiveIncidentEvidence, getLongTermPersistence, getSourceEvidenceCache, recordDetectionHistory, saveSourceEvidenceCache, type DetectionHistoryInput, type IndiaHotspotSnapshotInput, type IndiaHotspotSnapshotSource } from "./db";
import { fetchLandCover, type LandCoverResult } from "./landcover";
import { lookupNearestGppdPlant, type GppdPlantReference } from "./gppdReference";
import { assessFacilitySignals, type FacilitySignals } from "./facilityReference";
import { makeRequest, type PlacesSearchResult } from "./_core/map";

// Some scientific-data hosts are intermittently unreachable over IPv6 from cloud runtimes.
// Prefer IPv4 without reducing the source's TLS or request-validation requirements.
setDefaultResultOrder("ipv4first");

export type SourceState = "available" | "cached" | "unavailable";

type BaseEvidence = {
  state: SourceState;
  detail: string;
  checkedAt: string;
  provider: string;
};

type DailyDetection = { date: string; detections: number };
type FirmsEvidence = BaseEvidence & { detections: number; dailyDetections: DailyDetection[] };
type IndustrialEvidence = BaseEvidence & {
  features: number;
  industrialFacilityName: string | null;
  industrialFacilityType: string | null;
  industrialFacilityCategory: "refinery" | "power_plant" | "steel" | "lng_terminal" | "mining" | "agricultural_zone" | null;
  industrialFacilityLatitude: number | null;
  industrialFacilityLongitude: number | null;
  industrialFacilityDistanceM: number | null;
  industrialFacilityOsmUrl: string | null;
};
type WeatherEvidence = BaseEvidence;
export type AuthorityIncidentSummary = {
  id: number;
  sourceType: "authority" | "facility";
  sourceName: string;
  incidentReference: string;
  reportedAt: string;
  verifiedAt: string;
};
type AuthorityIncidentEvidence = BaseEvidence & { records: AuthorityIncidentSummary[] };

type CacheRecord<T> = { value: T; fetchedAt: Date; expiresAt: Date };

const REQUEST_TIMEOUT_MS = 12_000;
const RETRY_DELAYS_MS = [0, 300];
const FIRMS_DETECTION_PREFERENCE_MS = 6_000;
let liveEvidenceWindowMs = 27_000;
const memoryCache = new Map<string, CacheRecord<unknown>>();
let persistEvidenceCacheWrites = process.env.VITEST !== "true";
let authorityEvidenceTestOverride: AuthorityIncidentSummary[] | undefined;
let detectionHistoryRecorder = recordDetectionHistory;
let longTermPersistenceReader = getLongTermPersistence;
let landCoverFetcher = fetchLandCover;
let gppdReferenceLookup = lookupNearestGppdPlant;
let facilitySignalLookup = assessFacilitySignals;
const FIRMS_RELAY_BASE_URL = (process.env.FIRMS_RELAY_BASE_URL ?? "https://fireguard-firms-relay.fireguard-2cddbeab.workers.dev").replace(/\/+$/, "");

function nowIso() {
  return new Date().toISOString();
}

function bboxFor(lat: number, lng: number, delta = 0.055) {
  return [lng - delta, lat - delta, lng + delta, lat + delta].map(value => value.toFixed(4)).join(",");
}

function cacheKey(provider: string, lat: number, lng: number, days?: number) {
  return `${provider}:${lat.toFixed(3)}:${lng.toFixed(3)}${days ? `:${days}` : ""}`;
}

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const radians = (value: number) => value * Math.PI / 180;
  const dLat = radians(bLat - aLat);
  const dLng = radians(bLng - aLng);
  const startLat = radians(aLat);
  const endLat = radians(bLat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(startLat) * Math.cos(endLat) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

type OverpassIndustrialFeature = {
  type?: "node" | "way" | "relation" | string;
  id?: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string | undefined>;
};

function emptyIndustrialFacility() {
  return { industrialFacilityName: null, industrialFacilityType: null, industrialFacilityCategory: null, industrialFacilityLatitude: null, industrialFacilityLongitude: null, industrialFacilityDistanceM: null, industrialFacilityOsmUrl: null };
}

function industrialFacilityType(tags: Record<string, string | undefined>) {
  if (tags.man_made === "works") return "man_made=works";
  if (tags.man_made === "mine") return "man_made=mine";
  if (tags.power === "plant") return "power=plant";
  if (tags.landuse === "industrial") return "landuse=industrial";
  if (tags.landuse === "quarry") return "landuse=quarry";
  if (tags.industrial) return `industrial=${tags.industrial}`;
  if (tags.landuse === "farmland") return "landuse=farmland";
  return null;
}

function isExistingIndustrialContext(tags: Record<string, string | undefined>) {
  return tags.landuse === "industrial" || tags.man_made === "works" || Boolean(tags.industrial) || tags.power === "plant";
}

function industrialFacilityCategory(tags: Record<string, string | undefined>): IndustrialEvidence["industrialFacilityCategory"] {
  const searchable = Object.entries(tags).flatMap(([key, value]) => [key, value ?? ""]).join(" ").toLowerCase();
  if (/\brefiner(?:y|ies)\b|petroleum refinery/.test(searchable)) return "refinery";
  if (/\blng(?:\b|_)|liquefied natural gas/.test(searchable)) return "lng_terminal";
  if (/\bsteel\b|iron and steel/.test(searchable)) return "steel";
  if (tags.man_made === "mine" || tags.landuse === "quarry" || /\bmin(?:e|ing)\b|quarry/.test(searchable)) return "mining";
  if (tags.landuse === "farmland" || /\bagricultur(?:e|al)\b|crop|farm/.test(searchable)) return "agricultural_zone";
  if (tags.power === "plant") return "power_plant";
  return null;
}

/** Reads the nearest returned OSM feature centre/node only; it does not change the existing 5 km count. */
export function nearestIndustrialFacility(lat: number, lng: number, elements: OverpassIndustrialFeature[]) {
  const nearest = elements.flatMap(element => {
    const featureLat = Number(element.lat ?? element.center?.lat);
    const featureLng = Number(element.lon ?? element.center?.lon);
    const tags = element.tags ?? {};
    const type = industrialFacilityType(tags);
    if (!Number.isFinite(featureLat) || !Number.isFinite(featureLng) || !type) return [];
    return [{
      name: tags.name ?? tags["name:en"] ?? null,
      type,
      category: industrialFacilityCategory(tags),
      latitude: featureLat,
      longitude: featureLng,
      distanceM: haversineKm(lat, lng, featureLat, featureLng) * 1000,
      osmUrl: ["node", "way", "relation"].includes(element.type ?? "") && Number.isInteger(element.id)
        ? `https://www.openstreetmap.org/${element.type}/${element.id}`
        : null,
    }];
  }).sort((left, right) => left.distanceM - right.distanceM)[0];
  return nearest
    ? { industrialFacilityName: nearest.name, industrialFacilityType: nearest.type, industrialFacilityCategory: nearest.category, industrialFacilityLatitude: nearest.latitude, industrialFacilityLongitude: nearest.longitude, industrialFacilityDistanceM: Number(nearest.distanceM.toFixed(1)), industrialFacilityOsmUrl: nearest.osmUrl }
    : emptyIndustrialFacility();
}

function cachedIndustrialFacility(value: Partial<IndustrialEvidence>) {
  return {
    industrialFacilityName: value.industrialFacilityName ?? null,
    industrialFacilityType: value.industrialFacilityType ?? null,
    industrialFacilityCategory: value.industrialFacilityCategory ?? null,
    industrialFacilityLatitude: value.industrialFacilityLatitude ?? null,
    industrialFacilityLongitude: value.industrialFacilityLongitude ?? null,
    industrialFacilityDistanceM: value.industrialFacilityDistanceM ?? null,
    industrialFacilityOsmUrl: value.industrialFacilityOsmUrl ?? null,
  };
}

function parseFirmsRows(csv: string, lat?: number, lng?: number) {
  const lines = csv.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return 0;
  const header = lines[0].split(",").map(value => value.trim().toLowerCase());
  const latIndex = header.indexOf("latitude");
  const lngIndex = header.indexOf("longitude");
  if (lat === undefined || lng === undefined || latIndex < 0 || lngIndex < 0) return lines.length - 1;
  return lines.slice(1).filter(line => {
    const values = line.split(",");
    const candidateLat = Number(values[latIndex]);
    const candidateLng = Number(values[lngIndex]);
    return Number.isFinite(candidateLat) && Number.isFinite(candidateLng) && haversineKm(lat, lng, candidateLat, candidateLng) <= 8;
  }).length;
}

function parseFirmsDailyDetections(csv: string, lat?: number, lng?: number): DailyDetection[] {
  const lines = csv.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map(value => value.trim().toLowerCase());
  const latIndex = header.indexOf("latitude");
  const lngIndex = header.indexOf("longitude");
  const dateIndex = header.indexOf("acq_date");
  if (dateIndex < 0) return [];
  const buckets = new Map<string, number>();
  for (const line of lines.slice(1)) {
    const values = line.split(",");
    const date = values[dateIndex]?.trim();
    if (!date) continue;
    if (lat !== undefined && lng !== undefined && latIndex >= 0 && lngIndex >= 0) {
      const candidateLat = Number(values[latIndex]);
      const candidateLng = Number(values[lngIndex]);
      if (!Number.isFinite(candidateLat) || !Number.isFinite(candidateLng) || haversineKm(lat, lng, candidateLat, candidateLng) > 8) continue;
    }
    buckets.set(date, (buckets.get(date) ?? 0) + 1);
  }
  return Array.from(buckets, ([date, detections]) => ({ date, detections })).sort((a, b) => a.date.localeCompare(b.date));
}

/** Extracts only returned FIRMS row fields needed for additive local history storage. */
function parseFirmsDetectionHistoryRows(csv: string, lat?: number, lng?: number): DetectionHistoryInput[] {
  const lines = csv.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map(value => value.trim().toLowerCase());
  const latIndex = header.indexOf("latitude");
  const lngIndex = header.indexOf("longitude");
  const dateIndex = header.indexOf("acq_date");
  const brightnessIndex = ["bright_ti4", "brightness", "bright_t31"].map(field => header.indexOf(field)).find(index => index >= 0) ?? -1;
  const confidenceIndex = header.indexOf("confidence");
  if (latIndex < 0 || lngIndex < 0 || dateIndex < 0) return [];
  return lines.slice(1).flatMap(line => {
    const values = line.split(",");
    const detectionLat = Number(values[latIndex]);
    const detectionLng = Number(values[lngIndex]);
    const detectionDate = values[dateIndex]?.trim();
    if (!Number.isFinite(detectionLat) || !Number.isFinite(detectionLng) || !detectionDate) return [];
    if (lat !== undefined && lng !== undefined && haversineKm(lat, lng, detectionLat, detectionLng) > 8) return [];
    const rawBrightness = brightnessIndex >= 0 ? values[brightnessIndex]?.trim() : undefined;
    const brightness = rawBrightness && Number.isFinite(Number(rawBrightness)) ? rawBrightness : null;
    const confidence = confidenceIndex >= 0 ? values[confidenceIndex]?.trim() || null : null;
    return [{ latitude: detectionLat.toFixed(6), longitude: detectionLng.toFixed(6), detectionDate, brightness, confidence }];
  });
}

async function wait(ms: number) {
  if (ms > 0) await new Promise(resolve => setTimeout(resolve, ms));
}

async function requestWithRetry(url: string, init?: RequestInit) {
  let lastError: unknown;
  for (const delay of RETRY_DELAYS_MS) {
    await wait(delay);
    try {
      const response = await fetch(url, {
        ...init,
        headers: {
          "User-Agent": "IndiaFireAnomalyIntelligence/1.0 (research-verifier)",
          Accept: "text/csv, application/json;q=0.9, */*;q=0.1",
          ...init?.headers,
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (response.ok) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Upstream request failed.");
}

type FirmsFetchPayload = {
  detections: number;
  dailyDetections: DailyDetection[];
  historyRows: DetectionHistoryInput[];
};

type FirmsSensor = "VIIRS_NOAA20_NRT" | "VIIRS_NOAA21_NRT";

function firmsCountryUrl(sensor: FirmsSensor, days: number) {
  return `${FIRMS_RELAY_BASE_URL}/api/country/csv/${sensor}/IND/${days}`;
}

/** Parses the country-wide CSV returned by the existing authenticated FIRMS country route for the map snapshot. */
function parseIndiaHotspotSnapshotRows(csv: string): IndiaHotspotSnapshotInput[] {
  const lines = csv.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map(value => value.trim().toLowerCase());
  const latitudeIndex = header.indexOf("latitude");
  const longitudeIndex = header.indexOf("longitude");
  const acquiredDateIndex = header.indexOf("acq_date");
  const acquiredTimeIndex = header.indexOf("acq_time");
  const brightnessIndex = ["bright_ti4", "brightness", "bright_t31"].map(field => header.indexOf(field)).find(index => index >= 0) ?? -1;
  const confidenceIndex = header.indexOf("confidence");
  if (latitudeIndex < 0 || longitudeIndex < 0 || acquiredDateIndex < 0) return [];
  return lines.slice(1).flatMap(line => {
    const values = line.split(",");
    const latitude = Number(values[latitudeIndex]);
    const longitude = Number(values[longitudeIndex]);
    const acquiredDate = values[acquiredDateIndex]?.trim();
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !acquiredDate) return [];
    const rawBrightness = brightnessIndex >= 0 ? values[brightnessIndex]?.trim() : undefined;
    const brightness = rawBrightness && Number.isFinite(Number(rawBrightness)) ? rawBrightness : null;
    const confidence = confidenceIndex >= 0 ? values[confidenceIndex]?.trim() || null : null;
    const acquiredTime = acquiredTimeIndex >= 0 ? values[acquiredTimeIndex]?.trim() || null : null;
    return [{ latitude: latitude.toFixed(6), longitude: longitude.toFixed(6), brightness, confidence, acquiredDate, acquiredTime }];
  });
}

/** Reuses the existing secured country FIRMS route for the current India-wide hotspot snapshot. */
async function fetchIndiaCountryRows(): Promise<IndiaHotspotSnapshotInput[]> {
  const mapKey = process.env.NASA_FIRMS_MAP_KEY;
  const relayAuthToken = process.env.FIRMS_RELAY_AUTH_TOKEN ?? mapKey;
  if (!relayAuthToken) throw new Error("The secure FIRMS relay is not configured with backend authentication.");
  const response = await requestWithRetry(firmsCountryUrl("VIIRS_NOAA20_NRT", 1), {
    headers: { Authorization: `Bearer ${relayAuthToken}` },
  });
  const csv = await response.text();
  if (/invalid\s+map[_ ]key|error/i.test(csv)) throw new Error("FIRMS country route rejected the request.");
  return parseIndiaHotspotSnapshotRows(csv);
}

/** Reuses the existing secured official NOAA-20 WFS request shape with only an India-wide bounding box after country-route failure. */
async function fetchIndiaWfsRows(): Promise<IndiaHotspotSnapshotInput[]> {
  const mapKey = process.env.NASA_FIRMS_MAP_KEY;
  const relayAuthToken = process.env.FIRMS_RELAY_AUTH_TOKEN ?? mapKey;
  if (!relayAuthToken) throw new Error("The secure FIRMS relay is not configured with backend authentication.");
  const indiaWfsBbox = "6.0000,68.0000,38.0000,98.0000,urn:ogc:def:crs:EPSG::4326";
  const wfsUrl = `${FIRMS_RELAY_BASE_URL}/mapserver/wfs/Russia_Asia/?SERVICE=WFS&REQUEST=GetFeature&VERSION=2.0.0&TYPENAME=ms:fires_noaa20_24hrs&STARTINDEX=0&COUNT=1000&SRSNAME=urn:ogc:def:crs:EPSG::4326&BBOX=${encodeURIComponent(indiaWfsBbox)}&outputformat=csv`;
  const response = await requestWithRetry(wfsUrl, { headers: { Authorization: `Bearer ${relayAuthToken}` } });
  const csv = await response.text();
  if (/serviceexception|error/i.test(csv)) throw new Error("FIRMS WFS route rejected the request.");
  return parseIndiaHotspotSnapshotRows(csv);
}

export type IndiaFirmsSnapshotFetch = { rows: IndiaHotspotSnapshotInput[]; source: IndiaHotspotSnapshotSource };

/** Uses the existing official country route first and only then the explicitly approved official WFS India-bounds fallback. */
export async function fetchIndiaCountryFirmsSnapshot(): Promise<IndiaFirmsSnapshotFetch> {
  try {
    return { rows: await fetchIndiaCountryRows(), source: "firms-country" };
  } catch (countryError) {
    try {
      return { rows: await fetchIndiaWfsRows(), source: "firms-wfs-india-fallback" };
    } catch (wfsError) {
      throw new Error(`FIRMS country route failed (${countryError instanceof Error ? countryError.message : "unknown"}); approved WFS fallback also failed (${wfsError instanceof Error ? wfsError.message : "unknown"}).`);
    }
  }
}

/** Selects a positive local reading as soon as one arrives, but bounds the wait behind an early zero-row response. */
function preferDetectedFirmsResponse(requests: Array<Promise<FirmsFetchPayload>>) {
  return new Promise<FirmsFetchPayload>((resolve, reject) => {
    let pending = requests.length;
    let firstZeroRowResponse: FirmsFetchPayload | undefined;
    let settled = false;
    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(preferenceTimer);
      callback();
    };
    const preferenceTimer = setTimeout(() => {
      const fallback = firstZeroRowResponse;
      if (fallback) settle(() => resolve(fallback));
    }, FIRMS_DETECTION_PREFERENCE_MS);

    for (const request of requests) {
      request.then(response => {
        if (settled) return;
        if (response.detections > 0) {
          settle(() => resolve(response));
          return;
        }
        firstZeroRowResponse ??= response;
        pending -= 1;
        if (pending === 0) settle(() => resolve(firstZeroRowResponse!));
      }).catch(() => {
        if (settled) return;
        pending -= 1;
        if (pending === 0) {
          const fallback = firstZeroRowResponse;
          if (fallback) settle(() => resolve(fallback));
          else settle(() => reject(new Error("All official FIRMS routes failed.")));
        }
      });
    }
  });
}

async function readCached<T>(key: string): Promise<CacheRecord<T> | undefined> {
  const memory = memoryCache.get(key) as CacheRecord<T> | undefined;
  if (memory && memory.expiresAt.getTime() > Date.now()) return memory;
  try {
    const persisted = await getSourceEvidenceCache(key);
    if (!persisted || persisted.expiresAt.getTime() <= Date.now()) return undefined;
    const record = { value: JSON.parse(persisted.payload) as T, fetchedAt: persisted.fetchedAt, expiresAt: persisted.expiresAt };
    memoryCache.set(key, record);
    return record;
  } catch {
    return undefined;
  }
}

async function writeCached<T>(key: string, provider: string, value: T, ttlMs: number) {
  const fetchedAt = new Date();
  const expiresAt = new Date(fetchedAt.getTime() + ttlMs);
  const record = { value, fetchedAt, expiresAt };
  memoryCache.set(key, record);
  if (persistEvidenceCacheWrites) {
    try {
      await saveSourceEvidenceCache({ cacheKey: key, provider, payload: JSON.stringify(value), fetchedAt, expiresAt });
    } catch {
      // In-memory cache still protects the current instance when a database write is temporarily unavailable.
    }
  }
  return record;
}

function cacheSuffix(record: CacheRecord<unknown>) {
  return ` Last verified ${record.fetchedAt.toISOString().replace("T", " ").slice(0, 16)} UTC.`;
}

async function fetchFirms(lat: number, lng: number, days: number, sensor: FirmsSensor, label: string): Promise<FirmsEvidence> {
  const provider = `firms-${sensor.toLowerCase()}`;
  const key = cacheKey(provider, lat, lng, days);
  const mapKey = process.env.NASA_FIRMS_MAP_KEY;
  const relayAuthToken = process.env.FIRMS_RELAY_AUTH_TOKEN ?? mapKey;
  const checkedAt = nowIso();
  if (!relayAuthToken) return { state: "unavailable", detections: 0, dailyDetections: [], provider, checkedAt, detail: `The secure FIRMS relay is not configured with backend authentication.` };

  const areaUrl = `${FIRMS_RELAY_BASE_URL}/api/area/csv/${sensor}/${bboxFor(lat, lng)}/${days}`;
  const countryUrl = firmsCountryUrl(sensor, days);
  const wfsSensor = sensor === "VIIRS_NOAA21_NRT" ? "noaa21" : "noaa20";
  const wfsPeriod = days >= 7 ? "7days" : "24hrs";
  const wfsBbox = `${(lat - 0.055).toFixed(4)},${(lng - 0.055).toFixed(4)},${(lat + 0.055).toFixed(4)},${(lng + 0.055).toFixed(4)},urn:ogc:def:crs:EPSG::4326`;
  const wfsUrl = `${FIRMS_RELAY_BASE_URL}/mapserver/wfs/Russia_Asia/?SERVICE=WFS&REQUEST=GetFeature&VERSION=2.0.0&TYPENAME=ms:fires_${wfsSensor}_${wfsPeriod}&STARTINDEX=0&COUNT=1000&SRSNAME=urn:ogc:def:crs:EPSG::4326&BBOX=${encodeURIComponent(wfsBbox)}&outputformat=csv`;
  try {
    const evidence = await preferDetectedFirmsResponse([
      requestWithRetry(areaUrl, { headers: { Authorization: `Bearer ${relayAuthToken}` } }).then(async response => {
        const csv = await response.text();
        if (/invalid\s+map[_ ]key|error/i.test(csv)) throw new Error("FIRMS area route rejected the request.");
        return { detections: parseFirmsRows(csv), dailyDetections: days > 1 ? parseFirmsDailyDetections(csv) : [], historyRows: parseFirmsDetectionHistoryRows(csv) };
      }),
      requestWithRetry(countryUrl, { headers: { Authorization: `Bearer ${relayAuthToken}` } }).then(async response => {
        const csv = await response.text();
        if (/invalid\s+map[_ ]key|error/i.test(csv)) throw new Error("FIRMS country route rejected the request.");
        return { detections: parseFirmsRows(csv, lat, lng), dailyDetections: days > 1 ? parseFirmsDailyDetections(csv, lat, lng) : [], historyRows: parseFirmsDetectionHistoryRows(csv, lat, lng) };
      }),
      requestWithRetry(wfsUrl, { headers: { Authorization: `Bearer ${relayAuthToken}` } }).then(async response => {
        const csv = await response.text();
        if (/invalid\s+map[_ ]key|serviceexception|error/i.test(csv)) throw new Error("FIRMS WFS route rejected the request.");
        return { detections: parseFirmsRows(csv, lat, lng), dailyDetections: days > 1 ? parseFirmsDailyDetections(csv, lat, lng) : [], historyRows: parseFirmsDetectionHistoryRows(csv, lat, lng) };
      }),
    ]);
    try {
      await detectionHistoryRecorder(evidence.historyRows);
    } catch {
      // Persistence must not block the existing live corroboration response.
    }
    await writeCached(key, provider, evidence, days === 1 ? 20 * 60_000 : 6 * 60 * 60_000);
    return {
      state: "available", detections: evidence.detections, dailyDetections: evidence.dailyDetections, provider, checkedAt,
      detail: evidence.detections > 0
        ? `${evidence.detections} live NASA FIRMS ${label} detections in the local ${days}-day window.`
        : `No live NASA FIRMS ${label} detections in the local ${days}-day window.`,
    };
  } catch {
    const cached = await readCached<{ detections: number; dailyDetections?: DailyDetection[] }>(key);
    if (cached) {
      return {
        state: "cached", detections: cached.value.detections, dailyDetections: cached.value.dailyDetections ?? [], provider, checkedAt,
        detail: `${cached.value.detections} previously verified NASA FIRMS ${label} detections are shown while the live response is delayed.${cacheSuffix(cached)}`,
      };
    }
    return {
        state: "unavailable", detections: 0, dailyDetections: [], provider, checkedAt,
        detail: `The permanent FIRMS relay could not retrieve NASA ${label} data after bounded Area API, India route, and WFS retries. No verified cached reading is available.`,
    };
  }
}

async function fetchIndustrialContext(lat: number, lng: number): Promise<IndustrialEvidence> {
  const provider = "osm-overpass";
  const key = cacheKey(provider, lat, lng);
  const checkedAt = nowIso();
  const query = `[out:json][timeout:12];(way(around:5000,${lat},${lng})["landuse"="industrial"];way(around:5000,${lat},${lng})["man_made"="works"];way(around:5000,${lat},${lng})["man_made"="mine"];way(around:5000,${lat},${lng})["landuse"="quarry"];way(around:5000,${lat},${lng})["industrial"];way(around:5000,${lat},${lng})["power"="plant"];node(around:5000,${lat},${lng})["man_made"="works"];node(around:5000,${lat},${lng})["man_made"="mine"];node(around:5000,${lat},${lng})["power"="plant"];node(around:5000,${lat},${lng})["landuse"="farmland"];way(around:5000,${lat},${lng})["landuse"="farmland"];);out center tags;`;
  const hosts = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"];
  try {
    const data = await Promise.any(hosts.map(async host => {
      const response = await requestWithRetry(host, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: new URLSearchParams({ data: query }),
      });
      return response.json() as Promise<{ elements?: OverpassIndustrialFeature[] }>;
    }));
    const elements = data.elements ?? [];
    // Preserve the original count for the established industrial query, including
    // legacy/tag-sparse responses; farmland was added only for additive context.
    const features = elements.filter(element => !element.tags || isExistingIndustrialContext(element.tags)).length;
    const nearestFacility = nearestIndustrialFacility(lat, lng, elements);
    await writeCached(key, provider, { features, ...nearestFacility }, 7 * 24 * 60 * 60_000);
    return {
      state: "available", features, provider, checkedAt, ...nearestFacility,
      detail: features > 0 ? `${features} live nearby OSM industrial-context features found within 5 km.` : "No live nearby OSM industrial-context feature was returned within 5 km.",
    };
  } catch {
    const placesKey = cacheKey("google-places-industrial", lat, lng);
    try {
      const places = await makeRequest<PlacesSearchResult>("/maps/api/place/nearbysearch/json", {
        location: `${lat},${lng}`,
        radius: 5000,
        keyword: "industrial factory manufacturing",
      });
      const features = places.results?.filter(place => place.business_status !== "CLOSED_PERMANENTLY").length ?? 0;
      await writeCached(placesKey, "google-places-industrial", { features, ...emptyIndustrialFacility() }, 24 * 60 * 60_000);
      return {
        state: "available", features, provider: "google-places-industrial", checkedAt, ...emptyIndustrialFacility(),
        detail: features > 0
          ? `${features} live Google Places industrial/factory context records found within 5 km after OSM mirrors were unavailable.`
          : "Google Places returned no operational industrial/factory context record within 5 km after OSM mirrors were unavailable.",
      };
    } catch {
      const googleCached = await readCached<Partial<IndustrialEvidence> & { features: number }>(placesKey);
      if (googleCached) {
        return {
          state: "cached", features: googleCached.value.features, provider: "google-places-industrial", checkedAt, ...cachedIndustrialFacility(googleCached.value),
          detail: `${googleCached.value.features} previously verified Google Places industrial/factory context records are shown while OSM mirrors are delayed.${cacheSuffix(googleCached)}`,
        };
      }
    }
    const cached = await readCached<Partial<IndustrialEvidence> & { features: number }>(key);
    if (cached) {
      return {
        state: "cached", features: cached.value.features, provider, checkedAt, ...cachedIndustrialFacility(cached.value),
        detail: `${cached.value.features} previously verified OSM industrial-context features are shown while all live mirrors are delayed.${cacheSuffix(cached)}`,
      };
    }
    return {
      state: "unavailable", features: 0, provider, checkedAt, ...emptyIndustrialFacility(),
        detail: "OSM industrial context did not respond after bounded retries across three Overpass mirrors, and the independent Google Places facility fallback was unavailable. No verified cached context is available.",
    };
  }
}

async function fetchWeather(lat: number, lng: number): Promise<WeatherEvidence> {
  const provider = "open-meteo";
  const checkedAt = nowIso();
  try {
    const query = new URLSearchParams({ latitude: lat.toString(), longitude: lng.toString(), current: "temperature_2m,wind_speed_10m,wind_direction_10m,precipitation,weather_code" });
    const response = await requestWithRetry(`https://api.open-meteo.com/v1/forecast?${query}`);
    const data = await response.json() as { current?: { temperature_2m?: number; wind_speed_10m?: number; wind_direction_10m?: number; precipitation?: number } };
    const current = data.current;
    if (!current) throw new Error("Weather payload missing current conditions.");
    return { state: "available", provider, checkedAt, detail: `${current.temperature_2m ?? "–"}°C · wind ${current.wind_speed_10m ?? "–"} km/h at ${current.wind_direction_10m ?? "–"}° · precipitation ${current.precipitation ?? "–"} mm.` };
  } catch {
    return { state: "unavailable", provider, checkedAt, detail: "Weather context did not respond within the retry budget." };
  }
}

async function fetchAuthorityIncidentEvidence(input: { detectionId: string; lat: number; lng: number }): Promise<AuthorityIncidentEvidence> {
  const checkedAt = nowIso();
  try {
    let summaries: AuthorityIncidentSummary[];
    if (authorityEvidenceTestOverride) {
      summaries = authorityEvidenceTestOverride;
    } else {
      const records = await getActiveIncidentEvidence(input.detectionId, input.lat, input.lng);
      if (records === undefined) {
        return {
          state: "unavailable", records: [], provider: "fireguard-incident-ledger", checkedAt,
          detail: "The controlled authority/facility incident ledger is unavailable. No confirmed-incident verdict can be issued.",
        };
      }
      summaries = records.map(record => ({
        id: record.id,
        sourceType: record.sourceType,
        sourceName: record.sourceName,
        incidentReference: record.incidentReference,
        reportedAt: record.reportedAt.toISOString(),
        verifiedAt: record.createdAt.toISOString(),
      }));
    }
    return {
      state: "available", records: summaries, provider: "fireguard-incident-ledger", checkedAt,
      detail: summaries.length > 0
        ? `${summaries.length} time-aligned, administrator-reviewed ${summaries.length === 1 ? "incident record is" : "incident records are"} linked to an external ${summaries[0].sourceType} source.`
        : "No time-aligned authority or verified-facility incident record is linked to this detection.",
    };
  } catch {
    return {
      state: "unavailable", records: [], provider: "fireguard-incident-ledger", checkedAt,
      detail: "The controlled authority/facility incident ledger could not be read. No confirmed-incident verdict can be issued.",
    };
  }
}

function pendingFirms(provider: string, checkedAt: string): FirmsEvidence {
  return { state: "unavailable", detections: 0, dailyDetections: [], provider, checkedAt, detail: "The source did not return within the live evidence window. It has been marked pending; no result has been inferred." };
}

function pendingIndustrial(checkedAt: string): IndustrialEvidence {
  return { state: "unavailable", features: 0, provider: "osm-overpass", checkedAt, ...emptyIndustrialFacility(), detail: "The industrial-context source did not return within the live evidence window. It has been marked pending." };
}

function pendingWeather(checkedAt: string): WeatherEvidence {
  return { state: "unavailable", provider: "open-meteo", checkedAt, detail: "Weather context did not return within the live evidence window." };
}

export async function evaluateCorroboration(input: { lat: number; lng: number; detectionId: string }) {
  const authorityIncidentEvidence = fetchAuthorityIncidentEvidence(input);
  let landCover: LandCoverResult | undefined;
  void landCoverFetcher(input.lat, input.lng).then(result => { landCover = result; }).catch(() => undefined);
  let gppdReference: GppdPlantReference | undefined;
  void gppdReferenceLookup(input.lat, input.lng).then(result => { gppdReference = result; }).catch(() => undefined);
  let facilitySignals: FacilitySignals | undefined;
  const facilitySignalsInput = (industrial: IndustrialEvidence) => ({ lat: input.lat, lng: input.lng, ...industrial, ...(gppdReference ? { gppdReference } : {}) });
  const checks = Promise.all([
    fetchFirms(input.lat, input.lng, 1, "VIIRS_NOAA20_NRT", "NOAA-20"),
    fetchFirms(input.lat, input.lng, 7, "VIIRS_NOAA20_NRT", "NOAA-20"),
    fetchFirms(input.lat, input.lng, 1, "VIIRS_NOAA21_NRT", "NOAA-21"),
    fetchIndustrialContext(input.lat, input.lng),
    fetchWeather(input.lat, input.lng),
  ]);
  const timedOut = await Promise.race([
    checks.then(() => false),
    new Promise<true>(resolve => setTimeout(() => resolve(true), liveEvidenceWindowMs)),
  ]);
  const checkedAt = nowIso();
  if (timedOut) {
    const firmsCurrent = pendingFirms("firms-viirs_noaa20_nrt", checkedAt);
    const firmsHistory = pendingFirms("firms-viirs_noaa20_nrt", checkedAt);
    const firmsIndependentCurrent = pendingFirms("firms-viirs_noaa21_nrt", checkedAt);
    const industrial = pendingIndustrial(checkedAt);
    const weather = pendingWeather(checkedAt);
    const incidentEvidence = await authorityIncidentEvidence;
    const longTermHistory = await longTermPersistenceReader(input.lat, input.lng);
    const classification = classifyCorroborationEvidence({
      industrialFeatures: industrial.features,
      industrialState: industrial.state,
      historyDailyDetections: firmsHistory.dailyDetections,
      historyState: firmsHistory.state,
      landCoverClass: landCover?.landCoverClass ?? null,
      longTermHistory: longTermHistory.state === "available" ? { totalDetectionCount: longTermHistory.totalDetectionCount, activeMonths: longTermHistory.activeMonths } : null,
    });
    return {
      detectionId: input.detectionId, checkedAt, sourcesRunInParallel: true,
      firmsCurrent, firmsHistory, firmsIndependentCurrent, industrial, weather, incidentEvidence, classification, longTermHistory,
      flareMatch: false, flareMatchConfidence: "none" as const, miningMatch: false, vnfState: "unavailable" as const, vnfCandidateCount: 0,
      ...(landCover ? { landCover } : {}),
      ...(gppdReference ? { gppdReference } : {}),
      independentCorroboration: { state: "evidence_pending", detail: "The live evidence window closed before all sources responded. The screen remains operational and no industrial-fire conclusion has been issued." },
      conclusion: { level: "evidence_pending" as const, title: "Evidence pending — sources still delayed", detail: "The verifier closed the 27-second live request window to keep the investigation usable. It will not convert a delayed upstream response into a fire conclusion." },
    };
  }
  const [firmsCurrent, firmsHistory, firmsIndependentCurrent, industrial, weather] = await checks;
  // This optional source must never delay the established corroboration flow.
  // It can contribute only when the bounded lookup settles during existing work.
  void facilitySignalLookup(facilitySignalsInput(industrial)).then(result => { facilitySignals = result; }).catch(() => undefined);
  const incidentEvidence = await authorityIncidentEvidence;
  const longTermHistory = await longTermPersistenceReader(input.lat, input.lng);
  const classification = classifyCorroborationEvidence({
    industrialFeatures: industrial.features,
    industrialState: industrial.state,
    historyDailyDetections: firmsHistory.dailyDetections,
    historyState: firmsHistory.state,
    landCoverClass: landCover?.landCoverClass ?? null,
    longTermHistory: longTermHistory.state === "available" ? { totalDetectionCount: longTermHistory.totalDetectionCount, activeMonths: longTermHistory.activeMonths } : null,
  });

  const hasOnlyLiveCore = [firmsCurrent, firmsIndependentCurrent, industrial].every(source => source.state === "available");
  const persistent = firmsHistory.state === "available" && firmsHistory.detections >= 5;
  const crossPlatformMatch = firmsCurrent.state === "available" && firmsIndependentCurrent.state === "available" && firmsCurrent.detections > 0 && firmsIndependentCurrent.detections > 0;
  const hasCache = [firmsCurrent, firmsHistory, firmsIndependentCurrent, industrial].some(source => source.state === "cached");

  const hasAuthorityIncident = incidentEvidence.state === "available" && incidentEvidence.records.length > 0;
  let conclusion: { level: "evidence_pending" | "no_current_detection" | "routine_heat" | "candidate" | "confirmed_incident"; title: string; detail: string };
  if (firmsCurrent.state === "unavailable" || firmsIndependentCurrent.state === "unavailable" || industrial.state === "unavailable") {
    conclusion = { level: "evidence_pending", title: "Evidence pending — live source delayed", detail: "The verifier is still operational, but a required live source did not answer within its retry budget. It has not inferred an industrial fire from missing data." };
  } else if (hasCache) {
    conclusion = { level: "evidence_pending", title: "Evidence pending — cached context shown", detail: "Some upstream evidence is cached and timestamped. It may guide review, but a current industrial-fire conclusion is withheld until live satellite evidence returns." };
  } else if (firmsCurrent.detections === 0) {
    conclusion = { level: "no_current_detection", title: "No current FIRMS thermal detection", detail: "The live local one-day FIRMS search found no thermal detection; an industrial-fire conclusion is not supported." };
  } else if (industrial.features === 0) {
    conclusion = { level: "evidence_pending", title: "Industrial context not established", detail: "A live thermal record is present but no nearby industrial feature was returned. The industrial-fire conclusion is withheld." };
  } else if (!crossPlatformMatch) {
    conclusion = { level: "evidence_pending", title: "No cross-platform thermal agreement", detail: "NOAA-20 is not corroborated by the independent SNPP local search window. The industrial-fire conclusion is withheld." };
  } else if (hasAuthorityIncident) {
    const record = incidentEvidence.records[0];
    conclusion = {
      level: "confirmed_incident",
      title: "Confirmed industrial incident — external report recorded",
      detail: `Current paired NOAA-20/NOAA-21 detections and live industrial context are aligned with a time-limited, administrator-reviewed ${record.sourceType} incident record from ${record.sourceName} (${record.incidentReference}).`,
    };
  } else if (persistent) {
    conclusion = { level: "routine_heat", title: "Likely recurring industrial heat", detail: "Live seven-day persistence supports a routine/static heat-source explanation rather than a new incident claim." };
  } else {
    conclusion = { level: "candidate", title: "Screened industrial thermal candidate", detail: "Live NOAA-20 and SNPP detections plus live industrial context are present. This is a prioritised candidate, not confirmation; authority or on-site corroboration is still required." };
  }

  return {
    detectionId: input.detectionId, checkedAt: nowIso(), sourcesRunInParallel: true,
    firmsCurrent, firmsHistory, firmsIndependentCurrent, industrial, weather, incidentEvidence, classification, longTermHistory,
    ...(facilitySignals ?? { flareMatch: false, flareMatchConfidence: "none" as const, miningMatch: false, vnfState: "unavailable" as const, vnfCandidateCount: 0 }),
    ...(landCover ? { landCover } : {}),
    ...(gppdReference ? { gppdReference } : {}),
    independentCorroboration: {
      state: crossPlatformMatch ? "cross_platform_match" : hasOnlyLiveCore ? "no_cross_platform_match" : hasCache ? "cached_evidence" : "evidence_pending",
      detail: crossPlatformMatch
        ? "NOAA-20 and independent NOAA-21 both returned live local detections in the same one-day window. This corroborates a thermal observation, not an on-site fire."
        : hasCache
          ? "At least one source is a timestamped cache fallback; live corroboration remains pending."
          : "Required live sources are incomplete or disagree, so independent corroboration is not established.",
    },
    conclusion,
  };
}

/** Deterministic test-only hook; never surfaced through the public API. */
export function clearEvidenceCacheForTests() {
  memoryCache.clear();
}

/** Deterministic test-only hook; production always starts with the 27-second evidence window. */
export function setLiveEvidenceWindowForTests(windowMs = 27_000) {
  liveEvidenceWindowMs = windowMs;
}

/** Deterministic test-only hook; production keeps cache persistence enabled. */
export function setEvidenceCachePersistenceForTests(enabled = true) {
  persistEvidenceCacheWrites = enabled;
}

/** Deterministic test-only hook; production can only read the controlled ledger. */
export function setAuthorityIncidentEvidenceForTests(records?: AuthorityIncidentSummary[]) {
  authorityEvidenceTestOverride = records;
}

/** Deterministic test-only hook; production always records real returned FIRMS rows. */
export function setDetectionHistoryRecorderForTests(recorder?: typeof recordDetectionHistory) {
  detectionHistoryRecorder = recorder ?? recordDetectionHistory;
}

/** Deterministic test-only hook; production always reads the project database summary. */
export function setLongTermPersistenceReaderForTests(reader?: typeof getLongTermPersistence) {
  longTermPersistenceReader = reader ?? getLongTermPersistence;
}

/** Deterministic test-only hook; production always calls the public land-cover source. */
export function setLandCoverFetcherForTests(fetcher?: typeof fetchLandCover) {
  landCoverFetcher = fetcher ?? fetchLandCover;
}

/** Deterministic test-only hook; production always uses the stored India GPPD reference. */
export function setGppdReferenceLookupForTests(lookup?: typeof lookupNearestGppdPlant) {
  gppdReferenceLookup = lookup ?? lookupNearestGppdPlant;
}

/** Deterministic test-only hook; production uses the bounded failure-safe VNF adapter. */
export function setFacilitySignalLookupForTests(lookup?: typeof assessFacilitySignals) {
  facilitySignalLookup = lookup ?? assessFacilitySignals;
}
