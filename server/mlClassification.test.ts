import { afterEach, describe, expect, it } from "vitest";
import { predictMlClassification, setMlArtifactForTests, type XgbArtifact } from "./mlClassification";

const leafArtifact: XgbArtifact = {
  version: [3, 0, 0],
  learner: {
    feature_names: ["frpMw", "dayNightRatio", "sevenDayDetectionCount", "activeMonths"],
    learner_model_param: { base_score: "[0.5]" },
    objective: { name: "binary:logistic" },
    gradient_booster: {
      name: "gbtree",
      model: {
        trees: [{
          base_weights: [0.2],
          default_left: [0],
          left_children: [-1],
          right_children: [-1],
          split_conditions: [0.25],
          split_indices: [0],
        }],
      },
    },
  },
};

afterEach(() => setMlArtifactForTests());

describe("ML classification adapter", () => {
  it("evaluates a compatible tree artifact and keeps the approved feature order", () => {
    const result = predictMlClassification({ frpMw: 2, dayNightRatio: null, sevenDayDetectionCount: 1, activeMonths: 1 }, leafArtifact);
    expect(result.state).toBe("available");
    expect(result.label).toBe("wildfire");
    expect(result.probability).toBeGreaterThan(0.5);
    expect(result.features.dayNightRatio).toBeNull();
    expect(result.modelVersion).toBe("3.0.0");
  });

  it("uses the model's missing-value policy without converting the response feature to observed zero", () => {
    const result = predictMlClassification({ frpMw: null, dayNightRatio: null, sevenDayDetectionCount: 1, activeMonths: 1 }, leafArtifact);
    expect(result.state).toBe("available");
    expect(result.features.frpMw).toBeNull();
  });

  it("returns unavailable for a wrong feature contract instead of guessing", () => {
    const wrongArtifact = structuredClone(leafArtifact);
    wrongArtifact.learner!.feature_names = ["frpMw", "landCoverClass", "sevenDayDetectionCount", "activeMonths"];
    const result = predictMlClassification({ frpMw: 1, dayNightRatio: null, sevenDayDetectionCount: 1, activeMonths: 1 }, wrongArtifact);
    expect(result.state).toBe("unavailable");
    expect(result.label).toBeNull();
  });

  it("loads the repository model artifact and produces a real binary signal", () => {
    const result = predictMlClassification({ frpMw: 2, dayNightRatio: null, sevenDayDetectionCount: 1, activeMonths: 1 });
    expect(result.state).toBe("available");
    expect(result.probability).toEqual(expect.any(Number));
    expect(["industrial_facility", "wildfire"]).toContain(result.label);
  });
});
