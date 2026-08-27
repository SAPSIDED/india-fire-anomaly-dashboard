export type StoredDetectionHistoryPoint = {
  detectionDate: string | Date;
  dayNight?: string | null;
  frp?: string | number | null;
};

export type LongTermPersistenceSummary = {
  state: "available" | "unavailable";
  totalDetectionCount: number;
  firstSeen: string | null;
  lastSeen: string | null;
  activeMonths: number;
};

/** Pure summary of rows already persisted in the project database. */
export function summarizeLongTermPersistence(rows: StoredDetectionHistoryPoint[]): Omit<LongTermPersistenceSummary, "state"> {
  const dates = rows.map(row => typeof row.detectionDate === "string" ? row.detectionDate : row.detectionDate.toISOString().slice(0, 10)).sort();
  return {
    totalDetectionCount: dates.length,
    firstSeen: dates[0] ?? null,
    lastSeen: dates.length > 0 ? dates[dates.length - 1] : null,
    activeMonths: new Set(dates.map(date => date.slice(0, 7))).size,
  };
}

export type StoredHistoryStatistics = {
  dayDetections: number;
  nightDetections: number;
  dayToNightRatio: number | null;
  dayNightSampleCount: number;
  frpSampleCount: number;
  frpVariance: number | null;
};

/** Pure descriptive statistics over valid values already stored from FIRMS. FRP variance is population variance in MW². */
export function summarizeStoredHistoryStatistics(rows: StoredDetectionHistoryPoint[]): StoredHistoryStatistics {
  const dayDetections = rows.filter(row => row.dayNight?.trim().toUpperCase() === "D").length;
  const nightDetections = rows.filter(row => row.dayNight?.trim().toUpperCase() === "N").length;
  const frpValues = rows.flatMap(row => {
    if (row.frp === null || row.frp === undefined || `${row.frp}`.trim() === "") return [];
    const value = Number(row.frp);
    return Number.isFinite(value) ? [value] : [];
  });
  const mean = frpValues.length ? frpValues.reduce((sum, value) => sum + value, 0) / frpValues.length : null;
  const frpVariance = mean === null ? null : frpValues.reduce((sum, value) => sum + (value - mean) ** 2, 0) / frpValues.length;
  return {
    dayDetections,
    nightDetections,
    dayToNightRatio: nightDetections > 0 ? Number((dayDetections / nightDetections).toFixed(4)) : null,
    dayNightSampleCount: dayDetections + nightDetections,
    frpSampleCount: frpValues.length,
    frpVariance: frpVariance === null ? null : Number(frpVariance.toFixed(4)),
  };
}

export function dedupeDetectionHistoryRows<T extends { latitude: string; longitude: string; detectionDate: string }>(rows: T[]): T[] {
  const unique = new Map<string, T>();
  for (const row of rows) {
    const key = `${Number(row.latitude).toFixed(6)}:${Number(row.longitude).toFixed(6)}:${row.detectionDate}`;
    unique.set(key, { ...row, latitude: Number(row.latitude).toFixed(6), longitude: Number(row.longitude).toFixed(6) });
  }
  return Array.from(unique.values());
}
