/** LIVE CORROBORATION — verifies parallel source handling and conservative conclusions with deterministic network mocks. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearEvidenceCacheForTests, evaluateCorroboration, fetchIndiaCountryFirmsSnapshot, setAuthorityIncidentEvidenceForTests, setDetectionHistoryRecorderForTests, setEvidenceCachePersistenceForTests, setGppdReferenceLookupForTests, setLandCoverFetcherForTests, setLiveEvidenceWindowForTests, setLongTermPersistenceReaderForTests } from "./corroboration";

const originalFetch = global.fetch;
const originalKey = process.env.NASA_FIRMS_MAP_KEY;

beforeEach(() => {
  setEvidenceCachePersistenceForTests(false);
});

afterEach(() => {
  global.fetch = originalFetch;
  process.env.NASA_FIRMS_MAP_KEY = originalKey;
  clearEvidenceCacheForTests();
  setLiveEvidenceWindowForTests();
  setEvidenceCachePersistenceForTests();
  setAuthorityIncidentEvidenceForTests();
  setDetectionHistoryRecorderForTests();
  setLongTermPersistenceReaderForTests();
  setLandCoverFetcherForTests();
  setGppdReferenceLookupForTests();
});

describe("evaluateCorroboration", () => {
  it("adds an in-radius GPPD plant only as optional reference context", async () => {
    process.env.NASA_FIRMS_MAP_KEY = "test-key";
    setGppdReferenceLookupForTests(async () => ({ name: "Reference Power Plant", fuelType: "Coal", capacityMw: 450.5, distanceKm: 0.71, source: "WRI Global Power Plant Database v1.3.0 (CC BY 4.0)" }));
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("fireguard-firms-relay")) return new Response("latitude,longitude,acq_date\n27.13,73.33,2026-08-25\n", { status: 200 });
      if (url.includes("overpass")) return new Response(JSON.stringify({ elements: [] }), { status: 200 });
      return new Response(JSON.stringify({ current: { temperature_2m: 39, wind_speed_10m: 14, wind_direction_10m: 220, precipitation: 0 } }), { status: 200 });
    }) as typeof fetch;

    const result = await evaluateCorroboration({ lat: 27.13, lng: 73.33, detectionId: "gppd-reference" });
    expect(result.gppdReference).toMatchObject({ name: "Reference Power Plant", fuelType: "Coal", capacityMw: 450.5, distanceKm: 0.71 });
  });

  it("keeps the country query preferred and normalizes the approved India-wide WFS fallback into snapshot rows", async () => {
    process.env.NASA_FIRMS_MAP_KEY = "test-key";
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/country/")) return new Response("Invalid API call.", { status: 400 });
      if (url.includes("/mapserver/wfs/Russia_Asia/")) {
        return new Response("latitude,longitude,brightness,acq_date,acq_time,confidence\n15.38928,75.22285,331.45,2026-08-25,841,n\n", { status: 200 });
      }
      throw new Error(`Unexpected request: ${url}`);
    }) as typeof fetch;

    const snapshot = await fetchIndiaCountryFirmsSnapshot();

    expect(snapshot.source).toBe("firms-wfs-india-fallback");
    expect(snapshot.rows).toEqual([{ latitude: "15.389280", longitude: "75.222850", brightness: "331.45", confidence: "n", acquiredDate: "2026-08-25", acquiredTime: "841" }]);
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("/api/country/"), expect.any(Object));
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("ms:fires_noaa20_24hrs"), expect.any(Object));
  });

  it("runs FIRMS, OSM, persistence, and weather checks concurrently before returning a cautious candidate", async () => {
    process.env.NASA_FIRMS_MAP_KEY = "test-key";
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("fireguard-firms-relay")) {
        return new Response("latitude,longitude\n27.13,73.33\n", { status: 200 });
      }
      if (url.includes("overpass-api")) {
        return new Response(JSON.stringify({ elements: [{ id: 1, tags: { landuse: "industrial" } }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ current: { temperature_2m: 39, wind_speed_10m: 14, wind_direction_10m: 220, precipitation: 0 } }), { status: 200 });
    }) as typeof fetch;

    const result = await evaluateCorroboration({ lat: 27.13, lng: 73.33, detectionId: "test-zone" });

    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("VIIRS_NOAA20_NRT"), expect.any(Object));
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("VIIRS_NOAA21_NRT"), expect.any(Object));
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("73.2750,27.0750,73.3850,27.1850/1"), expect.any(Object));
    expect(result.sourcesRunInParallel).toBe(true);
    expect(result.conclusion.level).toBe("candidate");
    expect(result.independentCorroboration.state).toBe("cross_platform_match");
    expect(result.classification.classification).toBe("uncertain_other");
  });

  it("returns source-provided daily counts for the seven-day FIRMS history, without inventing missing dates", async () => {
    process.env.NASA_FIRMS_MAP_KEY = "test-key";
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("fireguard-firms-relay")) {
        return new Response("latitude,longitude,acq_date\n27.13,73.33,2026-08-20\n27.13,73.33,2026-08-20\n27.13,73.33,2026-08-23\n", { status: 200 });
      }
      if (url.includes("overpass-api")) return new Response(JSON.stringify({ elements: [{ id: 1 }] }), { status: 200 });
      return new Response(JSON.stringify({ current: { temperature_2m: 39, wind_speed_10m: 14, wind_direction_10m: 220, precipitation: 0 } }), { status: 200 });
    }) as typeof fetch;

    const result = await evaluateCorroboration({ lat: 27.13, lng: 73.33, detectionId: "daily-history-zone" });

    expect(result.firmsHistory.dailyDetections).toEqual([
      { date: "2026-08-20", detections: 2 },
      { date: "2026-08-23", detections: 1 },
    ]);
    expect(result.firmsHistory.detections).toBe(3);
  });

  it("adds independently fetched land-cover context without changing the existing conclusion inputs", async () => {
    process.env.NASA_FIRMS_MAP_KEY = "test-key";
    setLandCoverFetcherForTests(async () => ({ landCoverClass: "built_up", source: "test-public-land-cover" }));
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("fireguard-firms-relay")) return new Response("latitude,longitude\n27.13,73.33\n", { status: 200 });
      if (url.includes("overpass")) return new Response(JSON.stringify({ elements: [{ id: 1 }] }), { status: 200 });
      return new Response(JSON.stringify({ current: { temperature_2m: 39, wind_speed_10m: 14, wind_direction_10m: 220, precipitation: 0 } }), { status: 200 });
    }) as typeof fetch;

    const result = await evaluateCorroboration({ lat: 27.13, lng: 73.33, detectionId: "land-cover-zone" });

    expect(result.landCover).toEqual({ landCoverClass: "built_up", source: "test-public-land-cover" });
    expect(result.classification.classification).toBe("uncertain_other");
  });

  it("does not let a hanging land-cover request delay the existing corroboration response", async () => {
    process.env.NASA_FIRMS_MAP_KEY = "test-key";
    setLandCoverFetcherForTests(() => new Promise<undefined>(() => undefined));
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("fireguard-firms-relay")) return new Response("latitude,longitude\n27.13,73.33\n", { status: 200 });
      if (url.includes("overpass")) return new Response(JSON.stringify({ elements: [{ id: 1 }] }), { status: 200 });
      return new Response(JSON.stringify({ current: { temperature_2m: 39, wind_speed_10m: 14, wind_direction_10m: 220, precipitation: 0 } }), { status: 200 });
    }) as typeof fetch;

    const startedAt = Date.now();
    const result = await evaluateCorroboration({ lat: 27.13, lng: 73.33, detectionId: "land-cover-hang-zone" });

    expect(Date.now() - startedAt).toBeLessThan(1_000);
    expect(result).not.toHaveProperty("landCover");
    expect(result.conclusion.level).toBe("candidate");
  });

  it("passes only live returned FIRMS rows to additive detection-history storage and exposes a long-term summary", async () => {
    process.env.NASA_FIRMS_MAP_KEY = "test-key";
    const captured: Array<Array<{ latitude: string; longitude: string; detectionDate: string; brightness: string | null; confidence: string | null }>> = [];
    setDetectionHistoryRecorderForTests(async rows => { captured.push(rows); });
    setLongTermPersistenceReaderForTests(async () => ({ state: "available", totalDetectionCount: 3, firstSeen: "2026-06-20", lastSeen: "2026-08-25", activeMonths: 3 }));
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("fireguard-firms-relay")) return new Response("latitude,longitude,acq_date,bright_ti4,confidence\n27.13,73.33,2026-08-25,332.5,h\n", { status: 200 });
      if (url.includes("overpass")) return new Response(JSON.stringify({ elements: [{ id: 1 }] }), { status: 200 });
      return new Response(JSON.stringify({ current: { temperature_2m: 39, wind_speed_10m: 14, wind_direction_10m: 220, precipitation: 0 } }), { status: 200 });
    }) as typeof fetch;

    const result = await evaluateCorroboration({ lat: 27.13, lng: 73.33, detectionId: "history-capture-zone" });

    expect(captured.flat()).toEqual(expect.arrayContaining([
      expect.objectContaining({ latitude: "27.130000", longitude: "73.330000", detectionDate: "2026-08-25", brightness: "332.5", confidence: "h" }),
    ]));
    expect(result.longTermHistory).toEqual({ state: "available", totalDetectionCount: 3, firstSeen: "2026-06-20", lastSeen: "2026-08-25", activeMonths: 3 });
  });

  it("does not send cached or unavailable FIRMS results to detection-history storage and keeps database history additive", async () => {
    process.env.NASA_FIRMS_MAP_KEY = "test-key";
    const captured: unknown[] = [];
    setDetectionHistoryRecorderForTests(async rows => { captured.push(rows); });
    setLongTermPersistenceReaderForTests(async () => ({ state: "unavailable", totalDetectionCount: 0, firstSeen: null, lastSeen: null, activeMonths: 0 }));
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("fireguard-firms-relay")) return new Response("latitude,longitude,acq_date\n27.13,73.33,2026-08-25\n", { status: 200 });
      if (url.includes("overpass")) return new Response(JSON.stringify({ elements: [{ id: 1 }] }), { status: 200 });
      return new Response(JSON.stringify({ current: { temperature_2m: 39, wind_speed_10m: 14, wind_direction_10m: 220, precipitation: 0 } }), { status: 200 });
    }) as typeof fetch;
    await evaluateCorroboration({ lat: 27.13, lng: 73.33, detectionId: "history-cache-zone" });
    captured.length = 0;

    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("fireguard-firms-relay")) throw new Error("live FIRMS offline");
      if (url.includes("overpass")) return new Response(JSON.stringify({ elements: [{ id: 1 }] }), { status: 200 });
      return new Response(JSON.stringify({ current: { temperature_2m: 39, wind_speed_10m: 14, wind_direction_10m: 220, precipitation: 0 } }), { status: 200 });
    }) as typeof fetch;
    const cached = await evaluateCorroboration({ lat: 27.13, lng: 73.33, detectionId: "history-cache-zone" });
    clearEvidenceCacheForTests();
    const unavailable = await evaluateCorroboration({ lat: 31.411, lng: 75.991, detectionId: "history-unavailable-zone" });

    expect(captured).toEqual([]);
    expect(cached.firmsCurrent.state).toBe("cached");
    expect(cached.longTermHistory.state).toBe("unavailable");
    expect(unavailable.firmsCurrent.state).toBe("unavailable");
    expect(unavailable.longTermHistory.state).toBe("unavailable");
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

  it("prefers a completed local WFS detection over an earlier successful zero-row Area response", async () => {
    process.env.NASA_FIRMS_MAP_KEY = "test-key";
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/area/") || url.includes("/api/country/")) return new Response("latitude,longitude,acq_date\n", { status: 200 });
      if (url.includes("ms:fires_noaa20_24hrs")) {
        await new Promise(resolve => setTimeout(resolve, 10));
        return new Response("latitude,longitude,acq_date\n29.45627,76.8924,2026-08-25\n", { status: 200 });
      }
      if (url.includes("/mapserver/wfs/Russia_Asia/")) return new Response("latitude,longitude,acq_date\n", { status: 200 });
      if (url.includes("overpass")) return new Response(JSON.stringify({ elements: [{ id: 1 }] }), { status: 200 });
      return new Response(JSON.stringify({ current: { temperature_2m: 39, wind_speed_10m: 14, wind_direction_10m: 220, precipitation: 0 } }), { status: 200 });
    }) as typeof fetch;

    const result = await evaluateCorroboration({ lat: 29.45627, lng: 76.8924, detectionId: "prefer-local-wfs-zone" });

    expect(result.firmsCurrent.state).toBe("available");
    expect(result.firmsCurrent.detections).toBe(1);
    expect(result.firmsCurrent.detail).toContain("1 live NASA FIRMS NOAA-20 detection");
  });

  it("returns a positive FIRMS response without waiting for a hanging sibling route", async () => {
    process.env.NASA_FIRMS_MAP_KEY = "test-key";
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("VIIRS_NOAA20_NRT/IND/1")) return new Promise<Response>(() => undefined);
      if (url.includes("/api/area/") || url.includes("/api/country/")) return new Response("latitude,longitude,acq_date\n", { status: 200 });
      if (url.includes("ms:fires_noaa20_24hrs")) {
        await new Promise(resolve => setTimeout(resolve, 25));
        return new Response("latitude,longitude,acq_date\n29.45627,76.8924,2026-08-25\n", { status: 200 });
      }
      if (url.includes("/mapserver/wfs/Russia_Asia/")) return new Response("latitude,longitude,acq_date\n", { status: 200 });
      if (url.includes("overpass")) return new Response(JSON.stringify({ elements: [{ id: 1 }] }), { status: 200 });
      return new Response(JSON.stringify({ current: { temperature_2m: 39, wind_speed_10m: 14, wind_direction_10m: 220, precipitation: 0 } }), { status: 200 });
    }) as typeof fetch;

    const startedAt = Date.now();
    const result = await evaluateCorroboration({ lat: 29.45627, lng: 76.8924, detectionId: "positive-before-hanging-sibling-zone" });

    expect(result.firmsCurrent.detections).toBe(1);
    expect(Date.now() - startedAt).toBeLessThan(1_000);
  });

  it("uses the official FIRMS Russia and Asia WFS route when API routes are unavailable", async () => {
    process.env.NASA_FIRMS_MAP_KEY = "test-key";
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/area/") || url.includes("/api/country/")) return new Response("retry later", { status: 503 });
      if (url.includes("/mapserver/wfs/Russia_Asia/")) return new Response("latitude,longitude\n27.13,73.33\n", { status: 200 });
      if (url.includes("overpass")) return new Response(JSON.stringify({ elements: [{ id: 1 }] }), { status: 200 });
      return new Response(JSON.stringify({ current: { temperature_2m: 39, wind_speed_10m: 14, wind_direction_10m: 220, precipitation: 0 } }), { status: 200 });
    }) as typeof fetch;

    const result = await evaluateCorroboration({ lat: 27.13, lng: 73.33, detectionId: "wfs-zone" });

    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("/mapserver/wfs/Russia_Asia/"), expect.any(Object));
    expect(result.firmsCurrent.state).toBe("available");
    expect(result.firmsIndependentCurrent.state).toBe("available");
  });

  it("uses the managed Google Places facility fallback when every OSM mirror is unavailable", async () => {
    process.env.NASA_FIRMS_MAP_KEY = "test-key";
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("fireguard-firms-relay")) return new Response("latitude,longitude\n27.13,73.33\n", { status: 200 });
      if (url.includes("overpass")) throw new Error("OSM mirrors unavailable");
      if (url.includes("/v1/maps/proxy/maps/api/place/nearbysearch/json")) {
        return new Response(JSON.stringify({ status: "OK", results: [{ place_id: "facility-1", name: "Industrial Facility", formatted_address: "India", geometry: { location: { lat: 27.13, lng: 73.33 } }, business_status: "OPERATIONAL", types: ["point_of_interest"] }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ current: { temperature_2m: 39, wind_speed_10m: 14, wind_direction_10m: 220, precipitation: 0 } }), { status: 200 });
    }) as typeof fetch;

    const result = await evaluateCorroboration({ lat: 27.13, lng: 73.33, detectionId: "places-zone" });

    expect(result.industrial.state).toBe("available");
    expect(result.industrial.provider).toBe("google-places-industrial");
    expect(result.industrial.features).toBe(1);
  });

  it("uses timestamped cache as evidence-pending rather than making a false live conclusion", async () => {
    process.env.NASA_FIRMS_MAP_KEY = "test-key";
    const successfulFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("fireguard-firms-relay")) return new Response("latitude,longitude\n27.13,73.33\n", { status: 200 });
      if (url.includes("overpass")) return new Response(JSON.stringify({ elements: [{ id: 1 }] }), { status: 200 });
      return new Response(JSON.stringify({ current: { temperature_2m: 39, wind_speed_10m: 14, wind_direction_10m: 220, precipitation: 0 } }), { status: 200 });
    });
    global.fetch = successfulFetch as typeof fetch;
    await evaluateCorroboration({ lat: 27.13, lng: 73.33, detectionId: "cache-zone" });

    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("fireguard-firms-relay")) throw new Error("upstream reset");
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
    setLiveEvidenceWindowForTests(200);
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
      if (url.includes("/api/country/")) return new Response("fallback unavailable", { status: 503 });
      if (url.includes("/mapserver/wfs/")) return new Response("wfs unavailable", { status: 503 });
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

  it("only elevates a live, cross-platform industrial candidate when a time-aligned authority or facility record exists", async () => {
    process.env.NASA_FIRMS_MAP_KEY = "test-key";
    setAuthorityIncidentEvidenceForTests([{
      id: 42,
      sourceType: "authority",
      sourceName: "Official fire service bulletin",
      incidentReference: "FS-2026-042",
      reportedAt: "2026-08-25T08:15:00.000Z",
      verifiedAt: "2026-08-25T08:20:00.000Z",
    }]);
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("fireguard-firms-relay")) return new Response("latitude,longitude\n27.13,73.33\n", { status: 200 });
      if (url.includes("overpass")) return new Response(JSON.stringify({ elements: [{ id: 1 }] }), { status: 200 });
      return new Response(JSON.stringify({ current: { temperature_2m: 39, wind_speed_10m: 14, wind_direction_10m: 220, precipitation: 0 } }), { status: 200 });
    }) as typeof fetch;

    const result = await evaluateCorroboration({ lat: 27.13, lng: 73.33, detectionId: "authority-zone" });

    expect(result.incidentEvidence.records).toHaveLength(1);
    expect(result.conclusion.level).toBe("confirmed_incident");
    expect(result.conclusion.title).toContain("external report recorded");
  });
});
