import { afterEach, describe, expect, it, vi } from "vitest";
import { assessFacilitySignals, setFacilityReferenceForTests } from "./facilityReference";

afterEach(() => setFacilityReferenceForTests());

describe("assessFacilitySignals", () => {
  it("emits a high-confidence flare match only for a live VNF candidate co-located with a typed refinery/LNG facility", async () => {
    setFacilityReferenceForTests({
      lookup: async () => [{ latitude: 20.0004, longitude: 77.0004, observedAt: "2026-08-27T00:00:00Z" }],
      readCache: async () => undefined,
      writeCache: async () => undefined,
    });

    const result = await assessFacilitySignals({
      lat: 20, lng: 77, industrialFacilityCategory: "refinery", industrialFacilityLatitude: 20.0002, industrialFacilityLongitude: 77.0002, industrialFacilityDistanceM: 35, gppdReference: { name: "Nearby reference" },
    });

    expect(result).toMatchObject({ flareMatch: true, flareMatchConfidence: "high", miningMatch: false, vnfState: "available", vnfCandidateCount: 1 });
  });

  it("reports a nearby typed mining context separately without creating a flare match", async () => {
    setFacilityReferenceForTests({ lookup: async () => [], readCache: async () => undefined, writeCache: async () => undefined });
    const result = await assessFacilitySignals({ lat: 20, lng: 77, industrialFacilityCategory: "mining", industrialFacilityDistanceM: 400 });
    expect(result).toMatchObject({ flareMatch: false, flareMatchConfidence: "none", miningMatch: true, vnfState: "available" });
  });

  it("returns no flags when no VNF candidate and no qualifying facility context are present", async () => {
    setFacilityReferenceForTests({ lookup: async () => [], readCache: async () => undefined, writeCache: async () => undefined });
    const result = await assessFacilitySignals({ lat: 20, lng: 77, industrialFacilityCategory: "steel", industrialFacilityDistanceM: 70 });
    expect(result).toMatchObject({ flareMatch: false, miningMatch: false, vnfState: "available", vnfCandidateCount: 0 });
  });

  it("returns an explicit non-throwing unavailable signal when a bounded VNF source is inaccessible", async () => {
    const lookup = vi.fn(async () => { throw new Error("unavailable"); });
    setFacilityReferenceForTests({ lookup, readCache: async () => undefined, writeCache: async () => undefined });
    const result = await assessFacilitySignals({ lat: 20, lng: 77, industrialFacilityCategory: "lng_terminal", industrialFacilityLatitude: 20, industrialFacilityLongitude: 77, industrialFacilityDistanceM: 20 });
    expect(result).toMatchObject({ flareMatch: false, miningMatch: false, vnfState: "unavailable", vnfCandidateCount: 0 });
    expect(lookup).toHaveBeenCalledOnce();
  });
});
