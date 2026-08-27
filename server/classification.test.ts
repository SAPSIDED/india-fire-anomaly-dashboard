import { describe, expect, it } from "vitest";
import { classifyCorroborationEvidence } from "./classification";

const baseInput = {
  industrialFeatures: 0,
  industrialState: "available" as const,
  historyState: "available" as const,
  historyDailyDetections: [],
  landCoverClass: null,
  longTermHistory: null,
};

describe("classifyCorroborationEvidence", () => {
  it("preserves the original recurring-industrial decision when enriched evidence is unavailable", () => {
    const result = classifyCorroborationEvidence({
      ...baseInput,
      industrialFeatures: 2,
      historyDailyDetections: [
        { date: "2026-08-19", detections: 1 }, { date: "2026-08-20", detections: 2 },
        { date: "2026-08-21", detections: 1 }, { date: "2026-08-22", detections: 1 },
      ],
    });
    expect(result).toMatchObject({ classification: "industrial_thermal_source", confidence: "high" });
    expect(result.reason).toBe("Nearby industrial context is present and FIRMS detections occurred on 4 of the returned seven days, which matches a recurring industrial thermal-source pattern.");
  });

  it("preserves the original short-lived vegetation decision when enriched evidence is unavailable", () => {
    const result = classifyCorroborationEvidence({
      ...baseInput,
      historyDailyDetections: [{ date: "2026-08-20", detections: 2 }, { date: "2026-08-23", detections: 1 }],
    });
    expect(result).toMatchObject({ classification: "likely_wildfire_vegetation", confidence: "high" });
    expect(result.reason).toContain("No nearby industrial context");
  });

  it("returns uncertain_other when the available FIRMS and OSM evidence meets neither original threshold", () => {
    const result = classifyCorroborationEvidence({
      ...baseInput,
      industrialFeatures: 1,
      historyDailyDetections: [{ date: "2026-08-20", detections: 1 }, { date: "2026-08-23", detections: 1 }],
    });
    expect(result).toMatchObject({ classification: "uncertain_other", confidence: "high" });
  });

  it("stays uncertain with low confidence when a required original source is unavailable", () => {
    const result = classifyCorroborationEvidence({ ...baseInput, industrialState: "unavailable" });
    expect(result).toMatchObject({ classification: "uncertain_other", confidence: "low" });
    expect(result.reason).toContain("unavailable");
  });

  it("returns high-confidence industrial heat when recurring industrial, built-up, and multi-month evidence agree", () => {
    const result = classifyCorroborationEvidence({
      ...baseInput,
      industrialFeatures: 3,
      historyDailyDetections: [
        { date: "2026-08-19", detections: 1 }, { date: "2026-08-20", detections: 1 },
        { date: "2026-08-21", detections: 1 }, { date: "2026-08-22", detections: 1 },
      ],
      landCoverClass: "built_up",
      longTermHistory: { totalDetectionCount: 24, activeMonths: 3 },
    });
    expect(result).toMatchObject({ classification: "industrial_thermal_source", confidence: "high" });
    expect(result.reason).toContain("Land-cover is built_up");
    expect(result.reason).toContain("24 detections across 3 active months");
  });

  it("returns high-confidence vegetation/wildfire when short-lived non-industrial, cropland, and short-persistence evidence agree", () => {
    const result = classifyCorroborationEvidence({
      ...baseInput,
      historyDailyDetections: [{ date: "2026-08-20", detections: 2 }, { date: "2026-08-23", detections: 1 }],
      landCoverClass: "cropland",
      longTermHistory: { totalDetectionCount: 3, activeMonths: 1 },
    });
    expect(result).toMatchObject({ classification: "likely_wildfire_vegetation", confidence: "high" });
    expect(result.reason).toContain("Land-cover is cropland");
    expect(result.reason).toContain("3 detections across 1 active month");
  });

  it("retains the original industrial decision but lowers confidence when land cover and stored history support vegetation", () => {
    const result = classifyCorroborationEvidence({
      ...baseInput,
      industrialFeatures: 2,
      historyDailyDetections: [
        { date: "2026-08-19", detections: 1 }, { date: "2026-08-20", detections: 1 },
        { date: "2026-08-21", detections: 1 }, { date: "2026-08-22", detections: 1 },
      ],
      landCoverClass: "cropland",
      longTermHistory: { totalDetectionCount: 2, activeMonths: 1 },
    });
    expect(result).toMatchObject({ classification: "industrial_thermal_source", confidence: "medium" });
    expect(result.reason).toContain("evidence disagrees");
    expect(result.reason).toContain("Land-cover is cropland");
    expect(result.reason).toContain("2 detections across 1 active month");
  });
});
