# Research Source Log — Industrial Thermal Anomaly Validation

This working log records sources and access results used to support the dashboard research. It distinguishes sources that have been located from sources that have been directly reviewed.

| ID | Source | Status | Use in the research |
| --- | --- | --- | --- |
| NASA-1 | [NASA Earthdata — Active Fire Data Attributes for MODIS and VIIRS](https://www.earthdata.nasa.gov/data/tools/firms/active-fire-data-attributes-modis-viirs) | Located; direct browser access returned a CloudFront 403 on 25 Aug 2026 | Attribute semantics for brightness, FRP, confidence, and scan/track geometry. |
| NASA-2 | [NASA FIRMS — VIIRS Fires and Thermal Anomalies](https://firms.modaps.eosdis.nasa.gov/descriptions/FIRMS_VIIRS_Firehotspots.html) | Located; browser navigation failed with a connection closure on 25 Aug 2026 | Scope limitation: the product represents thermal anomalies, not only emergency fires. |
| NASA-3 | [VIIRS Collection 2 375 m Active Fire Product User Guide](https://ladsweb.modaps.eosdis.nasa.gov/archive/Document%20Archive/Science%20Data%20Product%20Documentation/VIIRS_C2_AF-375m_User_Guide_1.2.pdf) | Located; pending review | Algorithm, quality controls, geometry, confidence, and caveats. |
| OSM-1 | [OpenStreetMap Wiki — `landuse=industrial`](https://wiki.openstreetmap.org/wiki/Tag:landuse%3Dindustrial) | Directly reviewed on 25 Aug 2026 | Spatial industrial-context polygon layer and semantic limitations. |
| NASA-4 | [NASA FIRMS — Static Thermal Anomalies Mask](https://firms.modaps.eosdis.nasa.gov/descriptions/Static_Thermal_Anomalies_Mask.html) | Directly reviewed on 25 Aug 2026 | Official benchmark for persistence screening of frequently observed thermal sources. |
| IMD-1 | [India Meteorological Department API Reference](https://api.imd.gov.in/public/api_reference.html) | Directly reviewed on 25 Aug 2026 | India-specific weather, nowcast, rainfall, warning, radar, and lightning context. |
| RES-1 | [Franklin et al. — Characterizing flaring from unconventional oil and gas operations using satellite observations](https://pmc.ncbi.nlm.nih.gov/articles/PMC8915930/) | Directly reviewed on 25 Aug 2026 | Evidence that persistent combustion can be separated from isolated observations using spatiotemporal density clustering and facility proximity. |
| RES-2 | [Ma et al. — Annual dynamics of global remote industrial heat sources, 2012–2021](https://www.nature.com/articles/s41597-024-03461-3) | Directly reviewed on 25 Aug 2026 | Data-driven industrial-heat-source inventory using time-space-density features, night-time lights, and manual multi-source validation. |
| NASA-5 | [NASA Earthdata — FIRMS features to identify active fires by type](https://www.earthdata.nasa.gov/news/blog/firms-releases-new-features-identify-active-fires-type) | Extracted on 25 Aug 2026 | NASA's own contextual method for distinguishing non-vegetation static heat from current active detections. |

## Evidence Framework

The research organizes every condition into ten evidence families: satellite observation quality; pixel geometry and geolocation; time and persistence; spatial industrial context; facility and process context; surrounding land use and exposed population; meteorology and atmospheric observation conditions; multi-sensor corroboration; data quality and provenance; and decision-risk governance. A detection should not be labelled as an industrial fire from one condition alone. The appropriate output is a graded, auditable decision such as **candidate industrial anomaly**, **likely routine heat source**, **insufficient evidence**, or **escalate for verification**.

## Important Interpretation Rule

NASA FIRMS delivers satellite-derived active-fire and thermal-anomaly observations. The tracker must preserve that distinction: it estimates a fire-hazard likelihood and prioritization level, rather than claiming confirmation without an independent verification channel.

## Reviewed Spatial-Context Finding

The OpenStreetMap definition describes `landuse=industrial` as areas primarily used for industrial activity, including workshops, factories, warehouses, and associated car parks, service roads, and yards. It explicitly cautions against applying the tag sweepingly to large areas where industrial infrastructure is dispersed. The tracker should therefore treat the polygon as useful **context evidence**, not an authoritative facility boundary, and augment it with more specific tags such as `man_made=works`, `industrial=*`, `utility=*`, `power=*`, building footprints, and named facility records where available. [OSM-1]

## Reviewed NASA and India Context Findings

NASA describes global VIIRS 375 m FIRMS data as active-fire **and thermal-anomaly** observations, explicitly naming gas flares and volcanoes as examples of non-emergency thermal sources. The product offers approximately 3–4 daily looks at mid-latitudes from the combined VIIRS platforms, with global availability within three hours. FIRMS defines FRP as pixel-integrated radiative power and notes that the 375 m algorithm is tuned for small fires; FRP can be unavailable or unreliable in difficult retrieval conditions and must not be treated as a ground-level fire-size measurement. [NASA-1] [NASA-2] [NASA-3]

NASA's 2023 static-thermal-anomaly reference mask summarizes VIIRS detection centroids on a 400 m grid and extracts cells with at least five detections during the year, followed by spatial filtering against industrial and power-plant location datasets. This supports a project-specific rolling-baseline approach, while also demonstrating that a persistence rule requires industrial-context screening rather than a simplistic “always hot means safe” assumption. [NASA-4]

The India Meteorological Department publishes public categories for current weather, district and station nowcasts, automatic-weather-station / automatic-rain-gauge observations, warnings, rainfall, radar, lightning, and cyclone products. The eventual operational tracker can use these only as contextual covariates—particularly wind, rain, lightning, heat conditions, visibility, and warning state—not as proof that a thermal anomaly is an industrial fire. [IMD-1]

## Reviewed Statistical and Persistence Findings

The flaring study by Franklin and colleagues used VIIRS Nightfire observations, spatiotemporal hierarchical density clustering, and proximity to well data to identify persistent flaring sources; observations not placed in clusters were treated as noise. Its relevance is methodological rather than geographic: routine combustion tends to recur around stable locations, while incident heat is often a new or changing signal. [RES-1]

Ma and colleagues built an industrial-heat-source inventory from long-term VIIRS active-fire records using spatial-temporal clustering, hotspot counts, density, time span, night-time lights, high-resolution imagery, points of interest, and OpenStreetMap validation. The study notes a prior India inventory and illustrates why an operational tracker should learn facility-specific baselines instead of relying only on a global temperature or FRP threshold. [RES-2]

NASA's 2025 FIRMS feature description similarly differentiates vegetation burning from natural and industrial heat sources, including mineral processing, gas flares, waste incinerators, cement, steel, and petrochemical facilities. Its static mask is provisional and NASA explicitly advises users to apply caution regarding the accuracy and comprehensiveness of industrial/natural heat-source data. The SIH project should therefore show **“probable / needs verification”** outcomes, retain source provenance, and never phrase a satellite-only decision as a verified on-site incident. [NASA-5]

## Official FIRMS service routes and platform transition — reviewed 25 Aug 2026

NASA documents the authenticated Area API as `/api/area/csv/[MAP_KEY]/[SOURCE]/[AREA_COORDINATES]/[DAY_RANGE]` and supports NOAA-20, NOAA-21, and S-NPP VIIRS NRT sources. The same documentation specifies a MAP_KEY transaction ceiling of 5,000 requests per 10-minute interval. [NASA-6]

NASA also documents an authenticated WFS service, updated every 15 minutes. For India, the appropriate WFS regional path is `Russia_Asia`; its relevant 24-hour and seven-day layers include `ms:fires_noaa20_*` and `ms:fires_noaa21_*`. The permanent relay uses only these official NASA FIRMS endpoints. [NASA-7]

NASA currently announces that S-NPP delivery will cease on 1 November 2026 and recommends NOAA-21 and NOAA-20 alternatives. The verifier therefore uses NOAA-20 plus NOAA-21 as its independent satellite pair. The FIRMS academy confirms that MAP_KEYs can be used with API, WMS, and WFS services. [NASA-6] [NASA-8]

| ID | Source | Status | Use in production relay |
| --- | --- | --- | --- |
| NASA-6 | [NASA FIRMS API and Area API](https://firms.modaps.eosdis.nasa.gov/api/area/) | Directly extracted 25 Aug 2026 | Official authenticated Area API format, sources, and transaction limits. |
| NASA-7 | [NASA FIRMS WFS Information](https://firms.modaps.eosdis.nasa.gov/mapserver/wfs-info/) | Directly extracted 25 Aug 2026 | Official WFS route, 15-minute update cycle, and India regional layer names. |
| NASA-8 | [NASA FIRMS API Academy](https://firms.modaps.eosdis.nasa.gov/content/academy/data_api/firms_api_use.html) | Directly extracted 25 Aug 2026 | MAP_KEY applicability to API, WMS, and WFS. |

## Cloudflare production relay references — reviewed 25 Aug 2026

Cloudflare documents account-level Workers subdomains through `GET`, `PUT`, and `DELETE /accounts/{account_id}/workers/subdomain`; creating a subdomain requires the `subdomain` field. The FireGuard account subdomain was initialized through this official API. [CF-1]

Cloudflare documents that a Worker can have a `workers.dev` subdomain configuration with an explicit `enabled` setting. The `workers.dev` documentation notes that a Worker receives a route of the form `<worker-name>.<account-subdomain>.workers.dev` only when the worker subdomain is enabled. [CF-2] [CF-3]

| ID | Source | Status | Use in production relay |
| --- | --- | --- | --- |
| CF-1 | [Cloudflare API — Workers Subdomains](https://developers.cloudflare.com/api/resources/workers/subresources/subdomains/) | Directly extracted 25 Aug 2026 | Account workers.dev subdomain initialization. |
| CF-2 | [Cloudflare Workers API](https://developers.cloudflare.com/api/resources/workers/) | Directly extracted 25 Aug 2026 | Worker subdomain `enabled` setting. |
| CF-3 | [Cloudflare workers.dev documentation](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/) | Directly extracted 25 Aug 2026 | Public workers.dev route behavior and production routing caveat. |
