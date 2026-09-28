import { describe, expect, it } from "vitest";
import { thermalMarkerColor } from "../client/src/lib/frpColor";

describe("thermalMarkerColor", () => {
  const frpValues = [1, 2, 3, 4, 5, 6];

  it("maps low, medium, and high FRP to yellow, orange, and red", () => {
    expect(thermalMarkerColor(1, frpValues)).toBe("#f4d35e");
    expect(thermalMarkerColor(3, frpValues)).toBe("#f29a33");
    expect(thermalMarkerColor(6, frpValues)).toBe("#c92828");
  });

  it("uses a neutral fallback when FRP is unavailable", () => {
    expect(thermalMarkerColor(null, frpValues)).toBe("#9a8f84");
    expect(thermalMarkerColor(Number.NaN, frpValues)).toBe("#9a8f84");
  });
});
