# FireGuard FIRMS Relay

This directory contains the permanent Cloudflare Worker used as the FireGuard backend's only egress path for official NASA FIRMS Area API, Country API, and Russia/Asia WFS requests.

## Worker secrets

The deployed Worker requires two secrets, configured in Cloudflare rather than committed to the repository:

| Secret | Purpose |
| --- | --- |
| `NASA_FIRMS_MAP_KEY` | Official NASA FIRMS MAP_KEY injected into permitted upstream requests. |
| `RELAY_AUTH_TOKEN` | Shared backend-to-relay bearer token. Requests without it return `401`. |

The Worker accepts only `GET` requests for the NOAA-20/NOAA-21 FIRMS Area and Country APIs and the India-relevant Russia/Asia WFS layers. It neither accepts a MAP_KEY from callers nor forwards arbitrary destinations.
