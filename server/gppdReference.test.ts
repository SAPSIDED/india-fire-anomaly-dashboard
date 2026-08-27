import { afterEach, describe, expect, it, vi } from "vitest";
import { loadIndiaGppdReference, lookupNearestGppdPlant, parseIndiaGppdCsv, setGppdReferenceForTests } from "./gppdReference";

const header = "country,country_long,name,gppd_idnr,capacity_mw,latitude,longitude,primary_fuel";
const indiaRow = "IND,India,Example Thermal Plant,WRI-IND-1,450.5,20.0000,77.0000,Coal";
const nonIndiaRow = "USA,United States,Excluded Plant,WRI-USA-1,100,40,-75,Gas";

afterEach(() => setGppdReferenceForTests());

describe("GPPD India reference", () => {
  it("ingests only valid India GPPD records and records a successful reference cache entry", async () => {
    const replace = vi.fn().mockResolvedValue({ loadedAt: new Date(), rowCount: 1 });
    const writeCache = vi.fn().mockResolvedValue(undefined);
    setGppdReferenceForTests({ fetchCsv: async () => [header, indiaRow, nonIndiaRow].join("\n"), replace, writeCache });

    await expect(loadIndiaGppdReference()).resolves.toBe(true);
    expect(replace).toHaveBeenCalledWith([expect.objectContaining({
      country: "IND", gppdId: "WRI-IND-1", name: "Example Thermal Plant", primaryFuel: "Coal", capacityMw: "450.500",
    })]);
    expect(writeCache).toHaveBeenCalledWith(expect.objectContaining({ provider: "wri-gppd-india" }));
  });

  it("returns the nearest in-radius GPPD plant with its reference attributes", async () => {
    setGppdReferenceForTests({
      candidates: async () => [
        { name: "Further Plant", primaryFuel: "Gas", capacityMw: "200.000", latitude: "20.010000", longitude: "77.010000" },
        { name: "Nearest Plant", primaryFuel: "Coal", capacityMw: "450.500", latitude: "20.002000", longitude: "77.001000" },
      ],
    });

    await expect(lookupNearestGppdPlant(20, 77, 2)).resolves.toMatchObject({
      name: "Nearest Plant", fuelType: "Coal", capacityMw: 450.5,
    });
  });

  it("continues to return a persisted reference match after a fresh GPPD data-load failure", async () => {
    setGppdReferenceForTests({
      fetchCsv: async () => { throw new Error("source unavailable"); },
      candidates: async () => [{ name: "Cached Plant", primaryFuel: "Solar", capacityMw: "75.000", latitude: "20.001000", longitude: "77.001000" }],
    });

    await expect(loadIndiaGppdReference()).resolves.toBe(false);
    await expect(lookupNearestGppdPlant(20, 77, 2)).resolves.toMatchObject({ name: "Cached Plant", fuelType: "Solar", capacityMw: 75 });
  });

  it("returns a valid cached nearest-plant result when the indexed reference lookup is temporarily unavailable", async () => {
    const cached = { name: "Point Cache Plant", fuelType: "Gas", capacityMw: 120, distanceKm: 0.33, source: "WRI Global Power Plant Database v1.3.0 (CC BY 4.0)" };
    setGppdReferenceForTests({
      candidates: async () => { throw new Error("database temporarily unavailable"); },
      readCache: async () => ({ payload: JSON.stringify(cached), fetchedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) }),
    });

    await expect(lookupNearestGppdPlant(20, 77, 2)).resolves.toEqual(cached);
  });

  it("returns no reference for no in-radius match or a failed/invalid GPPD load", async () => {
    setGppdReferenceForTests({
      fetchCsv: async () => `${header}\nUSA,United States,Excluded Plant,WRI-USA-1,100,40,-75,Gas`,
      candidates: async () => [],
      readCache: async () => undefined,
    });

    expect(parseIndiaGppdCsv(`${header}\n${nonIndiaRow}`)).toEqual([]);
    await expect(loadIndiaGppdReference()).resolves.toBe(false);
    await expect(lookupNearestGppdPlant(20, 77, 2)).resolves.toBeUndefined();
  });
});
