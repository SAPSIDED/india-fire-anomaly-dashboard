import { afterEach, describe, expect, it, vi } from "vitest";
import { loadIndiaGasFlareReference, lookupNearestFirmsGasFlare, parseIndiaGasFlareRows, setGasFlareReferenceForTests } from "./flareReference";

const validCache = { payload: "{}", fetchedAt: new Date("2026-08-27T00:00:00Z"), expiresAt: new Date("2027-08-27T00:00:00Z") };

afterEach(() => setGasFlareReferenceForTests());

describe("public gas-flare reference", () => {
  it("parses only valid India rows from the documented public workbook schema", () => {
    const rows = parseIndiaGasFlareRows([
      ["Flare id", "Country", "Latitude", "Longitude", "Location", "Field Type", "Field name", "Operator", 2025],
      ["in-1", "India", 20.1234567, 77.1234567, "ONSHORE", "OIL", "Test field", "Operator", 2.5],
      ["other", "Pakistan", 20, 77, "ONSHORE", "OIL", "Other field", "Other", 1],
      ["bad", "India", "not-a-coordinate", 77, "ONSHORE", "OIL", "Invalid", "Operator", 1],
    ]);

    expect(rows).toEqual([expect.objectContaining({ flareId: "in-1", country: "India", latitude: "20.123457", longitude: "77.123457", latestAnnualVolumeMcm: "2.500000000", sourceDataYear: 2025 })]);
  });

  it("returns the closest local reference candidate after the indexed bounding-box query and exact Haversine check", async () => {
    setGasFlareReferenceForTests({
      candidates: async () => [{ flareId: "in-1", latitude: "20.000300", longitude: "77.000300", location: "ONSHORE", fieldType: "OIL", fieldName: "Field A", operator: "Operator A", latestAnnualVolumeMcm: "1.250000000", sourceDataYear: 2025 }],
    });

    const result = await lookupNearestFirmsGasFlare(20, 77, 2);

    expect(result).toMatchObject({ state: "available", candidateCount: 1, dataYear: 2025, match: { flareId: "in-1", fieldName: "Field A", distanceKm: expect.any(Number) } });
    expect(result.match?.distanceKm).toBeLessThan(0.1);
  });

  it("rejects a distant candidate after the exact distance check even if a test reader returns it", async () => {
    setGasFlareReferenceForTests({
      candidates: async () => [{ flareId: "far", latitude: "25.000000", longitude: "82.000000", location: null, fieldType: null, fieldName: null, operator: null, latestAnnualVolumeMcm: null, sourceDataYear: 2025 }],
      readCache: async () => validCache,
    });

    const result = await lookupNearestFirmsGasFlare(20, 77, 2);

    expect(result).toEqual({ state: "available", candidateCount: 1, dataYear: 2025 });
  });

  it("does not download a reference workbook during an unavailable user proximity lookup", async () => {
    const fetchRows = vi.fn(async () => [["Flare id", "Country", "Latitude", "Longitude", "Location", "Field Type", "Field name", "Operator", 2025]]);
    setGasFlareReferenceForTests({ candidates: async () => [], fetchRows, readCache: async () => undefined });

    const result = await lookupNearestFirmsGasFlare(20, 77, 2);

    expect(result).toEqual({ state: "unavailable", candidateCount: 0, dataYear: null });
    expect(fetchRows).not.toHaveBeenCalled();
  });

  it("returns cached reference context when indexed storage is temporarily unavailable", async () => {
    setGasFlareReferenceForTests({
      candidates: async () => { throw new Error("database unavailable"); },
      readCache: async key => key.includes(":nearest:")
        ? { ...validCache, payload: JSON.stringify({ flareId: "cached", latitude: 20.0001, longitude: 77.0001, distanceKm: 0.02, source: "Fixture catalog", sourceDataYear: 2025, fieldType: "OIL", fieldName: null, operator: null, location: "ONSHORE", latestAnnualVolumeMcm: 1 }) }
        : undefined,
    });

    const result = await lookupNearestFirmsGasFlare(20, 77, 2);

    expect(result).toMatchObject({ state: "cached", candidateCount: 1, dataYear: 2025, match: { flareId: "cached" } });
  });

  it("does not replace the existing local index if the source read fails", async () => {
    const replace = vi.fn(async () => ({ loadedAt: new Date(), rowCount: 202 }));
    setGasFlareReferenceForTests({ fetchRows: async () => { throw new Error("source unavailable"); }, replace });

    await expect(loadIndiaGasFlareReference()).resolves.toBe(false);
    expect(replace).not.toHaveBeenCalled();
  });

  it("loads a complete India-only reference set atomically after a successful source read", async () => {
    const replace = vi.fn(async rows => ({ loadedAt: new Date(), rowCount: rows.length }));
    setGasFlareReferenceForTests({
      fetchRows: async () => [
        ["Flare id", "Country", "Latitude", "Longitude", "Location", "Field Type", "Field name", "Operator", 2025],
        ["in-1", "India", 20, 77, "ONSHORE", "OIL", "Field", "Operator", 1],
      ],
      replace,
      writeCache: async () => undefined,
    });

    await expect(loadIndiaGasFlareReference()).resolves.toBe(true);
    expect(replace).toHaveBeenCalledWith([expect.objectContaining({ flareId: "in-1", country: "India" })]);
  });
});
