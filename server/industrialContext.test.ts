import { describe, expect, it } from "vitest";
import { nearestIndustrialFacility } from "./corroboration";

describe("nearestIndustrialFacility", () => {
  it("returns the closest named OSM industrial feature with tag type and distance", () => {
    const result = nearestIndustrialFacility(20, 77, [
      { center: { lat: 20.009, lon: 77.009 }, tags: { landuse: "industrial", name: "Further Industrial Estate" } },
      { lat: 20.001, lon: 77.001, tags: { man_made: "works", "name:en": "Nearest Works" } },
    ]);

    expect(result).toMatchObject({ industrialFacilityName: "Nearest Works", industrialFacilityType: "man_made=works" });
    expect(result.industrialFacilityDistanceM).toBeGreaterThan(0);
    expect(result.industrialFacilityDistanceM).toBeLessThan(200);
  });

  it("returns the matched OSM tag type and distance even when the nearest feature has no name", () => {
    const result = nearestIndustrialFacility(20, 77, [
      { center: { lat: 20.001, lon: 77.001 }, tags: { power: "plant" } },
    ]);

    expect(result).toMatchObject({ industrialFacilityName: null, industrialFacilityType: "power=plant" });
    expect(result.industrialFacilityDistanceM).toBeGreaterThan(0);
  });

  it("returns null additive facility fields when no returned feature has usable location and industrial tags", () => {
    expect(nearestIndustrialFacility(20, 77, [
      { tags: { landuse: "industrial", name: "No Location" } },
      { lat: 20.001, lon: 77.001, tags: { amenity: "school" } },
    ])).toEqual({ industrialFacilityName: null, industrialFacilityType: null, industrialFacilityDistanceM: null });
  });
});
