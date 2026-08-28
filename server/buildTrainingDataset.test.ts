import { describe, expect, it } from "vitest";
import { buildTrainingRowsFromStoredEvidence } from "./buildTrainingDataset";

function cachedLandCover(lat: number, lng: number, landCoverClass: string) {
  return { provider: "esri-sentinel2-landcover", cacheKey: `landcover-esri:${lat.toFixed(5)}:${lng.toFixed(5)}`, payload: JSON.stringify({ landCoverClass }), expiresAt: new Date("2030-01-01T00:00:00.000Z") };
}

function cachedFacility(lat: number, lng: number, value: Record<string, unknown>) {
  return { provider: "osm-overpass", cacheKey: `osm-overpass:${lat.toFixed(3)}:${lng.toFixed(3)}`, payload: JSON.stringify(value), expiresAt: new Date("2030-01-01T00:00:00.000Z") };
}

function detection(lat: number, lng: number, dayNight: "D" | "N" = "D", frp = "2.5") {
  return { latitude: lat.toFixed(6), longitude: lng.toFixed(6), detectionDate: "2026-08-25", dayNight, frp };
}

describe("buildTrainingRowsFromStoredEvidence", () => {
  it("uses only stored evidence, preserves real feature values, and excludes every class below 30 examples", () => {
    const detections = Array.from({ length: 29 }, (_, index) => detection(20 + index / 1000, 75));
    const cachedEvidence = detections.map(row => cachedLandCover(Number(row.latitude), Number(row.longitude), "cropland"));
    const result = buildTrainingRowsFromStoredEvidence({ detections, gppdPlants: [], cachedEvidence, now: new Date("2026-08-26T00:00:00.000Z") });
    expect(result.candidateCounts.agricultural_burning).toBe(29);
    expect(result.outputCounts.agricultural_burning).toBe(0);
    expect(result.rows).toEqual([]);
    expect(result.excludedClasses).toContain("agricultural_burning");
  });

  it("includes only classes meeting the threshold and selects mining ahead of other possible labels", () => {
    const detections = Array.from({ length: 30 }, (_, index) => detection(22 + index / 1000, 76, index % 2 ? "N" : "D", String(1 + index / 10)));
    const cachedEvidence = detections.map(row => cachedFacility(Number(row.latitude), Number(row.longitude), {
      industrialFacilityName: null, industrialFacilityCategory: "mining", industrialFacilityDistanceM: 900,
    }));
    const result = buildTrainingRowsFromStoredEvidence({ detections, gppdPlants: [{ name: "Nearby Plant", latitude: "22.000000", longitude: "76.000000" }], cachedEvidence, now: new Date("2026-08-26T00:00:00.000Z") });
    expect(result.candidateCounts.mining).toBe(30);
    expect(result.outputCounts.mining).toBe(30);
    expect(result.rows).toHaveLength(30);
    expect(result.rows[0]).toMatchObject({ label: "mining", features: { frpMw: 1, dayNightRatio: null, gppdMatch: true, namedFacilityMatch: false, namedFacilityCategory: "mining" } });
    expect(result.rows.map(row => row.label)).not.toContain("gas_flare");
  });

  it("labels named facility, wildfire, and agricultural evidence only under their required existing-evidence conditions", () => {
    const detections = [detection(23, 77), detection(24, 77), detection(25, 77)];
    const cachedEvidence = [
      cachedFacility(23, 77, { industrialFacilityName: "Test Refinery", industrialFacilityCategory: "refinery", industrialFacilityDistanceM: 700 }),
      cachedLandCover(24, 77, "forest_vegetation"),
      cachedLandCover(25, 77, "cropland"),
    ];
    const result = buildTrainingRowsFromStoredEvidence({ detections, gppdPlants: [], cachedEvidence, now: new Date("2026-08-26T00:00:00.000Z") });
    expect(result.candidateCounts).toMatchObject({ industrial_facility: 1, wildfire: 1, agricultural_burning: 1, mining: 0 });
    expect(result.rows).toEqual([]);
  });
});
