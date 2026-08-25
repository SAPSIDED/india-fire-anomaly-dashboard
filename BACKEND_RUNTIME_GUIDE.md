# FireGuard Backend Runtime Guide

## Purpose

The backend evaluates a selected thermal-anomaly coordinate through a tRPC mutation. It requests NASA FIRMS thermal observations, spatial industrial context, and weather concurrently, records timestamped successful upstream responses, and issues a conservative classification. It must never treat unavailable data, a test fixture, or a cache fallback as a confirmed live industrial fire.

## Primary files

| File | Responsibility |
| --- | --- |
| `server/corroboration.ts` | Concurrent NASA FIRMS, OSM, Google Places, weather, retry, timeout, cache, and verdict logic. |
| `server/routers.ts` | Exposes the public `corroboration.run` checker and the administrator-only incident-evidence write route. |
| `server/db.ts` | Persists and retrieves successful source-evidence cache records and active incident provenance. |
| `drizzle/schema.ts` | Defines the `sourceEvidenceCache` and time-limited `incidentEvidence` tables. |
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

The public backend route is `POST /api/trpc/corroboration.run?batch=1`. The frontend uses `trpc.corroboration.run.useMutation()` and sends a detection ID plus India-bounded latitude and longitude.

## Controlled incident confirmation

The administrator-only `incidentEvidence.record` tRPC mutation accepts an HTTPS provenance URL, authority or verified-facility source type, incident reference, report time, coordinate, and reviewer notes. It is accessible only to an authenticated project administrator; public users can view the resulting generic evidence state but cannot submit a record.

Every record must be time-aligned to the check: its report time cannot be more than 48 hours old or materially in the future. The database entry expires after 48 hours, can be revoked, and must remain within 10 km of the selected detection to participate in a verdict. The application stores a **pointer and audit metadata**, rather than copying an authority or facility report into the dashboard.

## Decision rule

A **screened industrial thermal candidate** requires current live satellite evidence, independent NOAA-20/NOAA-21 agreement, and live industrial context. A **confirmed industrial incident — external report recorded** additionally requires an active, administrator-reviewed authority or verified-facility record for the same detection area and time window. Cached, delayed, or unauthorised evidence yields an explicitly non-conclusive result.
