import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchLandCover, setLandCoverCacheForTests } from "./landcover";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  setLandCoverCacheForTests();
});

describe("fetchLandCover", () => {
  it("maps a live public service class and caches the successful point lookup for 30 days", async () => {
    const writes: Array<{ cacheKey: string; provider: string; payload: string; fetchedAt: Date; expiresAt: Date }> = [];
    setLandCoverCacheForTests({
      read: async () => undefined,
      write: async input => { writes.push(input); },
    });
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ value: "7" }), { status: 200 })) as typeof fetch;

    const result = await fetchLandCover(15.38928, 75.22285);

    expect(result).toEqual({ landCoverClass: "built_up", source: "Esri Sentinel-2 10m Land Use/Land Cover Time Series" });
    expect(writes).toHaveLength(1);
    expect(writes[0]?.provider).toBe("esri-sentinel2-landcover");
    expect(writes[0]?.expiresAt.getTime()).toBeGreaterThan(writes[0]!.fetchedAt.getTime() + 29 * 24 * 60 * 60_000);
  });

  it("returns a still-valid cached value when the live public source is unavailable", async () => {
    setLandCoverCacheForTests({
      read: async () => ({
        payload: JSON.stringify({ landCoverClass: "forest_vegetation", source: "Esri Sentinel-2 10m Land Use/Land Cover Time Series" }),
        fetchedAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
      }),
      write: async () => undefined,
    });
    global.fetch = vi.fn(async () => { throw new Error("public source offline"); }) as typeof fetch;

    await expect(fetchLandCover(15.38928, 75.22285)).resolves.toEqual({ landCoverClass: "forest_vegetation", source: "Esri Sentinel-2 10m Land Use/Land Cover Time Series" });
  });

  it("omits the result when neither a live nor valid cached class is available", async () => {
    setLandCoverCacheForTests({ read: async () => undefined, write: async () => undefined });
    global.fetch = vi.fn(async () => { throw new Error("public source offline"); }) as typeof fetch;

    await expect(fetchLandCover(15.38928, 75.22285)).resolves.toBeUndefined();
  });
});
