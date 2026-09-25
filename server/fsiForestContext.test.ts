import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchFsiForestContext, setFsiForestContextCacheForTests } from "./fsiForestContext";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  setFsiForestContextCacheForTests();
  vi.restoreAllMocks();
});

describe("uploaded FSI forest-cover research context", () => {
  it("joins state-level CSV evidence while keeping point membership unknown", async () => {
    global.fetch = vi.fn(async (url: string | URL) => {
      const isFire = String(url).includes("District_Wise_Forest_Fire");
      const attributes = isFire
        ? { districtname: "Test District", statename: "Karnataka", viirs_2022_23: 12, viirs_2023_24: 18 }
        : { districtname: "Test District", statename: "Karnataka", calarea: 190000, total: 38730, percalarea: 20.2, vdf2023: 0, mdf2023: 0, of2023: 0, scrub: 0 };
      return new Response(JSON.stringify({ features: [{ attributes }] }), { status: 200 });
    }) as typeof fetch;
    setFsiForestContextCacheForTests({ read: async () => undefined, write: async () => undefined });

    const result = await fetchFsiForestContext(15.3, 75.8);

    expect(result.stateName).toBe("Karnataka");
    expect(result.researchForestCoverYear).toBe(2021);
    expect(result.researchForestCoverPct).toBe(20.2);
    expect(result.researchForestCoverChangeSqKm).toBe(155);
    expect(result.pointForestStatus).toBe("unknown");
    expect(result.historicalForestFireDetections).toBe(18);
  });
});
