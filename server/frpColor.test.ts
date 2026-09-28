import { describe, expect, it } from "vitest";
import { thermalMarkerColor } from "../client/src/lib/frpColor";

describe("thermalMarkerColor", () => {
  it("uses fixed yellow, orange, and red MW bands", () => {
    expect(thermalMarkerColor(4.99)).toBe("#ffe046");
    expect(thermalMarkerColor(5)).toBe("#eb5c12");
    expect(thermalMarkerColor(19.99)).toBe("#eb5c12");
    expect(thermalMarkerColor(20)).toBe("#be1818");
  });

  it("uses a neutral fallback when FRP is unavailable", () => {
    expect(thermalMarkerColor(null)).toBe("#9a8f84");
    expect(thermalMarkerColor(Number.NaN)).toBe("#9a8f84");
  });
});
