import { describe, expect, it } from "vitest";
import { dedupeDetectionHistoryRows, summarizeLongTermPersistence, summarizeStoredHistoryStatistics } from "./history";

describe("detection history helpers", () => {
  it("deduplicates the same FIRMS date and location before database storage", () => {
    const rows = dedupeDetectionHistoryRows([
      { latitude: "27.130000", longitude: "73.330000", detectionDate: "2026-08-20", brightness: "330.2", confidence: "h" },
      { latitude: "27.13", longitude: "73.33", detectionDate: "2026-08-20", brightness: "330.2", confidence: "h" },
      { latitude: "27.130000", longitude: "73.330000", detectionDate: "2026-08-21", brightness: null, confidence: null },
    ]);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ latitude: "27.130000", longitude: "73.330000" });
  });

  it("summarizes stored rows across months without using live FIRMS data", () => {
    expect(summarizeLongTermPersistence([
      { detectionDate: "2026-06-30" },
      { detectionDate: "2026-07-01" },
      { detectionDate: "2026-07-08" },
    ])).toEqual({ totalDetectionCount: 3, firstSeen: "2026-06-30", lastSeen: "2026-07-08", activeMonths: 2 });
  });

  it("returns an explicit empty persistence summary when no local rows have been stored", () => {
    expect(summarizeLongTermPersistence([])).toEqual({ totalDetectionCount: 0, firstSeen: null, lastSeen: null, activeMonths: 0 });
  });

  it("calculates day/night ratio and population FRP variance from stored valid FIRMS fields", () => {
    expect(summarizeStoredHistoryStatistics([
      { detectionDate: "2026-10-20", dayNight: "D", frp: "10" },
      { detectionDate: "2026-10-21", dayNight: "N", frp: "20" },
      { detectionDate: "2026-10-22", dayNight: "D", frp: "30" },
      { detectionDate: "2026-10-23", dayNight: null, frp: null },
    ])).toEqual({ dayDetections: 2, nightDetections: 1, dayToNightRatio: 2, dayNightSampleCount: 3, frpSampleCount: 3, frpVariance: 66.6667 });
  });

  it("returns explicit empty descriptive statistics when stored rows have no valid day/night or FRP values", () => {
    expect(summarizeStoredHistoryStatistics([{ detectionDate: "2026-10-20", dayNight: null, frp: null }]))
      .toEqual({ dayDetections: 0, nightDetections: 0, dayToNightRatio: null, dayNightSampleCount: 0, frpSampleCount: 0, frpVariance: null });
  });
});
