export type StoredDetectionHistoryPoint = {
  detectionDate: string | Date;
  dayNight?: string | null;
  frp?: string | number | null;
  latitude?: string | number;
  longitude?: string | number;
  platform?: string | null;
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
  frpVarianceGroups: FrpVarianceGroup[];
};

export type FrpVarianceGroup = {
  latitude: string;
  longitude: string;
  platform: "MODIS" | "VIIRS" | "unattributed";
  sampleCount: number;
  state: "adequate" | "insufficient";
  varianceMw2: number | null;
};

/** Keeps FRP samples from different exact coordinates and platforms separate. A variance under four samples is intentionally withheld. */
export function summarizeFrpVarianceGroups(rows: StoredDetectionHistoryPoint[]): FrpVarianceGroup[] {
  const grouped = new Map<string, { latitude: string; longitude: string; platform: FrpVarianceGroup["platform"]; values: number[] }>();
  for (const row of rows) {
    if (row.frp === null || row.frp === undefined || `${row.frp}`.trim() === "") continue;
    const value = Number(row.frp);
    const latitude = Number(row.latitude);
    const longitude = Number(row.longitude);
    if (!Number.isFinite(value) || !Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    const normalizedLatitude = latitude.toFixed(6);
    const normalizedLongitude = longitude.toFixed(6);
    const platform = row.platform === "MODIS" || row.platform === "VIIRS" ? row.platform : "unattributed";
    const key = `${normalizedLatitude}:${normalizedLongitude}:${platform}`;
    const group = grouped.get(key) ?? { latitude: normalizedLatitude, longitude: normalizedLongitude, platform, values: [] };
    group.values.push(value);
    grouped.set(key, group);
  }
  return Array.from(grouped.values()).map(group => {
    if (group.values.length < 4) return { latitude: group.latitude, longitude: group.longitude, platform: group.platform, sampleCount: group.values.length, state: "insufficient" as const, varianceMw2: null };
    const mean = group.values.reduce((sum, value) => sum + value, 0) / group.values.length;
    const variance = group.values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / group.values.length;
    return { latitude: group.latitude, longitude: group.longitude, platform: group.platform, sampleCount: group.values.length, state: "adequate" as const, varianceMw2: Number(variance.toFixed(4)) };
  }).sort((left, right) => left.latitude.localeCompare(right.latitude) || left.longitude.localeCompare(right.longitude) || left.platform.localeCompare(right.platform));
}

/** Pure descriptive statistics over valid values already stored from FIRMS. FRP variance is population variance in MW². */
export function summarizeStoredHistoryStatistics(rows: StoredDetectionHistoryPoint[]): StoredHistoryStatistics {
  const dayDetections = rows.filter(row => row.dayNight?.trim().toUpperCase() === "D").length;
  const nightDetections = rows.filter(row => row.dayNight?.trim().toUpperCase() === "N").length;
  const frpVarianceGroups = summarizeFrpVarianceGroups(rows);
  return {
    dayDetections,
    nightDetections,
    dayToNightRatio: nightDetections > 0 ? Number((dayDetections / nightDetections).toFixed(4)) : null,
    dayNightSampleCount: dayDetections + nightDetections,
    frpSampleCount: frpVarianceGroups.reduce((total, group) => total + group.sampleCount, 0),
    frpVarianceGroups,
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
