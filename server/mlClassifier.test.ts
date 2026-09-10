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
});
