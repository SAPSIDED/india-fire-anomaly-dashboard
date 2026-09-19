import { describe, expect, it } from "vitest";
import { buildAgriculturalFeatureRows } from "./agriculturalFeatureFoundation";

const boundaries = [{
  state: "Punjab",
  geometry: { type: "Polygon", coordinates: [[[74, 29], [77, 29], [77, 32], [74, 32], [74, 29]]] },
}] as const;
const calendar = [{ state: "Punjab", month: 10, season: "post-rice harvest", contextLevel: "high", sourceUrl: "calendar-source" }];

function build(overrides: Partial<Parameters<typeof buildAgriculturalFeatureRows>[0]> = {}) {
  return buildAgriculturalFeatureRows({
    detections: [
      { latitude: "30.5", longitude: "75.5", detectionDate: "2026-10-01", brightness: "320.1", confidence: "nominal", dayNight: null, frp: "4.2", platform: "VIIRS" },
      { latitude: "30.5", longitude: "75.5", detectionDate: "2026-10-02", brightness: null, confidence: null, dayNight: null, frp: null, platform: "VIIRS" },
      { latitude: "30.5", longitude: "75.5", detectionDate: "2026-10-04", brightness: "321.0", confidence: "high", dayNight: null, frp: "0", platform: "MODIS" },
    ],
    gppdPlants: [],
    cachedEvidence: [{
      provider: "esri-sentinel2-landcover",
      cacheKey: "landcover-esri:30.50000:75.50000",
      payload: JSON.stringify({ landCoverClass: "cropland" }),
      expiresAt: new Date("2027-01-01T00:00:00Z"),
    }],
    boundaries: [...boundaries],
    calendar: [...calendar],
    now: new Date("2026-10-10T00:00:00Z"),
    ...overrides,
  });
}

describe("agricultural feature foundation", () => {
  it("computes a calendar prior without converting it into ground truth", () => {
    const result = build();
    expect(result.rows[0].calendarPrior).toMatchObject({ state: "Punjab", month: 10, calendarState: "in_season", prior: 1, confidenceTier: "high" });
    expect(result.rows[0].legacyLabelAudit).toMatchObject({ label: "agricultural_burning", independentlySupported: false, provenance: "heuristic_cropland_only" });
  });

  it("computes date-based three-day and seven-day features while withholding hour-level features", () => {
    const row = build().rows[0];
    expect(row.temporalFireBehaviour).toMatchObject({ detectionsWithin6Hours: null, detectionsWithin24Hours: null, detectionsWithin3Days: 2, detectionsWithin7Days: 3, activeMonths: 1, recurrenceByMonth: 1 });
    expect(row.temporalFireBehaviour.source).toContain("acquisition time is not persisted");
  });

  it("preserves real FRP zero and platform while keeping missing values missing", () => {
    const row = build().rows[0];
    expect(row.thermalContext).toMatchObject({ frpMw: 0, platform: "MODIS" });
    expect(row.thermalContext.brightness).toBe(321);
  });

  it("does not invent fractional land-cover or forest-distance features", () => {
    const row = build().rows[0];
    expect(row.landCoverContext.landCoverClass).toBe("cropland");
    expect(row.landCoverContext.croplandFraction250m).toBeNull();
    expect(row.landCoverContext.croplandFraction500m).toBeNull();
    expect(row.landCoverContext.croplandFraction1km).toBeNull();
    expect(row.landCoverContext.distanceToMappedForestM).toBeNull();
  });
});
