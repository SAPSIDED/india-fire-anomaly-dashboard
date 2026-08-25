/** LIVE CORROBORATION — verifies parallel source handling and conservative conclusions with deterministic network mocks. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearEvidenceCacheForTests, evaluateCorroboration } from "./corroboration";

const originalFetch = global.fetch;
const originalKey = process.env.NASA_FIRMS_MAP_KEY;

afterEach(() => {
  global.fetch = originalFetch;
  process.env.NASA_FIRMS_MAP_KEY = originalKey;
  clearEvidenceCacheForTests();
});

describe("evaluateCorroboration", () => {
  it("runs FIRMS, OSM, persistence, and weather checks concurrently before returning a cautious candidate", async () => {
    process.env.NASA_FIRMS_MAP_KEY = "test-key";
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("firms.modaps")) {
        return new Response("latitude,longitude\n27.13,73.33\n", { status: 200 });
      }
      if (url.includes("overpass-api")) {
        return new Response(JSON.stringify({ elements: [{ id: 1, tags: { landuse: "industrial" } }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ current: { temperature_2m: 39, wind_speed_10m: 14, wind_direction_10m: 220, precipitation: 0 } }), { status: 200 });
    }) as typeof fetch;

    const result = await evaluateCorroboration({ lat: 27.13, lng: 73.33, detectionId: "test-zone" });

    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("VIIRS_NOAA20_NRT"), expect.any(Object));
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("VIIRS_SNPP_NRT"), expect.any(Object));
    expect(result.sourcesRunInParallel).toBe(true);
    expect(result.conclusion.level).toBe("candidate");
    expect(result.independentCorroboration.state).toBe("cross_platform_match");
  });

  it("falls back from the bounded-retry area route to the FIRMS India route", async () => {
    process.env.NASA_FIRMS_MAP_KEY = "test-key";
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/area/")) return new Response("retry later", { status: 503 });
      if (url.includes("/api/country/")) return new Response("latitude,longitude\n27.13,73.33\n", { status: 200 });
      if (url.includes("overpass")) return new Response(JSON.stringify({ elements: [{ id: 1 }] }), { status: 200 });
      return new Response(JSON.stringify({ current: { temperature_2m: 39, wind_speed_10m: 14, wind_direction_10m: 220, precipitation: 0 } }), { status: 200 });
    }) as typeof fetch;

    const result = await evaluateCorroboration({ lat: 27.13, lng: 73.33, detectionId: "fallback-zone" });

    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("/api/country/"), expect.any(Object));
    expect(result.firmsCurrent.state).toBe("available");
    expect(result.conclusion.level).toBe("candidate");
  });

  it("uses timestamped cache as evidence-pending rather than making a false live conclusion", async () => {
    process.env.NASA_FIRMS_MAP_KEY = "test-key";
    const successfulFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("firms.modaps")) return new Response("latitude,longitude\n27.13,73.33\n", { status: 200 });
      if (url.includes("overpass")) return new Response(JSON.stringify({ elements: [{ id: 1 }] }), { status: 200 });
      return new Response(JSON.stringify({ current: { temperature_2m: 39, wind_speed_10m: 14, wind_direction_10m: 220, precipitation: 0 } }), { status: 200 });
    });
    global.fetch = successfulFetch as typeof fetch;
    await evaluateCorroboration({ lat: 27.13, lng: 73.33, detectionId: "cache-zone" });

    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("firms.modaps")) throw new Error("upstream reset");
      if (url.includes("overpass")) return new Response(JSON.stringify({ elements: [{ id: 1 }] }), { status: 200 });
      return new Response(JSON.stringify({ current: { temperature_2m: 39, wind_speed_10m: 14, wind_direction_10m: 220, precipitation: 0 } }), { status: 200 });
    }) as typeof fetch;

    const result = await evaluateCorroboration({ lat: 27.13, lng: 73.33, detectionId: "cache-zone" });

    expect(result.firmsCurrent.state).toBe("cached");
    expect(result.conclusion.level).toBe("evidence_pending");
  });

  it("returns evidence-pending without crashing when FIRMS and OSM fail and no verified cache exists", async () => {
    process.env.NASA_FIRMS_MAP_KEY = "test-key";
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("open-meteo")) {
        return new Response(JSON.stringify({ current: { temperature_2m: 39, wind_speed_10m: 14, wind_direction_10m: 220, precipitation: 0 } }), { status: 200 });
      }
      throw new Error("simulated upstream outage");
    }) as typeof fetch;

    const result = await evaluateCorroboration({ lat: 31.411, lng: 75.991, detectionId: "outage-zone" });

    expect(result.firmsCurrent.state).toBe("unavailable");
    expect(result.industrial.state).toBe("unavailable");
    expect(result.conclusion.level).toBe("evidence_pending");
    expect(result.conclusion.title).toContain("Evidence pending");
  });

  it("closes the live evidence window with a safe pending verdict when sources hang", async () => {
    process.env.NASA_FIRMS_MAP_KEY = "test-key";
    global.fetch = vi.fn(() => new Promise<Response>(() => undefined)) as typeof fetch;

    const result = await evaluateCorroboration({ lat: 30.811, lng: 76.911, detectionId: "slow-zone" });

    expect(result.conclusion.level).toBe("evidence_pending");
    expect(result.conclusion.title).toContain("sources still delayed");
  }, 10_000);

  it("retries failed source requests and accepts an independent Overpass mirror response", async () => {
    process.env.NASA_FIRMS_MAP_KEY = "test-key";
    const areaAttempts = new Map<string, number>();
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/area/")) {
        const attempts = (areaAttempts.get(url) ?? 0) + 1;
        areaAttempts.set(url, attempts);
        if (attempts === 1) return new Response("retry", { status: 503 });
        return new Response("latitude,longitude\n27.13,73.33\n", { status: 200 });
      }
      if (url.includes("overpass-api.de")) throw new Error("primary mirror unavailable");
      if (url.includes("overpass.kumi.systems")) return new Response(JSON.stringify({ elements: [{ id: 1 }] }), { status: 200 });
      if (url.includes("overpass.private.coffee")) throw new Error("third mirror unavailable");
      return new Response(JSON.stringify({ current: { temperature_2m: 39, wind_speed_10m: 14, wind_direction_10m: 220, precipitation: 0 } }), { status: 200 });
    }) as typeof fetch;

    const result = await evaluateCorroboration({ lat: 27.13, lng: 73.33, detectionId: "retry-zone" });

    expect([...areaAttempts.values()]).toEqual(expect.arrayContaining([2]));
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("overpass.kumi.systems"), expect.any(Object));
    expect(result.industrial.state).toBe("available");
  });
});
