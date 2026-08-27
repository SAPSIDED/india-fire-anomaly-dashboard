import { afterEach, describe, expect, it } from "vitest";
import { assessFacilitySignals, setFacilityReferenceForTests } from "./facilityReference";

afterEach(() => setFacilityReferenceForTests());

describe("assessFacilitySignals", () => {
  it("emits a high-confidence flare match only for persistent live FIRMS activity, a public flare-reference candidate, and a typed refinery/LNG facility", async () => {
    setFacilityReferenceForTests({
      lookup: async () => ({
        state: "available", candidateCount: 1, dataYear: 2025,
        match: { flareId: "in-1", latitude: 20.0004, longitude: 77.0004, distanceKm: 0.04, source: "Fixture", sourceDataYear: 2025, fieldType: "OIL", fieldName: null, operator: null, location: "ONSHORE", latestAnnualVolumeMcm: null },
      }),
    });

    const result = await assessFacilitySignals({
      lat: 20, lng: 77, industrialFacilityCategory: "refinery", industrialFacilityLatitude: 20.0002, industrialFacilityLongitude: 77.0002, industrialFacilityDistanceM: 35,
      gppdReference: { name: "Nearby reference" }, firmsCurrentState: "available", firmsCurrentDetections: 1, firmsHistoryState: "available", firmsHistoryDetections: 5,
    });

    expect(result).toMatchObject({
      flareMatch: true, flareMatchConfidence: "high", miningMatch: false, vnfState: "unavailable", vnfCandidateCount: 0,
      flareReferenceState: "available", flareReferenceCandidateCount: 1, flareReferenceDataYear: 2025,
    });
  });

  it("withholds a flare match when current FIRMS activity is not persistent, even at a known reference and refinery", async () => {
    setFacilityReferenceForTests({
      lookup: async () => ({
        state: "available", candidateCount: 1, dataYear: 2025,
        match: { flareId: "in-1", latitude: 20.0004, longitude: 77.0004, distanceKm: 0.04, source: "Fixture", sourceDataYear: 2025, fieldType: "OIL", fieldName: null, operator: null, location: "ONSHORE", latestAnnualVolumeMcm: null },
      }),
    });

    const result = await assessFacilitySignals({
      lat: 20, lng: 77, industrialFacilityCategory: "lng_terminal", industrialFacilityLatitude: 20.0002, industrialFacilityLongitude: 77.0002,
      firmsCurrentState: "available", firmsCurrentDetections: 1, firmsHistoryState: "available", firmsHistoryDetections: 2,
    });

    expect(result).toMatchObject({ flareMatch: false, flareMatchConfidence: "none", flareReferenceState: "available" });
    expect(result.detail).toContain("seven-day");
  });

  it("reports a nearby typed mining context separately without creating a flare match", async () => {
    setFacilityReferenceForTests({ lookup: async () => ({ state: "available", candidateCount: 0, dataYear: 2025 }) });
    const result = await assessFacilitySignals({ lat: 20, lng: 77, industrialFacilityCategory: "mining", industrialFacilityDistanceM: 400 });
    expect(result).toMatchObject({ flareMatch: false, flareMatchConfidence: "none", miningMatch: true, vnfState: "unavailable", flareReferenceState: "available" });
  });

  it("returns no flags when no public flare candidate and no qualifying facility context are present", async () => {
    setFacilityReferenceForTests({ lookup: async () => ({ state: "available", candidateCount: 0, dataYear: 2025 }) });
    const result = await assessFacilitySignals({ lat: 20, lng: 77, industrialFacilityCategory: "steel", industrialFacilityDistanceM: 70 });
    expect(result).toMatchObject({ flareMatch: false, miningMatch: false, vnfState: "unavailable", vnfCandidateCount: 0, flareReferenceState: "available" });
  });

  it("returns an explicit non-throwing unavailable signal when the public flare reference is inaccessible", async () => {
    let calls = 0;
    const lookup = async () => { calls += 1; throw new Error("unavailable"); };
    setFacilityReferenceForTests({ lookup });
    const result = await assessFacilitySignals({ lat: 20, lng: 77, industrialFacilityCategory: "lng_terminal", industrialFacilityLatitude: 20, industrialFacilityLongitude: 77, industrialFacilityDistanceM: 20 });
    expect(result).toMatchObject({ flareMatch: false, miningMatch: false, vnfState: "unavailable", vnfCandidateCount: 0, flareReferenceState: "unavailable" });
    expect(calls).toBe(1);
  });
});
