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

  it("keeps day/night statistics and withholds variance for fewer than four FRP samples", () => {
    expect(summarizeStoredHistoryStatistics([
      { detectionDate: "2026-10-20", dayNight: "D", frp: "10", latitude: "27.13", longitude: "73.33", platform: "VIIRS" },
      { detectionDate: "2026-10-21", dayNight: "N", frp: "20", latitude: "27.13", longitude: "73.33", platform: "VIIRS" },
      { detectionDate: "2026-10-22", dayNight: "D", frp: "30", latitude: "27.13", longitude: "73.33", platform: "VIIRS" },
      { detectionDate: "2026-10-23", dayNight: null, frp: null, latitude: "27.13", longitude: "73.33", platform: "VIIRS" },
    ])).toEqual({ dayDetections: 2, nightDetections: 1, dayToNightRatio: 2, dayNightSampleCount: 3, frpSampleCount: 3, frpVarianceGroups: [{ latitude: "27.130000", longitude: "73.330000", platform: "VIIRS", sampleCount: 3, state: "insufficient", varianceMw2: null }] });
  });

  it("returns a numeric population variance only for four or more same-platform samples", () => {
    expect(summarizeStoredHistoryStatistics([
      { detectionDate: "2026-10-20", frp: "10", latitude: "27.13", longitude: "73.33", platform: "VIIRS" },
      { detectionDate: "2026-10-21", frp: "20", latitude: "27.13", longitude: "73.33", platform: "VIIRS" },
      { detectionDate: "2026-10-22", frp: "30", latitude: "27.13", longitude: "73.33", platform: "VIIRS" },
      { detectionDate: "2026-10-23", frp: "40", latitude: "27.13", longitude: "73.33", platform: "VIIRS" },
    ]).frpVarianceGroups).toEqual([{ latitude: "27.130000", longitude: "73.330000", platform: "VIIRS", sampleCount: 4, state: "adequate", varianceMw2: 125 }]);
  });

  it("computes mixed MODIS and VIIRS samples at one location as independent platform groups", () => {
    expect(summarizeStoredHistoryStatistics([
      { detectionDate: "2026-10-20", frp: "1", latitude: "27.13", longitude: "73.33", platform: "MODIS" },
      { detectionDate: "2026-10-21", frp: "3", latitude: "27.13", longitude: "73.33", platform: "MODIS" },
      { detectionDate: "2026-10-22", frp: "5", latitude: "27.13", longitude: "73.33", platform: "MODIS" },
      { detectionDate: "2026-10-23", frp: "7", latitude: "27.13", longitude: "73.33", platform: "MODIS" },
      { detectionDate: "2026-10-20", frp: "10", latitude: "27.13", longitude: "73.33", platform: "VIIRS" },
      { detectionDate: "2026-10-21", frp: "20", latitude: "27.13", longitude: "73.33", platform: "VIIRS" },
      { detectionDate: "2026-10-22", frp: "30", latitude: "27.13", longitude: "73.33", platform: "VIIRS" },
      { detectionDate: "2026-10-23", frp: "40", latitude: "27.13", longitude: "73.33", platform: "VIIRS" },
    ]).frpVarianceGroups).toEqual([
      { latitude: "27.130000", longitude: "73.330000", platform: "MODIS", sampleCount: 4, state: "adequate", varianceMw2: 5 },
      { latitude: "27.130000", longitude: "73.330000", platform: "VIIRS", sampleCount: 4, state: "adequate", varianceMw2: 125 },
    ]);
  });

  it("returns explicit empty descriptive statistics when stored rows have no valid day/night or FRP values", () => {
    expect(summarizeStoredHistoryStatistics([{ detectionDate: "2026-10-20", dayNight: null, frp: null }]))
      .toEqual({ dayDetections: 0, nightDetections: 0, dayToNightRatio: null, dayNightSampleCount: 0, frpSampleCount: 0, frpVarianceGroups: [] });
  });
});
