import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Vercel map fallback interaction contract", () => {
  const source = readFileSync(resolve(process.cwd(), "client/src/components/Map.tsx"), "utf8");

  it("keeps the optimized hover preview and fullscreen interaction in the fallback", () => {
    expect(source).toContain("function HotspotHoverPreview");
    expect(source).toContain('loading="lazy"');
    expect(source).toContain("requestFullscreen");
    expect(source).toContain("exitFullscreen");
    expect(source).toContain("fireguard-provider-grid");
    expect(source).toContain("To run source verification please click on a hotspot");
    expect(source).toContain('permanent direction="right"');
    expect(source).toContain("fireguard-explorer-tooltip");
  });

  it("encodes the three meaningful analytic layers from existing hotspot fields", () => {
    expect(source).toContain("frpMw?: number | null");
    expect(source).toContain("namedFacilityMatch?: boolean");
    expect(source).toContain("activeMonths?: number | null");
    expect(source).toContain("thermalScale");
    expect(source).toContain("fireguard-factory-marker");
    expect(source).toContain("persistenceRings");
    expect(source).not.toContain("name=\"Exposure\"");
    expect(source).toContain("map-radar-sweep-active");
    expect(source).toContain("setRadarActive(false)");
    expect(source).toContain("onFirstHotspotClick");
  });
});
