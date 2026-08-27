import { describe, expect, it } from "vitest";
import { nearestIndustrialFacility } from "./corroboration";

describe("nearestIndustrialFacility", () => {
  it("returns the closest named OSM industrial feature with tag type and distance", () => {
    const result = nearestIndustrialFacility(20, 77, [
      { center: { lat: 20.009, lon: 77.009 }, tags: { landuse: "industrial", name: "Further Industrial Estate" } },
      { type: "way", id: 123, lat: 20.001, lon: 77.001, tags: { man_made: "works", "name:en": "Nearest Works" } },
    ]);

    expect(result).toMatchObject({ industrialFacilityName: "Nearest Works", industrialFacilityType: "man_made=works" });
    expect(result.industrialFacilityDistanceM).toBeGreaterThan(0);
    expect(result.industrialFacilityDistanceM).toBeLessThan(200);
    expect(result.industrialFacilityOsmUrl).toBe("https://www.openstreetmap.org/way/123");
  });

  it("returns the matched OSM tag type and distance even when the nearest feature has no name", () => {
    const result = nearestIndustrialFacility(20, 77, [
      { center: { lat: 20.001, lon: 77.001 }, tags: { power: "plant" } },
    ]);

    expect(result).toMatchObject({ industrialFacilityName: null, industrialFacilityType: "power=plant" });
    expect(result.industrialFacilityDistanceM).toBeGreaterThan(0);
  });

  it.each([
    [{ man_made: "works", industrial: "refinery" }, "refinery"],
    [{ power: "plant" }, "power_plant"],
    [{ landuse: "industrial", industrial: "steel" }, "steel"],
    [{ man_made: "works", industrial: "lng_terminal" }, "lng_terminal"],
    [{ man_made: "mine" }, "mining"],
    [{ landuse: "farmland" }, "agricultural_zone"],
  ])("assigns the %s tagged OSM feature to %s", (tags, expectedCategory) => {
    const result = nearestIndustrialFacility(20, 77, [{ lat: 20.001, lon: 77.001, tags }]);
    expect(result.industrialFacilityCategory).toBe(expectedCategory);
  });

  it("does not infer a facility category from a generic industrial tag", () => {
    const result = nearestIndustrialFacility(20, 77, [{ lat: 20.001, lon: 77.001, tags: { landuse: "industrial", name: "Industrial Estate" } }]);
    expect(result).toMatchObject({ industrialFacilityType: "landuse=industrial", industrialFacilityCategory: null });
  });

  it("returns null additive facility fields when no returned feature has usable location and industrial tags", () => {
    expect(nearestIndustrialFacility(20, 77, [
      { tags: { landuse: "industrial", name: "No Location" } },
      { lat: 20.001, lon: 77.001, tags: { amenity: "school" } },
    ])).toEqual({ industrialFacilityName: null, industrialFacilityType: null, industrialFacilityCategory: null, industrialFacilityLatitude: null, industrialFacilityLongitude: null, industrialFacilityDistanceM: null, industrialFacilityOsmUrl: null });
  });
});
