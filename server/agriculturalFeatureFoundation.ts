import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { detectionHistory, gppdReference, seasonalAgriculturalBurningCalendar, seasonalAgriculturalStateGeometry, sourceEvidenceCache } from "../drizzle/schema";
import { getDb } from "./db";
import { pointInStateGeometry, type SeasonalAgriculturalBurningContext } from "./seasonalAgriculture";

type StateGeometry = Parameters<typeof pointInStateGeometry>[2];

type StoredDetection = {
  latitude: string | number;
  longitude: string | number;
  detectionDate: string | Date;
  brightness: string | number | null;
  confidence: string | null;
  dayNight: string | null;
  frp: string | number | null;
  platform: string | null;
};

type CalendarRow = { state: string; month: number; season: string; contextLevel: string; sourceUrl: string };
type BoundaryRow = { state: string; geometry: string };
type GppdRow = { name: string; latitude: string | number; longitude: string | number };
type CachedEvidence = { provider: string; cacheKey: string; payload: string; expiresAt: Date };

type CachedFacility = {
  name: string | null;
  category: string | null;
  type: string | null;
  distanceM: number | null;
  latitude: number | null;
  longitude: number | null;
};

export type AgriculturalFeatureRow = {
  metadata: { latitude: number; longitude: number; trainingUse: "metadata, not for training" };
  calendarPrior: {
    state: string | null;
    month: number;
    dayOfYear: number;
    prior: number | null;
    confidenceTier: "high" | "context" | null;
    calendarState: SeasonalAgriculturalBurningContext["calendarState"];
    source: string;
  };
  landCoverContext: {
    landCoverClass: string | null;
    croplandFraction250m: number | null;
    croplandFraction500m: number | null;
    croplandFraction1km: number | null;
    forestShrubFraction1km: number | null;
    distanceToMappedForestM: number | null;
    source: string;
  };
  temporalFireBehaviour: {
    detectionsWithin6Hours: number | null;
    detectionsWithin24Hours: number | null;
    detectionsWithin3Days: number;
    detectionsWithin7Days: number;
    burstDurationDays: number | null;
    activeMonths: number;
    recurrenceByMonth: number;
    source: string;
  };
  industrialSpatialContext: {
    nearestGppdDistanceKm: number | null;
    nearestOsmFacilityDistanceM: number | null;
    nearestOsmFacilityCategory: string | null;
    recurrentIndustrialHistory: boolean | null;
    source: string;
  };
  thermalContext: {
    frpMw: number | null;
    brightness: number | null;
    brightT31: number | null;
    platform: "MODIS" | "VIIRS" | null;
    confidence: string | null;
    source: string;
  };
  legacyLabelAudit: {
    label: "industrial_facility" | "mining" | "wildfire" | "agricultural_burning" | null;
    provenance: "gppd_or_named_osm" | "osm_mining_context" | "heuristic_vegetation_only" | "heuristic_cropland_only" | "unresolved";
    independentlySupported: boolean;
  };
};

export type AgriculturalFeatureBuildResult = {
  rows: AgriculturalFeatureRow[];
  coverage: Record<string, number>;
  labelQuality: Record<string, number>;
  warnings: string[];
};

function dateString(value: string | Date) {
  return typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

function dayOfYear(date: Date) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  return Math.floor((date.getTime() - start) / 86_400_000);
}

function parseNumber(value: unknown) {
  if (value === null || value === undefined || `${value}`.trim() === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function parseJson(payload: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(payload) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function coordinateKey(lat: number, lng: number) { return `${lat.toFixed(6)}:${lng.toFixed(6)}`; }
function cacheCoordinateKey(provider: string, lat: number, lng: number, precision: number) { return `${provider}:${lat.toFixed(precision)}:${lng.toFixed(precision)}`; }

function distanceKm(latA: number, lngA: number, latB: number, lngB: number) {
  const radians = (value: number) => value * Math.PI / 180;
  const dLat = radians(latB - latA);
  const dLng = radians(lngB - lngA);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(latA)) * Math.cos(radians(latB)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function calendarContext(lat: number, lng: number, month: number, boundaries: Array<{ state: string; geometry: StateGeometry }>, calendar: CalendarRow[]) {
  const boundary = boundaries.find(candidate => pointInStateGeometry(lng, lat, candidate.geometry));
  const entry = boundary ? calendar.find(candidate => candidate.state === boundary.state && candidate.month === month) : undefined;
  const calendarState = !boundary ? "out_of_scope" : entry ? "in_season" : "out_of_season";
  return {
    state: boundary?.state ?? null,
    calendarState: calendarState as SeasonalAgriculturalBurningContext["calendarState"],
    prior: entry ? entry.contextLevel === "high" ? 1 : 0.5 : boundary ? 0 : null,
    confidenceTier: entry ? (entry.contextLevel === "high" ? "high" as const : "context" as const) : null,
    source: entry?.sourceUrl ?? calendar[0]?.sourceUrl ?? "India seasonal agricultural-burning calendar",
  };
}

function parseCachedIndexes(caches: CachedEvidence[], now: Date) {
  const landCover = new Map<string, string>();
  const facilities = new Map<string, CachedFacility>();
  for (const cached of caches) {
    if (new Date(cached.expiresAt).getTime() < now.getTime()) continue;
    const payload = parseJson(cached.payload);
    if (!payload) continue;
    const parts = cached.cacheKey.split(":");
    const lat = Number(parts.at(-2));
    const lng = Number(parts.at(-1));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (cached.provider === "esri-sentinel2-landcover" && typeof payload.landCoverClass === "string") {
      landCover.set(cacheCoordinateKey("landcover-esri", lat, lng, 5), payload.landCoverClass);
    }
    if (cached.provider === "osm-overpass") {
      facilities.set(cacheCoordinateKey("osm-overpass", lat, lng, 3), {
        name: typeof payload.industrialFacilityName === "string" ? payload.industrialFacilityName : null,
        category: typeof payload.industrialFacilityCategory === "string" ? payload.industrialFacilityCategory : null,
        type: typeof payload.industrialFacilityType === "string" ? payload.industrialFacilityType : null,
        distanceM: parseNumber(payload.industrialFacilityDistanceM),
        latitude: parseNumber(payload.industrialFacilityLatitude),
        longitude: parseNumber(payload.industrialFacilityLongitude),
      });
    }
  }
  return { landCover, facilities };
}

function nearestGppdDistanceKm(lat: number, lng: number, plants: GppdRow[]) {
  const distances = plants.map(plant => distanceKm(lat, lng, Number(plant.latitude), Number(plant.longitude))).filter(Number.isFinite);
  return distances.length ? Number(Math.min(...distances).toFixed(4)) : null;
}

function legacyLabel(landCoverClass: string | null, facility: CachedFacility | undefined, gppdDistance: number | null) {
  if (facility?.category === "mining" && facility.distanceM !== null && facility.distanceM <= 2_000) return { label: "mining" as const, provenance: "osm_mining_context" as const, independentlySupported: true };
  const namedIndustrial = Boolean(facility?.name) && ["refinery", "power_plant", "steel", "lng_terminal"].includes(facility?.category ?? "");
  if (gppdDistance !== null && gppdDistance <= 2 || namedIndustrial) return { label: "industrial_facility" as const, provenance: "gppd_or_named_osm" as const, independentlySupported: true };
  if (landCoverClass === "cropland") return { label: "agricultural_burning" as const, provenance: "heuristic_cropland_only" as const, independentlySupported: false };
  if (landCoverClass === "forest_vegetation" || landCoverClass === "forest" || landCoverClass === "grassland_rangeland" || landCoverClass === "grassland") return { label: "wildfire" as const, provenance: "heuristic_vegetation_only" as const, independentlySupported: false };
  return { label: null, provenance: "unresolved" as const, independentlySupported: false };
}

export function buildAgriculturalFeatureRows(input: {
  detections: StoredDetection[];
  gppdPlants: GppdRow[];
  cachedEvidence: CachedEvidence[];
  boundaries: Array<{ state: string; geometry: StateGeometry }>;
  calendar: CalendarRow[];
  now?: Date;
}): AgriculturalFeatureBuildResult {
  const now = input.now ?? new Date();
  const indexes = parseCachedIndexes(input.cachedEvidence, now);
  const grouped = new Map<string, { lat: number; lng: number; rows: StoredDetection[] }>();
  for (const detection of input.detections) {
    const lat = Number(detection.latitude), lng = Number(detection.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const key = coordinateKey(lat, lng);
    const group = grouped.get(key) ?? { lat, lng, rows: [] };
    group.rows.push(detection);
    grouped.set(key, group);
  }
  const rows: AgriculturalFeatureRow[] = [];
  for (const group of Array.from(grouped.values())) {
    const dates = group.rows.map((row: StoredDetection) => dateString(row.detectionDate)).sort();
    const latest = dates.at(-1);
    if (!latest) continue;
    const latestDate = new Date(`${latest}T00:00:00.000Z`);
    const start3 = new Date(latestDate); start3.setUTCDate(start3.getUTCDate() - 2);
    const start7 = new Date(latestDate); start7.setUTCDate(start7.getUTCDate() - 6);
    const datesAtMidnight: Date[] = dates.map((date: string) => new Date(`${date}T00:00:00.000Z`));
    const countFrom = (start: Date) => datesAtMidnight.filter(date => date >= start).length;
    const firstDate = dates[0] ? new Date(`${dates[0]}T00:00:00.000Z`) : latestDate;
    const facility = indexes.facilities.get(cacheCoordinateKey("osm-overpass", group.lat, group.lng, 3));
    const landCoverClass = indexes.landCover.get(cacheCoordinateKey("landcover-esri", group.lat, group.lng, 5)) ?? null;
    const gppdDistance = nearestGppdDistanceKm(group.lat, group.lng, input.gppdPlants);
    const calendar = calendarContext(group.lat, group.lng, latestDate.getUTCMonth() + 1, input.boundaries, input.calendar);
    const newest = [...group.rows].sort((a, b) => dateString(b.detectionDate).localeCompare(dateString(a.detectionDate)))[0];
    const label = legacyLabel(landCoverClass, facility, gppdDistance);
    rows.push({
      metadata: { latitude: Number(group.lat.toFixed(6)), longitude: Number(group.lng.toFixed(6)), trainingUse: "metadata, not for training" },
      calendarPrior: { state: calendar.state, month: latestDate.getUTCMonth() + 1, dayOfYear: dayOfYear(latestDate), prior: calendar.prior, confidenceTier: calendar.confidenceTier, calendarState: calendar.calendarState, source: calendar.source },
      landCoverContext: { landCoverClass, croplandFraction250m: null, croplandFraction500m: null, croplandFraction1km: null, forestShrubFraction1km: null, distanceToMappedForestM: null, source: landCoverClass ? "Esri Sentinel-2 10m Land Use/Land Cover point class; fractions unavailable" : "unavailable" },
      temporalFireBehaviour: { detectionsWithin6Hours: null, detectionsWithin24Hours: null, detectionsWithin3Days: countFrom(start3), detectionsWithin7Days: countFrom(start7), burstDurationDays: Math.max(0, Math.round((latestDate.getTime() - firstDate.getTime()) / 86_400_000)), activeMonths: new Set(dates.map((date: string) => date.slice(0, 7))).size, recurrenceByMonth: new Set(dates.map((date: string) => date.slice(5, 7))).size, source: "stored FIRMS detectionHistory; acquisition time is not persisted" },
      industrialSpatialContext: { nearestGppdDistanceKm: gppdDistance, nearestOsmFacilityDistanceM: facility?.distanceM ?? null, nearestOsmFacilityCategory: facility?.category ?? null, recurrentIndustrialHistory: null, source: "active GPPD and unexpired OSM cache; recurrence requires longer history" },
      thermalContext: { frpMw: parseNumber(newest.frp), brightness: parseNumber(newest.brightness), brightT31: null, platform: newest.platform === "MODIS" || newest.platform === "VIIRS" ? newest.platform : null, confidence: newest.confidence, source: "stored NASA FIRMS row; bright_t31 not persisted in current schema" },
      legacyLabelAudit: label,
    });
  }
  const count = (predicate: (row: AgriculturalFeatureRow) => boolean) => rows.filter(predicate).length;
  const coverage = {
    totalRows: rows.length,
    calendarState: count(row => row.calendarPrior.state !== null),
    calendarInSeason: count(row => row.calendarPrior.calendarState === "in_season"),
    landCoverClass: count(row => row.landCoverContext.landCoverClass !== null),
    croplandFraction250m: count(row => row.landCoverContext.croplandFraction250m !== null),
    detectionsWithin6Hours: count(row => row.temporalFireBehaviour.detectionsWithin6Hours !== null),
    detectionsWithin24Hours: count(row => row.temporalFireBehaviour.detectionsWithin24Hours !== null),
    detectionsWithin3Days: count(row => row.temporalFireBehaviour.detectionsWithin3Days !== null),
    frpMw: count(row => row.thermalContext.frpMw !== null),
    platform: count(row => row.thermalContext.platform !== null),
    confidence: count(row => row.thermalContext.confidence !== null),
    nearestGppdDistanceKm: count(row => row.industrialSpatialContext.nearestGppdDistanceKm !== null),
    nearestOsmFacilityDistanceM: count(row => row.industrialSpatialContext.nearestOsmFacilityDistanceM !== null),
  };
  const labelQuality = Object.fromEntries(["industrial_facility", "mining", "wildfire", "agricultural_burning"].map(label => [label, count(row => row.legacyLabelAudit.label === label)]));
  const independentlySupported = count(row => row.legacyLabelAudit.independentlySupported);
  const warnings = [
    "Calendar prior is contextual evidence only and never determines a training label.",
    "The current detectionHistory schema stores acquisition date but not acquisition time; 6-hour and 24-hour features are unavailable.",
    "The current land-cover source stores a point class, not neighborhood fractions; fractional land-cover features are unavailable.",
    "Legacy agricultural labels are cropland-only heuristics and are not independent ground truth.",
    `Only ${independentlySupported} of ${rows.length} rows have independent facility-context support; vegetation/cropland labels remain heuristic.`,
  ];
  return { rows, coverage, labelQuality: { ...labelQuality, independentlySupported }, warnings };
}

export async function buildAgriculturalFeatureFoundation(outputPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "data", "agricultural_feature_foundation.json")) {
  const db = await getDb();
  if (!db) throw new Error("Feature foundation build requires the existing project database.");
  const [detections, gppdPlants, cachedEvidence, boundaries, calendar] = await Promise.all([
    db.select({ latitude: detectionHistory.latitude, longitude: detectionHistory.longitude, detectionDate: detectionHistory.detectionDate, brightness: detectionHistory.brightness, confidence: detectionHistory.confidence, dayNight: detectionHistory.dayNight, frp: detectionHistory.frp, platform: detectionHistory.platform }).from(detectionHistory),
    db.select({ name: gppdReference.name, latitude: gppdReference.latitude, longitude: gppdReference.longitude }).from(gppdReference),
    db.select({ provider: sourceEvidenceCache.provider, cacheKey: sourceEvidenceCache.cacheKey, payload: sourceEvidenceCache.payload, expiresAt: sourceEvidenceCache.expiresAt }).from(sourceEvidenceCache),
    db.select({ state: seasonalAgriculturalStateGeometry.state, geometry: seasonalAgriculturalStateGeometry.geometry }).from(seasonalAgriculturalStateGeometry),
    db.select({ state: seasonalAgriculturalBurningCalendar.state, month: seasonalAgriculturalBurningCalendar.month, season: seasonalAgriculturalBurningCalendar.season, contextLevel: seasonalAgriculturalBurningCalendar.contextLevel, sourceUrl: seasonalAgriculturalBurningCalendar.sourceUrl }).from(seasonalAgriculturalBurningCalendar),
  ]);
  const parsedBoundaries = boundaries.flatMap(row => { try { return [{ state: row.state, geometry: JSON.parse(row.geometry) as StateGeometry }]; } catch { return []; } });
  const result = buildAgriculturalFeatureRows({ detections, gppdPlants, cachedEvidence, boundaries: parsedBoundaries, calendar });
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(result, null, 2).concat("\n"), "utf8");
  return { ...result, outputPath };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildAgriculturalFeatureFoundation().then(result => {
    console.log(JSON.stringify({ outputPath: result.outputPath, coverage: result.coverage, labelQuality: result.labelQuality, warnings: result.warnings }, null, 2));
  }).catch(error => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
}
