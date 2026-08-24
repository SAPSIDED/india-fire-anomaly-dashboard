/**
 * LIVE CORROBORATION — retrieves independent satellite, map-context, persistence, and weather evidence in parallel.
 * A source outage or missing on-site incident feed never becomes a positive fire conclusion.
 */
export type SourceState = "available" | "unavailable";

type FirmsEvidence = {
  state: SourceState;
  detections: number;
  detail: string;
};

type IndustrialEvidence = {
  state: SourceState;
  features: number;
  detail: string;
};

type WeatherEvidence = {
  state: SourceState;
  detail: string;
};

const API_TIMEOUT_MS = 12_000;

function bboxFor(lat: number, lng: number, delta = 0.055) {
  return [lng - delta, lat - delta, lng + delta, lat + delta]
    .map(value => value.toFixed(4))
    .join(",");
}

async function fetchFirms(lat: number, lng: number, days: number, sensor: "VIIRS_NOAA20_NRT" | "VIIRS_SNPP_NRT", label: string): Promise<FirmsEvidence> {
  const mapKey = process.env.NASA_FIRMS_MAP_KEY;
  if (!mapKey) {
    return { state: "unavailable", detections: 0, detail: "NASA FIRMS MAP_KEY is not configured." };
  }

  try {
    const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${mapKey}/${sensor}/${bboxFor(lat, lng)}/${days}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(API_TIMEOUT_MS) });
    const csv = await response.text();
    if (!response.ok || /invalid\s+map[_ ]key|error/i.test(csv)) {
      throw new Error("FIRMS did not accept the request.");
    }
    const rows = csv.trim().split(/\r?\n/).filter(Boolean);
    const detections = Math.max(0, rows.length - 1);
    return {
      state: "available",
      detections,
      detail: detections > 0
        ? `${detections} NASA FIRMS ${label} detections within the ${days}-day local search window.`
        : `No NASA FIRMS ${label} detections in the ${days}-day local search window.`,
    };
  } catch {
    return {
      state: "unavailable",
      detections: 0,
      detail: `NASA FIRMS ${label} is currently unreachable; this source is withheld.`,
    };
  }
}

async function fetchIndustrialContext(lat: number, lng: number): Promise<IndustrialEvidence> {
  const query = `[out:json][timeout:12];(way(around:5000,${lat},${lng})["landuse"="industrial"];way(around:5000,${lat},${lng})["man_made"="works"];way(around:5000,${lat},${lng})["industrial"];node(around:5000,${lat},${lng})["man_made"="works"];);out tags;`;
  try {
    const response = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: new URLSearchParams({ data: query }),
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error("Overpass request failed.");
    const data = await response.json() as { elements?: unknown[] };
    const features = data.elements?.length ?? 0;
    return {
      state: "available",
      features,
      detail: features > 0
        ? `${features} nearby OSM industrial-context features found within 5 km.`
        : "No nearby OSM industrial-context feature was returned within 5 km.",
    };
  } catch {
    return { state: "unavailable", features: 0, detail: "OSM industrial context is currently unreachable." };
  }
}

async function fetchWeather(lat: number, lng: number): Promise<WeatherEvidence> {
  try {
    const query = new URLSearchParams({
      latitude: lat.toString(),
      longitude: lng.toString(),
      current: "temperature_2m,wind_speed_10m,wind_direction_10m,precipitation,weather_code",
    });
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${query}`, {
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error("Weather request failed.");
    const data = await response.json() as {
      current?: { temperature_2m?: number; wind_speed_10m?: number; wind_direction_10m?: number; precipitation?: number };
    };
    const current = data.current;
    if (!current) throw new Error("Weather payload missing current conditions.");
    return {
      state: "available",
      detail: `${current.temperature_2m ?? "–"}°C · wind ${current.wind_speed_10m ?? "–"} km/h at ${current.wind_direction_10m ?? "–"}° · precipitation ${current.precipitation ?? "–"} mm.`,
    };
  } catch {
    return { state: "unavailable", detail: "Weather context is currently unreachable." };
  }
}

export async function evaluateCorroboration(input: { lat: number; lng: number; detectionId: string }) {
  const [firmsCurrent, firmsHistory, firmsIndependentCurrent, industrial, weather] = await Promise.all([
    fetchFirms(input.lat, input.lng, 1, "VIIRS_NOAA20_NRT", "NOAA-20"),
    fetchFirms(input.lat, input.lng, 7, "VIIRS_NOAA20_NRT", "NOAA-20"),
    fetchFirms(input.lat, input.lng, 1, "VIIRS_SNPP_NRT", "SNPP"),
    fetchIndustrialContext(input.lat, input.lng),
    fetchWeather(input.lat, input.lng),
  ]);

  const sourceStates = [firmsCurrent.state, firmsHistory.state, firmsIndependentCurrent.state, industrial.state, weather.state];
  const allSourcesAvailable = sourceStates.every(state => state === "available");
  const persistent = firmsHistory.state === "available" && firmsHistory.detections >= 5;
  const crossPlatformMatch = firmsCurrent.state === "available"
    && firmsIndependentCurrent.state === "available"
    && firmsCurrent.detections > 0
    && firmsIndependentCurrent.detections > 0;

  let conclusion: { level: "withheld" | "no_current_detection" | "routine_heat" | "candidate"; title: string; detail: string };
  if (firmsCurrent.state !== "available") {
    conclusion = {
      level: "withheld",
      title: "Live conclusion withheld",
      detail: "NASA FIRMS could not be reached, so this verifier will not infer a current anomaly from stale or illustrative map data.",
    };
  } else if (firmsCurrent.detections === 0) {
    conclusion = {
      level: "no_current_detection",
      title: "No current FIRMS thermal detection",
      detail: "The mapped zone has no NASA FIRMS detection in the local one-day search window; an industrial-fire conclusion is not supported.",
    };
  } else if (industrial.state !== "available" || industrial.features === 0) {
    conclusion = {
      level: "withheld",
      title: "Industrial context not established",
      detail: "A thermal record alone is insufficient because the nearby OSM industrial context is missing or unavailable.",
    };
  } else if (firmsIndependentCurrent.state !== "available") {
    conclusion = {
      level: "withheld",
      title: "Independent satellite corroboration unavailable",
      detail: "The second VIIRS platform could not be checked. A single-sensor thermal record is not sufficient for an industrial-fire candidate conclusion.",
    };
  } else if (!crossPlatformMatch) {
    conclusion = {
      level: "withheld",
      title: "No cross-platform thermal agreement",
      detail: "The local NOAA-20 detection is not matched by the independent SNPP search window. The system withholds an industrial-fire candidate conclusion.",
    };
  } else if (persistent) {
    conclusion = {
      level: "routine_heat",
      title: "Likely recurring industrial heat",
      detail: "The seven-day local thermal history is persistent. This supports a routine/static heat-source hypothesis, not a new incident claim.",
    };
  } else {
    conclusion = {
      level: "candidate",
      title: "Screened industrial thermal candidate",
      detail: "A current thermal detection and industrial context are present, but an on-site report, authority alert, or second independent incident feed is still required to confirm a fire.",
    };
  }

  return {
    detectionId: input.detectionId,
    checkedAt: new Date().toISOString(),
    sourcesRunInParallel: true,
    firmsCurrent,
    firmsHistory,
    firmsIndependentCurrent,
    industrial,
    weather,
    independentCorroboration: {
      state: !allSourcesAvailable ? "unavailable" : crossPlatformMatch ? "cross_platform_match" : "no_cross_platform_match",
      detail: !allSourcesAvailable
        ? "At least one live source is unavailable. The system cannot issue an authentic industrial-fire conclusion."
        : crossPlatformMatch
          ? "NOAA-20 and the independent SNPP VIIRS platform both report local thermal detections in the same one-day search window. This corroborates a thermal observation, but it is not an on-site fire confirmation."
          : "The two VIIRS platform searches do not agree in the same one-day local window; corroboration is not established.",
    },
    conclusion,
  };
}
