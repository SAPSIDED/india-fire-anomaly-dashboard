export type StoredDetectionHistoryPoint = {
  detectionDate: string | Date;
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

export function dedupeDetectionHistoryRows<T extends { latitude: string; longitude: string; detectionDate: string }>(rows: T[]): T[] {
  const unique = new Map<string, T>();
  for (const row of rows) {
    const key = `${Number(row.latitude).toFixed(6)}:${Number(row.longitude).toFixed(6)}:${row.detectionDate}`;
    unique.set(key, { ...row, latitude: Number(row.latitude).toFixed(6), longitude: Number(row.longitude).toFixed(6) });
  }
  return Array.from(unique.values());
}
