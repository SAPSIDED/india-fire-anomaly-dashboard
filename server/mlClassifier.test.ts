import { afterEach, describe, expect, it } from "vitest";
import { classifyWithML, setMLArtifactForTests } from "./mlClassifier";

afterEach(() => setMLArtifactForTests());

describe("local Anaconda XGBoost inference", () => {
  it("returns a real four-class result from the checked-in model artifact", async () => {
    const result = await classifyWithML(12, 330, 295, 80, 0.5, 4);
    expect(result).not.toBeNull();
    expect(["wildfire", "industrial_facility", "agricultural_burning", "mining"]).toContain(result?.classification);
    expect(result?.inference).toBe("local-json-model");
    expect(result?.wildfireProbability + result!.industrialProbability + result!.agriculturalProbability + result!.miningProbability).toBeCloseTo(1, 5);
  });

  it("returns null rather than fabricating a prediction when the local artifact is unavailable", async () => {
    setMLArtifactForTests(null);
    const result = await classifyWithML(12, 330, 295, 80, 0.5, 4);
    expect(result).toBeNull();
  });

  it("preserves all four model probability outputs and exact artifact parity", async () => {
    const samples = [
      { input: [1, 300, 280, 50, 0.5, 1] as const, expected: "wildfire" as const, wildfire: 0.513921 },
      { input: [5, 340, 300, 80, 0.2, 7] as const, expected: "agricultural_burning" as const, agricultural: 0.804587 },
      { input: [2, 310, 290, 80, 1.2, 1] as const, expected: "wildfire" as const, wildfire: 0.854853 },
      { input: [20, 400, 350, 90, 0.7, 4] as const, expected: "mining" as const, mining: 0.837582 },
    ];
    const results = await Promise.all(samples.map(sample => classifyWithML(...sample.input)));
    expect(results.map(result => result?.classification)).toEqual(samples.map(sample => sample.expected));
    expect(results[0]?.wildfireProbability).toBeCloseTo(samples[0].wildfire, 5);
    expect(results[1]?.agriculturalProbability).toBeCloseTo(samples[1].agricultural, 5);
    expect(results[2]?.wildfireProbability).toBeCloseTo(samples[2].wildfire, 5);
    expect(results[3]?.miningProbability).toBeCloseTo(samples[3].mining, 5);
    for (const result of results) {
      expect(result?.wildfireProbability! + result!.industrialProbability + result!.agriculturalProbability + result!.miningProbability).toBeCloseTo(1, 5);
    }
  });
});
