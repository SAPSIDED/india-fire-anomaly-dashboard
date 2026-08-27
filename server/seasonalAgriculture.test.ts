import { afterEach, describe, expect, it } from "vitest";
import { lookupSeasonalAgriculturalBurning, pointInStateGeometry, setSeasonalAgriculturalContextForTests } from "./seasonalAgriculture";

const punjabSquare = { type: "Polygon" as const, coordinates: [[[74, 30], [76, 30], [76, 32], [74, 32], [74, 30]]] };
const calendar = [{ state: "Punjab", month: 10, season: "post-rice harvest", contextLevel: "high", sourceUrl: "https://example.test/source" }];

afterEach(() => setSeasonalAgriculturalContextForTests());

describe("seasonal agricultural-burning calendar", () => {
  it("returns source-labelled in-season context for a point within the mapped Punjab boundary in October", async () => {
    setSeasonalAgriculturalContextForTests({ boundaries: async () => [{ state: "Punjab", geometry: punjabSquare }], calendar: async () => calendar });
    await expect(lookupSeasonalAgriculturalBurning(31, 75, 10)).resolves.toMatchObject({ state: "available", geographicState: "Punjab", calendarState: "in_season", season: "post-rice harvest", contextLevel: "high" });
  });

  it("returns out-of-season context for a mapped state with no row for the selected month", async () => {
    setSeasonalAgriculturalContextForTests({ boundaries: async () => [{ state: "Punjab", geometry: punjabSquare }], calendar: async () => calendar });
    await expect(lookupSeasonalAgriculturalBurning(31, 75, 7)).resolves.toMatchObject({ state: "available", geographicState: "Punjab", calendarState: "out_of_season", season: null });
  });

  it("returns out-of-scope context for a coordinate outside the deliberately narrow mapped states", async () => {
    setSeasonalAgriculturalContextForTests({ boundaries: async () => [{ state: "Punjab", geometry: punjabSquare }], calendar: async () => calendar });
    await expect(lookupSeasonalAgriculturalBurning(22, 78, 10)).resolves.toMatchObject({ state: "available", geographicState: null, calendarState: "out_of_scope" });
  });

  it("returns an explicit unavailable result when the local calendar is inaccessible", async () => {
    setSeasonalAgriculturalContextForTests({ boundaries: async () => { throw new Error("database unavailable"); } });
    await expect(lookupSeasonalAgriculturalBurning(31, 75, 10)).resolves.toMatchObject({ state: "unavailable", calendarState: "unavailable" });
  });

  it("returns unavailable rather than out-of-scope while the state-boundary cache is empty", async () => {
    setSeasonalAgriculturalContextForTests({ boundaries: async () => [], calendar: async () => calendar });
    await expect(lookupSeasonalAgriculturalBurning(31, 75, 10)).resolves.toMatchObject({ state: "unavailable", calendarState: "unavailable" });
  });

  it("handles a boundary polygon without asserting points beyond its geometry", () => {
    expect(pointInStateGeometry(75, 31, punjabSquare)).toBe(true);
    expect(pointInStateGeometry(78, 31, punjabSquare)).toBe(false);
  });
});
