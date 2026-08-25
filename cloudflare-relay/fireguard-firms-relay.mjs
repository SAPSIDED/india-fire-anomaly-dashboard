/**
 * FireGuard FIRMS Relay
 *
 * A permanent Cloudflare Worker boundary for FireGuard's backend. It accepts
 * only approved NASA FIRMS API/WFS paths, injects the server-side MAP_KEY, and
 * returns successful NASA responses unchanged apart from cache-control headers.
 */

const FIRMS_ORIGIN = "https://firms.modaps.eosdis.nasa.gov";
const ALLOWED_SENSORS = new Set(["VIIRS_NOAA20_NRT", "VIIRS_NOAA21_NRT"]);
const RETRY_DELAYS_MS = [0, 300];
const UPSTREAM_TIMEOUT_MS = 20_000;

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function authorize(request, env) {
  const expected = env.RELAY_AUTH_TOKEN;
  if (!expected) return false;
  return request.headers.get("authorization") === `Bearer ${expected}`;
}

function buildUpstreamUrl(requestUrl, env) {
  const path = requestUrl.pathname;
  const parts = path.split("/").filter(Boolean);
  const apiKind = parts.slice(0, 3).join("/");

  if (apiKind === "api/area/csv" || apiKind === "api/country/csv") {
    const [sensor] = parts.slice(3);
    if (!ALLOWED_SENSORS.has(sensor)) return null;
    // FIRMS parses the area argument as a literal comma-delimited path segment.
    // Path-segment encoding would turn its coordinate commas into `%2C` and cause an invalid-area response.
    const downstream = parts.slice(3).join("/");
    return `${FIRMS_ORIGIN}/${apiKind}/${encodeURIComponent(env.NASA_FIRMS_MAP_KEY)}/${downstream}`;
  }

  if (path === "/mapserver/wfs/Russia_Asia/" || path === "/mapserver/wfs/Russia_Asia") {
    const typeName = requestUrl.searchParams.get("TYPENAME") ?? "";
    if (!/^ms:fires_noaa(?:20|21)_(?:24hrs|7days)$/.test(typeName)) return null;
    const upstream = new URL(`${FIRMS_ORIGIN}/mapserver/wfs/Russia_Asia/${encodeURIComponent(env.NASA_FIRMS_MAP_KEY)}/`);
    upstream.search = requestUrl.search;
    return upstream.toString();
  }

  return null;
}

async function fetchFirms(upstreamUrl) {
  let lastError;
  for (const delay of RETRY_DELAYS_MS) {
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    try {
      const response = await fetch(upstreamUrl, {
        method: "GET",
        headers: { Accept: "text/csv, application/json;q=0.9, */*;q=0.1" },
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
      if (response.ok || response.status < 500) return response;
      lastError = new Error(`NASA FIRMS returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error("NASA FIRMS request failed");
}

export default {
  async fetch(request, env, ctx) {
    if (request.method !== "GET") return json(405, { error: "method_not_allowed" });
    const url = new URL(request.url);
    if (url.pathname === "/healthz") return json(200, { status: "ok", service: "fireguard-firms-relay" });
    if (!authorize(request, env)) return json(401, { error: "unauthorized" });
    if (!env.NASA_FIRMS_MAP_KEY) return json(500, { error: "relay_not_configured" });

    const upstreamUrl = buildUpstreamUrl(url, env);
    if (!upstreamUrl) return json(400, { error: "unsupported_firms_route" });

    const cacheKey = new Request(url.toString(), request);
    const cache = caches.default;
    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    try {
      const upstream = await fetchFirms(upstreamUrl);
      const headers = new Headers(upstream.headers);
      headers.set("cache-control", "private, max-age=300");
      headers.set("x-fireguard-relay", "cloudflare-worker");
      const response = new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers });
      if (response.ok) ctx.waitUntil(cache.put(cacheKey, response.clone()));
      return response;
    } catch {
      return json(504, { error: "firms_upstream_unavailable", retryable: true });
    }
  },
};
