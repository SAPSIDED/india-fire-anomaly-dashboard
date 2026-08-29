import { describe, expect, it } from "vitest";
import { buildTrainingRowsFromStoredEvidence } from "./buildTrainingDataset";

function cachedLandCover(lat: number, lng: number, landCoverClass: string) {
  return { provider: "esri-sentinel2-landcover", cacheKey: `landcover-esri:${lat.toFixed(5)}:${lng.toFixed(5)}`, payload: JSON.stringify({ landCoverClass }), expiresAt: new Date("2030-01-01T00:00:00.000Z") };
}

function cachedFacility(lat: number, lng: number, value: Record<string, unknown>) {
  return { provider: "osm-overpass", cacheKey: `osm-overpass:${lat.toFixed(3)}:${lng.toFixed(3)}`, payload: JSON.stringify(value), expiresAt: new Date("2030-01-01T00:00:00.000Z") };
}

function detection(lat: number, lng: number, dayNight: "D" | "N" = "D", frp: string | number | null = "2.5") {
  return { latitude: lat.toFixed(6), longitude: lng.toFixed(6), detectionDate: "2026-08-25", dayNight, frp };
}

describe("buildTrainingRowsFromStoredEvidence", () => {
  it("uses only stored evidence and excludes every class below 30 examples", () => {
    const detections = Array.from({ length: 29 }, (_, index) => detection(20 + index / 1000, 75));
    const cachedEvidence = detections.map(row => cachedLandCover(Number(row.latitude), Number(row.longitude), "cropland"));
    const result = buildTrainingRowsFromStoredEvidence({ detections, gppdPlants: [], cachedEvidence, now: new Date("2026-08-26T00:00:00.000Z") });
    expect(result.candidateCounts.agricultural_burning).toBe(29);
    expect(result.outputCounts.agricultural_burning).toBe(0);
    expect(result.rows).toEqual([]);
    expect(result.excludedClasses).toContain("agricultural_burning");
  });

  it("preserves missing FRP as null while retaining genuine zero and positive values", () => {
    const detections = [
      detection(22, 76, "D", null),
      detection(23, 76, "D", ""),
      detection(24, 76, "D", "not-a-number"),
      detection(25, 76, "D", 0),
      detection(26, 76, "D", 3.75),
    ];
    const cachedEvidence = detections.map(row => cachedLandCover(Number(row.latitude), Number(row.longitude), "forest_vegetation"));
    const result = buildTrainingRowsFromStoredEvidence({ detections, gppdPlants: [], cachedEvidence, now: new Date("2026-08-26T00:00:00.000Z") });
    expect(result.candidateCounts.wildfire).toBe(5);
    expect(result.rows).toHaveLength(0);
    expect(result.excludedClasses).toContain("wildfire");
    const withThreshold = buildTrainingRowsFromStoredEvidence({ detections: [...detections, ...Array.from({ length: 25 }, (_, index) => detection(27 + index / 1000, 76, "D", null))], gppdPlants: [], cachedEvidence: [...cachedEvidence, ...Array.from({ length: 25 }, (_, index) => cachedLandCover(27 + index / 1000, 76, "forest_vegetation"))], now: new Date("2026-08-26T00:00:00.000Z") });
    const byLatitude = new Map(withThreshold.rows.map(row => [row.metadata.latitude, row.features.frpMw]));
    expect(byLatitude.get(22)).toBeNull();
    expect(byLatitude.get(23)).toBeNull();
    expect(byLatitude.get(24)).toBeNull();
    expect(byLatitude.get(25)).toBe(0);
    expect(byLatitude.get(26)).toBe(3.75);
  });

  it("outputs only industrial facility and wildfire rows with coordinates marked metadata, not training", () => {
    const industrial = Array.from({ length: 30 }, (_, index) => detection(30 + index / 1000, 80));
    const wildfire = Array.from({ length: 30 }, (_, index) => detection(31 + index / 1000, 80));
    const cachedEvidence = [
      ...industrial.map(row => cachedFacility(Number(row.latitude), Number(row.longitude), { industrialFacilityName: "Test Refinery", industrialFacilityCategory: "refinery", industrialFacilityDistanceM: 700 })),
      ...wildfire.map(row => cachedLandCover(Number(row.latitude), Number(row.longitude), "forest_vegetation")),
    ];
    const result = buildTrainingRowsFromStoredEvidence({ detections: [...industrial, ...wildfire], gppdPlants: [], cachedEvidence, now: new Date("2026-08-26T00:00:00.000Z") });
    expect(result.outputCounts).toMatchObject({ industrial_facility: 30, wildfire: 30, mining: 0, agricultural_burning: 0 });
    expect(result.rows).toHaveLength(60);
    expect(result.rows.every(row => row.metadata.trainingUse === "metadata, not for training")).toBe(true);
    expect(result.rows.every(row => Object.keys(row.features).sort().join(",") === "activeMonths,dayNightRatio,frpMw,sevenDayDetectionCount")).toBe(true);
    expect(result.rows.some(row => "landCoverClass" in row.features || "gppdMatch" in row.features || "namedFacilityMatch" in row.features || "namedFacilityCategory" in row.features || "latitude" in row.features || "longitude" in row.features)).toBe(false);
    expect(result.rows.map(row => row.label)).not.toContain("mining");
    expect(result.rows.map(row => row.label)).not.toContain("agricultural_burning");
  });

  it("continues reporting candidate-label precedence while excluding mining and agricultural output", () => {
    const detections = Array.from({ length: 30 }, (_, index) => detection(22 + index / 1000, 76, index % 2 ? "N" : "D", String(1 + index / 10)));
    const cachedEvidence = detections.map(row => cachedFacility(Number(row.latitude), Number(row.longitude), {
      industrialFacilityName: null, industrialFacilityCategory: "mining", industrialFacilityDistanceM: 900,
    }));
    const result = buildTrainingRowsFromStoredEvidence({ detections, gppdPlants: [{ name: "Nearby Plant", latitude: "22.000000", longitude: "76.000000" }], cachedEvidence, now: new Date("2026-08-26T00:00:00.000Z") });
    expect(result.candidateCounts.mining).toBe(30);
    expect(result.outputCounts.mining).toBe(0);
    expect(result.rows).toEqual([]);
    expect(result.rows.map(row => row.label)).not.toContain("gas_flare");
  });
});
