const LOW_FRP = [255, 224, 70] as const;
const MEDIUM_FRP = [235, 92, 18] as const;
const HIGH_FRP = [190, 24, 24] as const;
const UNAVAILABLE_FRP = "#9a8f84";

function interpolate(from: readonly number[], to: readonly number[], amount: number) {
  return from.map((channel, index) => Math.round(channel + (to[index] - channel) * amount));
}

function rgbHex(rgb: readonly number[]) {
  return `#${rgb.map(channel => channel.toString(16).padStart(2, "0")).join("")}`;
}

function percentile(sortedValues: number[], fraction: number) {
  const position = (sortedValues.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sortedValues[lower];
  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * (position - lower);
}

/** Maps the current snapshot's FRP distribution to low-yellow, medium-orange, high-red. */
export function thermalMarkerColor(value: number | null | undefined, allValues: Array<number | null | undefined>) {
  if (typeof value !== "number" || !Number.isFinite(value)) return UNAVAILABLE_FRP;
  const values = allValues.filter((candidate): candidate is number => typeof candidate === "number" && Number.isFinite(candidate));
  if (values.length < 2) return rgbHex(MEDIUM_FRP);
  const sorted = [...values].sort((a, b) => a - b);
  // Ignore only the most extreme tails so a few outliers do not make ordinary
  // hotspots all appear yellow while preserving the real FRP ordering.
  const min = values.length >= 20 ? percentile(sorted, 0.1) : sorted[0];
  const max = values.length >= 20 ? percentile(sorted, 0.9) : sorted[sorted.length - 1];
  const normalized = max === min ? 0.5 : Math.max(0, Math.min(1, (value - min) / (max - min)));
  return rgbHex(normalized <= 0.5
    ? interpolate(LOW_FRP, MEDIUM_FRP, normalized * 2)
    : interpolate(MEDIUM_FRP, HIGH_FRP, (normalized - 0.5) * 2));
}
