import { describe, expect, it } from "vitest";
import { thermalMarkerColor } from "../client/src/lib/frpColor";

describe("thermalMarkerColor", () => {
  const frpValues = [1, 2, 3, 4, 5, 6];

  it("keeps every hotspot red regardless of FRP value or availability", () => {
    expect(thermalMarkerColor(1, frpValues)).toBe("#c92828");
    expect(thermalMarkerColor(3, frpValues)).toBe("#c92828");
    expect(thermalMarkerColor(6, frpValues)).toBe("#c92828");
    expect(thermalMarkerColor(null, frpValues)).toBe("#c92828");
    expect(thermalMarkerColor(Number.NaN, frpValues)).toBe("#c92828");
  });
});
