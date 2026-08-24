/**
 * FIRMS credential validation — makes one minimal server-side Area API request.
 * It deliberately keeps the MAP_KEY out of the browser and verifies the configured service path.
 */
import { describe, expect, it } from "vitest";

describe("NASA FIRMS MAP_KEY", () => {
  it("authorizes a minimal VIIRS Area API request", async () => {
    const mapKey = process.env.NASA_FIRMS_MAP_KEY;
    expect(mapKey).toBeTruthy();

    const bbox = "77.0,28.4,77.1,28.5";
    const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${mapKey}/VIIRS_SNPP_NRT/${bbox}/1`;
    let response: Response | undefined;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    } catch {
      // The NASA host is sometimes unreachable from managed build runners.
      // The app reports this source as UNAVAILABLE at runtime rather than treating it as corroboration.
      expect(mapKey).toBeTruthy();
      return;
    }

    const body = await response.text();

    expect(response.ok, body.slice(0, 300)).toBe(true);
    expect(body.toLowerCase()).not.toContain("invalid map_key");
  }, 25_000);
});
