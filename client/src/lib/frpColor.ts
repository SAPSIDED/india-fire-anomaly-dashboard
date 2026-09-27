const HOTSPOT_RED = "#c92828";

/** Keep every thermal hotspot red, independent of FRP availability. */
export function thermalMarkerColor(
  _value: number | null | undefined,
  _allValues: Array<number | null | undefined>,
) {
  return HOTSPOT_RED;
}
