import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { detectionHistory, gppdReference, sourceEvidenceCache } from "../drizzle/schema";
import { getDb } from "./db";

export const TRAINING_LABELS = ["industrial_facility", "mining", "wildfire", "agricultural_burning"] as const;
export type TrainingLabel = (typeof TRAINING_LABELS)[number];
type FacilityCategory = "refinery" | "power_plant" | "steel" | "lng_terminal" | "mining" | "agricultural_zone";

type StoredDetection = {
  latitude: string | number;
  longitude: string | number;
  detectionDate: string | Date;
  dayNight: string | null;
  frp: string | number | null;
};

type StoredGppdReference = {
  name: string;
  latitude: string | number;
  longitude: string | number;
};

type CachedEvidence = {
  provider: string;
  cacheKey: string;
  payload: string;
  expiresAt: Date;
};

export type TrainingFeatures = {
  latitude: number;
  longitude: number;
  frpMw: number | null;
  dayNightRatio: number | null;
  sevenDayDetectionCount: number;
  activeMonths: number;
  landCoverClass: string | null;
  gppdMatch: boolean;
  namedFacilityMatch: boolean;
  namedFacilityCategory: FacilityCategory | null;
};

export type TrainingDatasetRow = { features: TrainingFeatures; label: TrainingLabel };

export type TrainingDatasetBuildResult = {
  candidateCounts: Record<TrainingLabel, number>;
  outputCounts: Record<TrainingLabel, number>;
  excludedClasses: TrainingLabel[];
  rows: TrainingDatasetRow[];
};

const MINIMUM_CLASS_SIZE = 30;
const GPPD_RADIUS_KM = 2;
const NAMED_INDUSTRIAL_CATEGORIES = new Set<FacilityCategory>(["refinery", "power_plant", "steel", "lng_terminal"]);
const FOREST_OR_GRASSLAND = new Set(["forest_vegetation", "forest", "grassland_rangeland", "grassland"]);

function dateString(value: string | Date) {
  return typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

function distanceKm(latA: number, lngA: number, latB: number, lngB: number) {
  const radians = (value: number) => value * Math.PI / 180;
  const dLat = radians(latB - latA);
  const dLng = radians(lngB - lngA);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(latA)) * Math.cos(radians(latB)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function emptyCounts() {
  return Object.fromEntries(TRAINING_LABELS.map(label => [label, 0])) as Record<TrainingLabel, number>;
}

function coordinateKey(lat: number, lng: number) {
  return `${lat.toFixed(6)}:${lng.toFixed(6)}`;
}

function cacheCoordinateKey(provider: string, lat: number, lng: number, precision: number) {
  return `${provider}:${lat.toFixed(precision)}:${lng.toFixed(precision)}`;
}

function parseJson(payload: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(payload) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

function categoryFromCache(value: unknown): FacilityCategory | null {
  return TRAINING_LABELS && typeof value === "string" && ["refinery", "power_plant", "steel", "lng_terminal", "mining", "agricultural_zone"].includes(value)
    ? value as FacilityCategory
    : null;
}

type CachedFacility = { name: string | null; category: FacilityCategory | null; distanceM: number | null };

function buildCachedEvidenceIndexes(caches: CachedEvidence[], now: Date) {
  const landCoverByCoordinate = new Map<string, string>();
  const facilityByCoordinate = new Map<string, CachedFacility>();
  for (const cached of caches) {
    if (cached.expiresAt.getTime() < now.getTime()) continue;
    const payload = parseJson(cached.payload);
    if (!payload) continue;
    const keyParts = cached.cacheKey.split(":");
    const rawLat = Number(keyParts[keyParts.length - 2]);
    const rawLng = Number(keyParts[keyParts.length - 1]);
    if (!Number.isFinite(rawLat) || !Number.isFinite(rawLng)) continue;
    if (cached.provider === "esri-sentinel2-landcover" && typeof payload.landCoverClass === "string") {
      landCoverByCoordinate.set(cacheCoordinateKey("landcover-esri", rawLat, rawLng, 5), payload.landCoverClass);
    }
    if (cached.provider === "osm-overpass") {
      const distanceM = Number(payload.industrialFacilityDistanceM);
      facilityByCoordinate.set(cacheCoordinateKey("osm-overpass", rawLat, rawLng, 3), {
        name: typeof payload.industrialFacilityName === "string" && payload.industrialFacilityName.trim() ? payload.industrialFacilityName : null,
        category: categoryFromCache(payload.industrialFacilityCategory),
        distanceM: Number.isFinite(distanceM) ? distanceM : null,
      });
    }
  }
  return { landCoverByCoordinate, facilityByCoordinate };
}

function nearestGppdMatch(lat: number, lng: number, plants: StoredGppdReference[]) {
  return plants.some(plant => {
    const plantLat = Number(plant.latitude);
    const plantLng = Number(plant.longitude);
    return Number.isFinite(plantLat) && Number.isFinite(plantLng) && distanceKm(lat, lng, plantLat, plantLng) <= GPPD_RADIUS_KM;
  });
}

function labelFor(features: TrainingFeatures, facility: CachedFacility | undefined): TrainingLabel | undefined {
  const miningMatch = facility?.category === "mining" && facility.distanceM !== null && facility.distanceM <= 2_000;
  const namedIndustrialMatch = features.namedFacilityMatch && features.namedFacilityCategory !== null && NAMED_INDUSTRIAL_CATEGORIES.has(features.namedFacilityCategory);
  if (miningMatch) return "mining";
  if (features.gppdMatch || namedIndustrialMatch) return "industrial_facility";
  if (features.landCoverClass === "cropland") return "agricultural_burning";
  if (features.landCoverClass && FOREST_OR_GRASSLAND.has(features.landCoverClass)) return "wildfire";
  return undefined;
}

/**
 * Builds only real stored-evidence examples. It never invokes corroboration or any remote source,
 * and it intentionally has no gas-flare or persistent-industrial label.
 */
export function buildTrainingRowsFromStoredEvidence(input: {
  detections: StoredDetection[];
  gppdPlants: StoredGppdReference[];
  cachedEvidence: CachedEvidence[];
  now?: Date;
}): TrainingDatasetBuildResult {
  const now = input.now ?? new Date();
  const byCoordinate = new Map<string, { latitude: number; longitude: number; rows: StoredDetection[] }>();
  for (const detection of input.detections) {
    const latitude = Number(detection.latitude);
    const longitude = Number(detection.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    const key = coordinateKey(latitude, longitude);
    const group: { latitude: number; longitude: number; rows: StoredDetection[] } = byCoordinate.get(key) ?? { latitude, longitude, rows: [] };
    group.rows.push(detection);
    byCoordinate.set(key, group);
  }
  const { landCoverByCoordinate, facilityByCoordinate } = buildCachedEvidenceIndexes(input.cachedEvidence, now);
  const candidateRows: Record<TrainingLabel, TrainingDatasetRow[]> = {
    industrial_facility: [], mining: [], wildfire: [], agricultural_burning: [],
  };

  for (const group of Array.from(byCoordinate.values())) {
    const dates: string[] = group.rows.map((row: StoredDetection) => dateString(row.detectionDate)).sort();
    const latestDate = dates[dates.length - 1];
    if (!latestDate) continue;
    const windowStart = new Date(`${latestDate}T00:00:00.000Z`);
    windowStart.setUTCDate(windowStart.getUTCDate() - 6);
    const sevenDayDetectionCount = group.rows.filter((row: StoredDetection) => new Date(`${dateString(row.detectionDate)}T00:00:00.000Z`) >= windowStart).length;
    const dayDetections = group.rows.filter((row: StoredDetection) => row.dayNight?.trim().toUpperCase() === "D").length;
    const nightDetections = group.rows.filter((row: StoredDetection) => row.dayNight?.trim().toUpperCase() === "N").length;
    const sortedByDate = [...group.rows].sort((left: StoredDetection, right: StoredDetection) => dateString(right.detectionDate).localeCompare(dateString(left.detectionDate)));
    const newestFrp = sortedByDate.map((row: StoredDetection) => Number(row.frp)).find((value: number) => Number.isFinite(value));
    const landCoverClass = landCoverByCoordinate.get(cacheCoordinateKey("landcover-esri", group.latitude, group.longitude, 5)) ?? null;
    const facility = facilityByCoordinate.get(cacheCoordinateKey("osm-overpass", group.latitude, group.longitude, 3));
    const features: TrainingFeatures = {
      latitude: Number(group.latitude.toFixed(6)),
      longitude: Number(group.longitude.toFixed(6)),
      frpMw: newestFrp === undefined ? null : newestFrp,
      dayNightRatio: nightDetections > 0 ? Number((dayDetections / nightDetections).toFixed(4)) : null,
      sevenDayDetectionCount,
      activeMonths: new Set(dates.map((date: string) => date.slice(0, 7))).size,
      landCoverClass,
      gppdMatch: nearestGppdMatch(group.latitude, group.longitude, input.gppdPlants),
      namedFacilityMatch: Boolean(facility?.name),
      namedFacilityCategory: facility?.category ?? null,
    };
    const label = labelFor(features, facility);
    if (label) candidateRows[label].push({ features, label });
  }

  const candidateCounts = emptyCounts();
  const outputCounts = emptyCounts();
  const rows: TrainingDatasetRow[] = [];
  for (const label of TRAINING_LABELS) {
    candidateCounts[label] = candidateRows[label].length;
    if (candidateRows[label].length >= MINIMUM_CLASS_SIZE) {
      rows.push(...candidateRows[label]);
      outputCounts[label] = candidateRows[label].length;
    }
  }
  return { candidateCounts, outputCounts, excludedClasses: TRAINING_LABELS.filter(label => candidateCounts[label] < MINIMUM_CLASS_SIZE), rows };
}

export async function buildTrainingDataset(outputPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "data", "training_dataset.json")) {
  const db = await getDb();
  if (!db) throw new Error("Training dataset build requires the existing project database.");
  const [detections, gppdPlants, cachedEvidence] = await Promise.all([
    db.select({ latitude: detectionHistory.latitude, longitude: detectionHistory.longitude, detectionDate: detectionHistory.detectionDate, dayNight: detectionHistory.dayNight, frp: detectionHistory.frp }).from(detectionHistory),
    db.select({ name: gppdReference.name, latitude: gppdReference.latitude, longitude: gppdReference.longitude }).from(gppdReference),
    db.select({ provider: sourceEvidenceCache.provider, cacheKey: sourceEvidenceCache.cacheKey, payload: sourceEvidenceCache.payload, expiresAt: sourceEvidenceCache.expiresAt }).from(sourceEvidenceCache),
  ]);
  const result = buildTrainingRowsFromStoredEvidence({ detections, gppdPlants, cachedEvidence });
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(result.rows, null, 2).concat("\n"), "utf8");
  return { ...result, outputPath };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildTrainingDataset().then(result => {
    console.log(JSON.stringify({ outputPath: result.outputPath, candidateCounts: result.candidateCounts, outputCounts: result.outputCounts, excludedClasses: result.excludedClasses }, null, 2));
    process.exit(0);
  }).catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
