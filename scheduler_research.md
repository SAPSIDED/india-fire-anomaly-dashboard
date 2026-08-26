# India Hotspot Snapshot Scheduling Research

The selected execution model is a platform-managed HTTP callback rather than an in-process timer. The callback can run after idle scale-down, is authenticated as a cron caller, and can refresh a database-backed snapshot without a user visit.

| Source | Finding | URL |
|---|---|---|
| NASA FIRMS API tutorial | Documents the country CSV path as `/api/country/csv/{MAP_KEY}/{DATASET}/{COUNTRY_CODE}/{DAY_RANGE}` and directs users to the country-code endpoint for three-letter codes. | https://firms.modaps.eosdis.nasa.gov/content/academy/data_api/firms_api_use.html |
| NASA FIRMS API status page | Currently marks both the `countries` and `country` API features as “currently not available.” The existing authenticated `countryUrl` returned HTTP 400 with `Invalid API call.` for 1- and 7-day NOAA-20 India requests during implementation. | https://firms.modaps.eosdis.nasa.gov/api/ |

The existing per-coordinate corroboration procedure remains unaffected because it already uses independent Area and WFS routes alongside the unavailable country route. No alternate country-wide source has been substituted pending explicit approval.

After production publication, the project-level managed Heartbeat `fireguard-india-hotspot-refresh` was created with task UID `oTyEtJozMT3Bz3aANmMevR`. It is enabled as a `POST` callback to `/api/scheduled/refreshIndiaHotspots` on the six-field UTC expression `0 */20 * * * *`. The platform-owned schedule persists outside the sandbox; its first scheduled execution remains to be inspected in the project schedule history.
