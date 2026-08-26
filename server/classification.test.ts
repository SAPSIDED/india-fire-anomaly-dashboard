import { describe, expect, it } from "vitest";
import { classifyCorroborationEvidence } from "./classification";

describe("classifyCorroborationEvidence", () => {
  it("classifies recurring detections with industrial context as an industrial thermal source", () => {
    const result = classifyCorroborationEvidence({
      industrialFeatures: 2,
      industrialState: "available",
      historyState: "available",
      historyDailyDetections: [
        { date: "2026-08-19", detections: 1 },
        { date: "2026-08-20", detections: 2 },
        { date: "2026-08-21", detections: 1 },
        { date: "2026-08-22", detections: 1 },
      ],
    });

    expect(result).toMatchObject({ classification: "industrial_thermal_source", confidence: "high" });
    expect(result.reason).toContain("4 of the returned seven days");
  });

  it("classifies short-lived detections without industrial context as likely vegetation or wildfire", () => {
    const result = classifyCorroborationEvidence({
      industrialFeatures: 0,
      industrialState: "available",
      historyState: "available",
      historyDailyDetections: [
        { date: "2026-08-20", detections: 2 },
        { date: "2026-08-23", detections: 1 },
      ],
    });

    expect(result).toMatchObject({ classification: "likely_wildfire_vegetation", confidence: "high" });
    expect(result.reason).toContain("No nearby industrial context");
  });

  it("returns uncertain_other when the evidence does not meet either threshold", () => {
    const result = classifyCorroborationEvidence({
      industrialFeatures: 1,
      industrialState: "available",
      historyState: "available",
      historyDailyDetections: [
        { date: "2026-08-20", detections: 1 },
        { date: "2026-08-23", detections: 1 },
      ],
    });

    expect(result).toMatchObject({ classification: "uncertain_other", confidence: "high" });
  });

  it("stays uncertain with low confidence when a required source is unavailable", () => {
    const result = classifyCorroborationEvidence({
      industrialFeatures: 0,
      industrialState: "unavailable",
      historyState: "available",
      historyDailyDetections: [],
    });

    expect(result).toMatchObject({ classification: "uncertain_other", confidence: "low" });
    expect(result.reason).toContain("unavailable");
  });
});
