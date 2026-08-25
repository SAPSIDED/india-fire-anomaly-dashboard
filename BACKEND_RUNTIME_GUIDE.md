# FireGuard Backend Runtime Guide

## Purpose

The backend evaluates a selected thermal-anomaly coordinate through a tRPC mutation. It requests NASA FIRMS thermal observations, spatial industrial context, and weather concurrently, records timestamped successful upstream responses, and issues a conservative classification. It must never treat unavailable data, a test fixture, or a cache fallback as a confirmed live industrial fire.

## Primary files

| File | Responsibility |
| --- | --- |
| `server/corroboration.ts` | Concurrent NASA FIRMS, OSM, Google Places, weather, retry, timeout, cache, and verdict logic. |
| `server/routers.ts` | Exposes `corroboration.run` as a validated tRPC mutation. |
| `server/db.ts` | Persists and retrieves successful source-evidence cache records. |
| `drizzle/schema.ts` | Defines the `sourceEvidenceCache` table. |
| `server/_core/map.ts` | Uses the managed Google Maps proxy for facility-context fallback. |
| `server/*.test.ts` | Tests credentials, retries, WFS fallback, cache isolation, timeouts, and safe conclusions. |

## Required server-side environment variables

| Variable | Use | Never expose to browser |
| --- | --- | --- |
| `NASA_FIRMS_MAP_KEY` | Authenticates NASA FIRMS Area API and WFS retrieval. | Yes |
| `FIRMS_RELAY_BASE_URL` | Optional override for the deployed permanent Worker base URL. The current production default is `https://fireguard-firms-relay.fireguard-2cddbeab.workers.dev`. | Yes |
| `FIRMS_RELAY_AUTH_TOKEN` | Optional backend-to-relay bearer token. If absent, the backend uses the server-side NASA MAP_KEY as the relay credential. | Yes |
| `CLOUDFLARE_API_TOKEN` | Deploys the relay Worker; not used by the FireGuard browser. | Yes |
| `DATABASE_URL` | Stores timestamped source-evidence cache metadata. | Yes |

## Run and verify

```bash
cd /home/ubuntu/india-fire-anomaly-dashboard
pnpm dev
pnpm test
pnpm check
pnpm build
```

The backend route is `POST /api/trpc/corroboration.run?batch=1`. The frontend uses `trpc.corroboration.run.useMutation()` and sends a detection ID plus India-bounded latitude and longitude.

## Decision rule

A **screened industrial thermal candidate** requires current live satellite evidence, independent NOAA-20/NOAA-21 agreement, and live industrial context. A confirmed fire still requires an authority, on-site, or otherwise independent incident source. Cached or delayed data yields an explicitly non-conclusive result.
