import { getSourceEvidenceCache, saveSourceEvidenceCache } from "./db";

export type LiveWeather = {
  state: "available" | "cached" | "unavailable";
  provider: "open-meteo";
  checkedAt: string;
  latitude: number;
  longitude: number;
  temperatureC: number | null;
  windSpeedKmh: number | null;
  windDirectionDeg: number | null;
  precipitationMm: number | null;
  weatherCode: number | null;
  timezone: string | null;
  detail: string;
};

type CacheRecord = { value: Omit<LiveWeather, "state" | "checkedAt" | "detail">; fetchedAt: Date; expiresAt: Date };
const memory = new Map<string, CacheRecord>();
const TTL_MS = 5 * 60_000;
const keyFor = (lat: number, lng: number) => `live-weather:${lat.toFixed(2)}:${lng.toFixed(2)}`;
const checkedAt = () => new Date().toISOString();

export async function getLiveWeather(lat: number, lng: number): Promise<LiveWeather> {
  const key = keyFor(lat, lng);
  const now = Date.now();
  const cachedMemory = memory.get(key);
  if (cachedMemory && cachedMemory.expiresAt.getTime() > now) {
    return { ...cachedMemory.value, state: "cached", checkedAt: checkedAt(), detail: "Recent Open-Meteo reading." };
  }
  try {
    const query = new URLSearchParams({ latitude: String(lat), longitude: String(lng), current: "temperature_2m,wind_speed_10m,wind_direction_10m,precipitation,weather_code", timezone: "auto" });
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${query}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8_000) });
    if (!response.ok) throw new Error(`Open-Meteo HTTP ${response.status}`);
    const data = await response.json() as { current?: Record<string, number | undefined>; timezone?: string };
    const current = data.current ?? {};
    const value: CacheRecord["value"] = {
      provider: "open-meteo", latitude: lat, longitude: lng,
      temperatureC: typeof current.temperature_2m === "number" ? current.temperature_2m : null,
      windSpeedKmh: typeof current.wind_speed_10m === "number" ? current.wind_speed_10m : null,
      windDirectionDeg: typeof current.wind_direction_10m === "number" ? current.wind_direction_10m : null,
      precipitationMm: typeof current.precipitation === "number" ? current.precipitation : null,
      weatherCode: typeof current.weather_code === "number" ? current.weather_code : null,
      timezone: typeof data.timezone === "string" ? data.timezone : null,
    };
    const fetchedAt = new Date();
    const record = { value, fetchedAt, expiresAt: new Date(fetchedAt.getTime() + TTL_MS) };
    memory.set(key, record);
    try { await saveSourceEvidenceCache({ cacheKey: key, provider: "open-meteo", payload: JSON.stringify(value), fetchedAt, expiresAt: record.expiresAt }); } catch { /* live response remains usable */ }
    return { ...value, state: "available", checkedAt: checkedAt(), detail: "Live Open-Meteo reading." };
  } catch {
    try {
      const persisted = await getSourceEvidenceCache(key);
      if (persisted && persisted.expiresAt.getTime() > now) {
        const value = JSON.parse(persisted.payload) as CacheRecord["value"];
        return { ...value, state: "cached", checkedAt: checkedAt(), detail: `Cached Open-Meteo reading from ${persisted.fetchedAt.toISOString()}.` };
      }
    } catch { /* safe unavailable state below */ }
    return { provider: "open-meteo", latitude: lat, longitude: lng, state: "unavailable", checkedAt: checkedAt(), temperatureC: null, windSpeedKmh: null, windDirectionDeg: null, precipitationMm: null, weatherCode: null, timezone: null, detail: "Open-Meteo did not return within the bounded live request." };
  }
}

export function clearWeatherCacheForTests() { memory.clear(); }
