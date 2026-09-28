const LOW_FRP = "#ffe046";
const MEDIUM_FRP = "#eb5c12";
const HIGH_FRP = "#be1818";
const UNAVAILABLE_FRP = "#9a8f84";

/** Fixed visual intensity bands for consistent day-to-day FRP interpretation. */
export function thermalMarkerColor(value: number | null | undefined, _allValues: Array<number | null | undefined> = []) {
  if (typeof value !== "number" || !Number.isFinite(value)) return UNAVAILABLE_FRP;
  if (value < 5) return LOW_FRP;
  if (value < 20) return MEDIUM_FRP;
  return HIGH_FRP;
}
