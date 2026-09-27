const FRP_COLORS = {
  low: "#f4d35e",
  medium: "#f28c28",
  high: "#c92828",
  unavailable: "#89918f",
} as const;

/**
 * Color a hotspot by its rank within the visible FRP values. Quantile bands keep
 * the three requested levels useful when FRP values are strongly skewed.
 */
export function thermalMarkerColor(
  value: number | null | undefined,
  allValues: Array<number | null | undefined>,
) {
  const values = allValues
    .filter((item): item is number => typeof item === "number" && Number.isFinite(item))
    .sort((left, right) => left - right);

  if (typeof value !== "number" || !Number.isFinite(value) || values.length === 0) {
    return FRP_COLORS.unavailable;
  }

  const min = values[0];
  const max = values[values.length - 1];
  if (min === max) return FRP_COLORS.medium;

  const lowThreshold = values[Math.floor((values.length - 1) / 3)];
  const mediumThreshold = values[Math.floor(((values.length - 1) * 2) / 3)];

  if (value === max || value > mediumThreshold) return FRP_COLORS.high;
  if (value <= lowThreshold) return FRP_COLORS.low;
  return FRP_COLORS.medium;
}
