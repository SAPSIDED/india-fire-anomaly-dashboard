/** LIVE CORROBORATION — verifies parallel source handling and conservative conclusions with deterministic network mocks. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { evaluateCorroboration } from "./corroboration";

const originalFetch = global.fetch;
const originalKey = process.env.NASA_FIRMS_MAP_KEY;

afterEach(() => {
  global.fetch = originalFetch;
  process.env.NASA_FIRMS_MAP_KEY = originalKey;
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

    expect(global.fetch).toHaveBeenCalledTimes(5);
    expect(result.sourcesRunInParallel).toBe(true);
    expect(result.conclusion.level).toBe("candidate");
    expect(result.independentCorroboration.state).toBe("cross_platform_match");
  });
});
