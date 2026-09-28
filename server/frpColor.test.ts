import { describe, expect, it } from "vitest";
import { thermalMarkerColor } from "../client/src/lib/frpColor";

describe("thermalMarkerColor", () => {
  const frpValues = [1, 2, 3, 4, 5, 6];

  it("maps low, medium, and high FRP to yellow, orange, and red", () => {
    expect(thermalMarkerColor(1, frpValues)).toBe("#ffe046");
    expect(thermalMarkerColor(3, frpValues)).toBe("#ef761c");
    expect(thermalMarkerColor(6, frpValues)).toBe("#be1818");
  });

  it("uses a neutral fallback when FRP is unavailable", () => {
    expect(thermalMarkerColor(null, frpValues)).toBe("#9a8f84");
    expect(thermalMarkerColor(Number.NaN, frpValues)).toBe("#9a8f84");
  });
});
