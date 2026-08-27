import { describe, expect, it } from "vitest";
import { beginHotspotVerification, buildHotspotVerificationInput, completeHotspotVerification, failHotspotVerification, getHotspotVerificationState, selectHotspotForVerification } from "../client/src/lib/hotspotVerification";

describe("selected hotspot verification input", () => {
  it("preserves the selected hotspot identity and exact coordinate for the existing corroboration pipeline", () => {
    expect(buildHotspotVerificationInput({
      id: "FIRMS-120001",
      location: { lat: 15.38928, lng: 75.22285 },
    })).toEqual({
      detectionId: "FIRMS-120001",
      lat: 15.38928,
      lng: 75.22285,
    });
  });

  it("models ready, loading, retained-selection error, and completed evidence states for the selected-hotspot rail", () => {
    expect(getHotspotVerificationState({ isPending: false, isError: false, hasResult: false })).toBe("ready");
    expect(getHotspotVerificationState({ isPending: true, isError: false, hasResult: false })).toBe("loading");
    expect(getHotspotVerificationState({ isPending: false, isError: true, hasResult: false })).toBe("error");
    expect(getHotspotVerificationState({ isPending: false, isError: false, hasResult: true })).toBe("complete");
  });

  it("models a map-marker activation as selection plus a request to the existing verification endpoint", () => {
    const target = { id: "FIRMS-120001", location: { lat: 15.38928, lng: 75.22285 } };
    expect(selectHotspotForVerification(target)).toEqual({
      selectedTarget: target,
      verificationInput: { detectionId: "FIRMS-120001", lat: 15.38928, lng: 75.22285 },
    });
  });

  it("hands the active marker's successful response to the rail presentation while ignoring a stale marker response", () => {
    const active = beginHotspotVerification<{ classification: string }>("FIRMS-120001", 2);
    const result = { classification: "industrial_thermal_source" };

    expect(completeHotspotVerification(active, "FIRMS-120001", 2, result)).toEqual({
      requestId: 2,
      targetId: "FIRMS-120001",
      state: "complete",
      result,
    });
    expect(completeHotspotVerification(active, "FIRMS-110000", 1, { classification: "uncertain_other" })).toEqual(active);
    expect(failHotspotVerification(active, "FIRMS-120001", 1)).toEqual(active);
  });
});
