import { describe, expect, it } from "vitest";
import { dedupeDetectionHistoryRows, summarizeLongTermPersistence } from "./history";

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
});
