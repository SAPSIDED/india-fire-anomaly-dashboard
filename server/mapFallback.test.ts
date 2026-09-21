import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Vercel map fallback interaction contract", () => {
  const source = readFileSync(resolve(process.cwd(), "client/src/components/Map.tsx"), "utf8");

  it("keeps the direct hotspot popup and fullscreen interaction in the fallback", () => {
    expect(source).toContain("function HotspotHoverPreview");
    expect(source).toContain('loading="lazy"');
    expect(source).toContain("requestFullscreen");
    expect(source).toContain("exitFullscreen");
    expect(source).toContain("fireguard-provider-grid");
    expect(source).toContain("LIVE EVIDENCE · NASA FIRMS");
    expect(source).toContain("Run source verification");
    expect(source).not.toContain("explorerIcon");
    expect(source).not.toContain("draggable");
    expect(source).not.toContain("Drag the field guide");
  });

  it("encodes the three meaningful analytic layers from existing hotspot fields", () => {
    expect(source).toContain("frpMw?: number | null");
    expect(source).toContain("namedFacilityMatch?: boolean");
    expect(source).toContain("activeMonths?: number | null");
    expect(source).toContain("thermalScale");
    expect(source).toContain("thermalMarkerColor");
    const css = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");
    expect(css).toContain("#f6d889");
    expect(css).toContain("#c23d37");
    expect(source).toContain("fireguard-factory-marker");
    expect(source).toContain("persistenceRings");
    expect(source).not.toContain("name=\"Exposure\"");
    expect(source).toContain("map-radar-sweep-active");
    expect(source).toContain("setRadarActive(false)");
    expect(source).toContain("onFirstHotspotClick");
    expect(source).toContain('return "#b86751"');
    expect(source).not.toContain("radar-target");
  });

  it("documents the GIS visualization label and FRP legend", () => {
    const home = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
    expect(home).toContain("GIS-BASED VISUALIZATION");
    expect(home).toContain("color-coded by fire radiative power");
    expect(home).toContain("THERMAL INTENSITY · FRP (MW)");
  });
});
