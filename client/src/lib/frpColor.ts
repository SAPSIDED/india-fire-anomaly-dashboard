const LOW_FRP = [244, 211, 94] as const;
const MEDIUM_FRP = [242, 140, 40] as const;
const HIGH_FRP = [201, 40, 40] as const;
const UNAVAILABLE_FRP = "#9a8f84";

function interpolate(from: readonly number[], to: readonly number[], amount: number) {
  return from.map((channel, index) => Math.round(channel + (to[index] - channel) * amount));
}

function rgbHex(rgb: readonly number[]) {
  return `#${rgb.map(channel => channel.toString(16).padStart(2, "0")).join("")}`;
}

/** Maps the current snapshot's observed FRP range to low-yellow, medium-orange, high-red. */
export function thermalMarkerColor(value: number | null | undefined, allValues: Array<number | null | undefined>) {
  if (typeof value !== "number" || !Number.isFinite(value)) return UNAVAILABLE_FRP;
  const values = allValues.filter((candidate): candidate is number => typeof candidate === "number" && Number.isFinite(candidate));
  if (values.length < 2) return rgbHex(MEDIUM_FRP);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const normalized = max === min ? 0.5 : Math.max(0, Math.min(1, (value - min) / (max - min)));
  return rgbHex(normalized <= 0.5
    ? interpolate(LOW_FRP, MEDIUM_FRP, normalized * 2)
    : interpolate(MEDIUM_FRP, HIGH_FRP, (normalized - 0.5) * 2));
}
