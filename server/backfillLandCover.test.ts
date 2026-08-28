import { describe, expect, it, vi } from "vitest";
import { backfillMissingLandCover } from "./backfillLandCover";

const cachedPayload = JSON.stringify({ landCoverClass: "cropland", source: "Esri" });

describe("backfillMissingLandCover", () => {
  it("deduplicates history locations and skips coordinates with valid persisted land-cover evidence", async () => {
    const fetch = vi.fn(async () => ({ landCoverClass: "forest_vegetation", source: "Esri" }));
    const result = await backfillMissingLandCover({
      historyRows: [
        { latitude: "20.000000", longitude: "75.000000" },
        { latitude: "20.000000", longitude: "75.000000" },
        { latitude: "21.000000", longitude: "76.000000" },
      ],
      cachedEntries: [{ provider: "esri-sentinel2-landcover", cacheKey: "landcover-esri:20.00000:75.00000", payload: cachedPayload }],
      fetch,
      delayMs: 0,
    });
    expect(result).toEqual({ historyRows: 3, uniqueLocations: 2, alreadyCached: 1, attempted: 1, succeeded: 1, failed: 0 });
    expect(fetch).toHaveBeenCalledWith(21, 76);
  });

  it("rate-limits attempts and continues after undefined results or individual request failures", async () => {
    const sleep = vi.fn(async () => undefined);
    const logFailure = vi.fn();
    const fetch = vi.fn()
      .mockResolvedValueOnce({ landCoverClass: "cropland", source: "Esri" })
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("temporary source error"));
    const result = await backfillMissingLandCover({
      historyRows: [
        { latitude: 20, longitude: 75 }, { latitude: 21, longitude: 75 }, { latitude: 22, longitude: 75 },
      ],
      cachedEntries: [], fetch, delayMs: 250, sleep, logFailure,
    });
    expect(result).toEqual({ historyRows: 3, uniqueLocations: 3, alreadyCached: 0, attempted: 3, succeeded: 1, failed: 2 });
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(250);
    expect(logFailure).toHaveBeenCalledTimes(2);
  });

  it("does not treat malformed persisted cache payloads as land-cover evidence", async () => {
    const fetch = vi.fn(async () => ({ landCoverClass: "bare_other", source: "Esri" }));
    const result = await backfillMissingLandCover({
      historyRows: [{ latitude: 20, longitude: 75 }],
      cachedEntries: [{ provider: "esri-sentinel2-landcover", cacheKey: "landcover-esri:20.00000:75.00000", payload: "not-json" }],
      fetch, delayMs: 0,
    });
    expect(result).toMatchObject({ alreadyCached: 0, attempted: 1, succeeded: 1, failed: 0 });
  });
});
