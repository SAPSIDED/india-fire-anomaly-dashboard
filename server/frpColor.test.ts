import { describe, expect, it } from "vitest";
import { thermalMarkerColor } from "../client/src/lib/frpColor";

describe("thermalMarkerColor", () => {
  const frpValues = [1, 2, 3, 4, 5, 6];

  it("maps lower, middle, and maximum FRP bands to yellow, orange, and red", () => {
    expect(thermalMarkerColor(1, frpValues)).toBe("#f4d35e");
    expect(thermalMarkerColor(3, frpValues)).toBe("#f28c28");
    expect(thermalMarkerColor(6, frpValues)).toBe("#c92828");
  });

  it("uses gray instead of implying an FRP level when data is unavailable", () => {
    expect(thermalMarkerColor(null, frpValues)).toBe("#89918f");
    expect(thermalMarkerColor(Number.NaN, frpValues)).toBe("#89918f");
  });

  it("uses medium orange when all available FRP values are identical", () => {
    expect(thermalMarkerColor(8, [8, 8, 8])).toBe("#f28c28");
  });
});
