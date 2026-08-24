# India Industrial Thermal-Anomaly Intelligence

**Research brief for an SIH live-tracker concept**  
**Prepared by Manus AI · 25 August 2026**

## Executive conclusion

NASA FIRMS should be treated as an **observation layer**, not an industrial-fire incident feed. A VIIRS point says that a satellite pixel satisfied a thermal-anomaly / active-fire detection algorithm; it does not establish the fuel, facility, cause, fire size, or consequence on the ground. NASA explicitly describes the VIIRS layer as containing active-fire detections and thermal anomalies, including gas flares and volcanoes.[1] Therefore, the correct project objective is to convert a raw detection into an **auditable, confidence-aware screening decision**: *likely routine heat source*, *non-industrial / out of scope*, *insufficient evidence*, or *screened candidate requiring independent verification*.

> **Do not display “industrial fire confirmed” from FIRMS and OSM alone.** A defensible system separates the probability that a meaningful thermal change occurred from the potential consequence if the change is an industrial fire.

| Decision layer | Primary question | Appropriate output |
| --- | --- | --- |
| Satellite observation | Was a credible thermal anomaly observed? | Accepted / quality-limited detection |
| Spatial interpretation | Is it close enough to a plausible industrial context? | Industrial-context likelihood |
| Baseline interpretation | Is it different from routine heat at this location? | New, escalating, persistent, or routine |
| Corroboration | Is there independent, time-aligned support? | Corroborated / not yet corroborated |
| Consequence screening | If genuine, who or what could be exposed? | Priority tier and review target |

## 1. What FIRMS provides—and what it does not

FIRMS’ global VIIRS 375 m data use a nominal 375 m fire pixel at nadir, while `scan` and `track` record the actual footprint size. Its fields include latitude, longitude, I-4 brightness temperature, I-5 brightness temperature, FRP, confidence, day/night, acquisition time, satellite and processing version.[1] The three combined VIIRS platforms can provide roughly three to four looks per day at mid-latitudes; NASA documents a global availability latency of within three hours rather than continuous streaming.[1] [2]

FRP is **pixel-integrated fire radiative power in megawatts**, not a direct estimate of burned area, flame size, economic loss, or industrial-fire severity. The VIIRS guide further notes that 375 m FRP retrieval is constrained by saturation and background conditions, and that difficult cases can produce null or zero FRP.[1] [3] A workflow should use FRP as a contextual intensity feature, never as a single alert threshold.

| FIRMS field or metadata | Why retain it | Screening use |
| --- | --- | --- |
| `latitude`, `longitude`, `scan`, `track`, `PixArea` | A point is the centre of a varying footprint | Buffer and evaluate overlap rather than exact point-in-polygon only |
| `acq_date`, `acq_time`, satellite, `daynight` | Context changes by satellite pass and illumination | Build pass-specific baselines in UTC; display India Standard Time as a convenience |
| `bright_ti4`, `bright_ti5`, background values, FRP | Thermal magnitude and contrast information | Robust anomaly feature; do not interpret in isolation |
| confidence and algorithm QA | Detection-quality / scene context information | Hard or soft quality gate |
| version / NRT vs standard | Product provenance and later correction risk | Audit record; reprocess historical labels where possible |
| type, where available | NASA’s inferred high-level source category | A supporting feature, not ground truth |

## 2. Non-negotiable quality gates

The first stage should reject or downgrade detections that are unsuitable for industrial-hazard inference. NASA describes low-confidence daytime pixels as commonly associated with sun glint and a lower relative I-4 temperature anomaly; nominal detections are free of potential daytime glint contamination and have a stronger anomaly, while high-confidence detections are saturated pixels.[1] The Collection 2 guide additionally exposes pixel-level flags for cloud, water, glint, input quality, geolocation quality, residual bow-tie data and contextual tests.[3]

| Gate | Minimum operational condition | Action when unmet |
| --- | --- | --- |
| Confidence | Begin with nominal/high; keep low only in a separate analyst queue | Do not auto-escalate low confidence |
| Scene quality | No critical quality, cloud, water, bow-tie, bad-geolocation, or missing-data indicator | Exclude or flag as `quality_limited` |
| Footprint | Calculate actual footprint / uncertainty buffer from scan-track and viewing geometry | Avoid a binary “inside facility” claim |
| Time coherence | UTC timestamp must be valid; source age inside an agreed reporting window | Label stale, delayed or duplicate records |
| Product provenance | Store product collection, source, request URL/hash, ingestion timestamp | Permit later audit and reprocessing |
| Observation opportunity | Record whether a pass was possible but cloud-obscured or missing | Never interpret non-detection as zero heat |

## 3. Comprehensive condition catalogue

The following catalogue is deliberately broad. Not every condition belongs in a first SIH prototype; it prevents the design from hiding future assumptions. A sensible MVP starts with **quality, spatial context, facility baseline, recurrence, exposure and manual corroboration**.

### 3.1 Satellite acquisition and pixel integrity

Evaluate platform, product version, processing status, day/night, UTC/IST acquisition time, sensor channel brightness temperatures, background temperature contrast, FRP, FRP availability, confidence, scan, track, footprint area, solar and view geometry, glint angle, cloud / water adjacency, land-water mask, algorithm-QA flags, geolocation quality, residual bow-tie status, missing granules, satellite manoeuvre warnings, duplicate observations and time-synchronisation errors.

### 3.2 Spatial association and OSM data fitness

Use a footprint-to-polygon association instead of assigning a detection to whichever polygon contains its centre. Compute overlap fraction, distance to the nearest boundary, nearest named feature, polygon geometry validity, OSM object timestamp, tag completeness, and whether the context is `landuse=industrial`, `man_made=works`, `industrial=*`, `utility=*`, `power=*`, a building footprint, storage tanks, a landfill, mine, kiln, refinery or port. The OSM documentation defines `landuse=industrial` as land primarily used for industrial purposes—including factories, warehouses and associated yards—but warns against broad sweeping use over large mixed areas.[4] This makes OSM **strong contextual evidence, not a facility registry of record**.

### 3.3 Temporal behaviour and persistence

Assess first-seen time, rolling 1/7/30/365-day count, number of viable observation opportunities, repeat location density, duration, season, time-of-day and satellite-pass pattern, consecutive-pass activity, gap length, FRP and brightness trend, facility-cell baseline median/MAD, detected level shift, and membership in a persistent source cluster. NASA’s static thermal anomaly mask used 400 m grid cells with at least five active-fire detections across 2023, then filtered those cells using industrial and power-plant sources.[5] That is a useful reference design—not a universal threshold.

### 3.4 Routine industrial heat and process context

Identify facility category, known flare stack, power plant, blast furnace, cement kiln, refinery, petrochemical complex, steel plant, brick kiln, waste-to-energy plant, landfill, incinerator, mine or quarry. Add known operating hours, maintenance schedules, shutdowns, reported capacity, power/gas network context, static-source inventory, night-light baseline and facility-specific operating profile when available. An industrial source can be hazardous while still being routine; routine does not mean harmless. It means “not a newly observed fire incident” within the tracker’s specific mandate.

### 3.5 Confounders outside the industrial-fire hypothesis

Screen vegetation, crop-residue and forest fires; crop calendar and burn season; geothermal/volcanic sources; offshore platforms and vessels; water pixels; smoke-plume artefacts; sun glint; very hot bare ground; road/rail-side burning; open waste burning; cremation grounds; festivals or temporary fires only when independently evidenced; nearby wildfire perimeter; land cover; vegetation index; agricultural field geometry; and any known static thermal-source mask. NASA cautions that its own industrial/natural heat-source layers are provisional and not comprehensive.[6]

### 3.6 Meteorology, atmosphere and plume plausibility

Use cloud and smoke cover; precipitation; humidity; ambient temperature; wind speed, direction and vertical layer; stability/mixing height; visibility; fog; dust; heatwave and dry-spell indicators; lightning; radar/nowcast; and time-aligned aerosol, smoke or air-quality information. India Meteorological Department public interfaces enumerate current weather, nowcasts, weather warnings, rainfall, radar and lightning resources, which can supply contextual rather than confirmatory features.[7]

### 3.7 Exposure, consequence and response relevance

Compute distance or travel-time to population, workers, schools, hospitals, roads, rail, ports, waterways, protected areas and critical infrastructure. Consider likely hazardous materials, chemical-process category, storage-tank density, facility size, downwind population and nearby industrial density. Keep **event likelihood** separate from **consequence**: a low-probability candidate can deserve rapid review where potential consequence is high.

### 3.8 Corroboration, feedback and governance

Record independent satellite/pass agreement; high-resolution optical check; local fire-service / facility report; verified authority alert; smoke or air-quality support; analyst rationale; source URL; model version; parameters; raw and derived timestamps; uncertainty; eventual verdict; and a false-positive / missed-event feedback loop. An `abstain` outcome must be allowed when cloud, data quality or context are insufficient.

## 4. Computational-statistics design

### 4.1 Use two scores, not one opaque score

The application should maintain a **signal score** and a separate **priority score**. Signal score estimates whether the observation is unusual and compatible with an incident relative to the facility’s normal pattern. Priority score evaluates likely impact if the signal is genuine. Combining both into one unknown number hides important trade-offs.

| Component | Suggested statistical construct | Why it helps |
| --- | --- | --- |
| Facility-relative heat | Robust z-score based on median and MAD | Routine high-heat facilities do not automatically dominate; resistant to outliers |
| Gradual / sudden level change | EWMA plus one- or two-sided CUSUM | React to sustained change, not one noisy pass |
| Detection-count surge | Poisson or negative-binomial model with observation exposure | Distinguishes a count spike from more satellite looks or cloud-free days |
| Persistent sources | ST-DBSCAN / HDBSCAN cluster membership and cluster stability | Groups irregular spatial patterns without assuming Gaussian clusters |
| Incident probability | Calibrated logistic model, gradient boosting or Bayesian network | Combines heterogeneous evidence and yields a probability band |
| Uncertainty | Bootstrap, conformal interval, missingness indicator and abstention | Makes weak evidence visible instead of manufacturing a confident alert |

For a thermal feature \(x_t\), a robust facility-pass-season score can be defined as:

\[
z_{robust} = \frac{x_t - \operatorname{median}(x_{facility, pass, season})}{1.4826 \times \operatorname{MAD}(x_{facility, pass, season})}
\]

Only calculate it after a minimum baseline sample count. For thin history, shrink the facility estimate toward a peer-group baseline—for example, same industrial type and region—and increase uncertainty. Do not use a single national FRP threshold.

> A practical anomaly rule is: **quality pass** AND **industrial context is plausible** AND **not a known persistent source** AND **facility-relative shift exceeds a calibrated threshold**. A higher priority requires either second-pass / second-sensor support or an independent corroboration channel.

### 4.2 Python-oriented analysis sequence

Use `pandas` for ingestion, `geopandas`/`shapely` for geometry, `pyproj` for a metric projection, and a spatial database such as PostGIS for scalable joins. For modelling, use `scikit-learn` for robust preprocessing, calibrated classifiers and DBSCAN; use `hdbscan` when variable-density clusters matter; `statsmodels` or explicit numerical code for EWMA/CUSUM and count models. Keep raw FIRMS rows immutable and materialise a derived `candidate_observation` table carrying every feature and decision component.

```python
# Illustrative decision structure, not production thresholds
quality_ok = rec.confidence in {"n", "h"} and not rec.qa_critical
context = industrial_overlap(rec.footprint, osm_features, buffer_m=rec.uncertainty_m)
baseline = facility_baseline(rec.facility_id, rec.satellite, rec.daynight, rec.season)
z = robust_z(rec.frp_or_brightness, baseline) if baseline.n >= 12 else None
persistent = static_mask_hit(rec) or hdbscan_cluster_is_routine(rec.history)
signal = quality_ok and context.plausible and not persistent and z is not None and z > threshold
priority = priority_score(signal, context.process_risk, downwind_exposure, rec.uncertainty)
```

The threshold must be calibrated from **verified outcomes**, with a time-based holdout set so a system does not “learn” an incident from future data. Assess precision, recall, false-alert burden, time-to-triage, calibration slope, Brier score, outcome coverage by facility type, and performance under cloud/missing data. Start with human-in-the-loop review rather than unattended notification.

## 5. Live-system architecture options

The delivered webpage is intentionally a **static research prototype**. It uses illustrative data and does not expose a FIRMS key or claim real-time detection. A future operational implementation needs a protected ingestion service, storage and scheduled computation.

| Approach | Trade-offs | Cost | Setup complexity |
| --- | --- | --- |
| Static research and UI prototype | Safest for SIH storytelling; demonstrates logic and interaction but has no real data refresh | No operational-data cost | Low |
| Managed periodic data service with dashboard controls | Data keys remain server-side; stores raw records and baselines; can run deterministic refreshes every few hours and supports an analyst queue | Free to start on a managed deployment; later hosting/database usage may apply | Moderate |
| Continuously running process | Useful only if a confirmed source requires sub-minute checks or long-held realtime connections; not aligned with global FIRMS’ documented three-hour availability | Ongoing hosting cost | Higher |

For a production system, no API key should be placed in browser JavaScript. Cache OSM/Overpass results, use bounded geographic queries, respect source policies, use a retry/backoff queue, deduplicate satellite records, persist the raw source payload, and emit an alert only after the decision record has been stored.

## 6. Minimal viable SIH demonstration

The highest-value demo has five visible steps: show FIRMS candidate markers; hover for satellite fields and spatial context; click to animate the quality/context/persistence checks; display a conservative result; and reveal why the system refused to claim confirmation. Include an analyst acknowledgement control in a later version, but never fabricate incident reviews, public testimonials or user feedback.

The first five evidence features to implement should be the FIRMS quality/confidence fields, actual footprint buffer, OSM industrial/works context, rolling persistence baseline, and a facility-relative heat/change score. The next addition should be a small manually reviewed validation set—not a larger machine-learning model.

## References

[1] [NASA FIRMS, “VIIRS Fires and Thermal Anomalies (Day | Night, 375m)”](https://firms.modaps.eosdis.nasa.gov/descriptions/FIRMS_VIIRS_Firehotspots.html).  
[2] [NASA Earthdata, “FIRMS FAQ”](https://www.earthdata.nasa.gov/data/tools/firms/faq).  
[3] [Schroeder, Giglio & Hall, *Collection 2 VIIRS 375-m Active Fire Product User’s Guide*, June 2025](https://ladsweb.modaps.eosdis.nasa.gov/archive/Document%20Archive/Science%20Data%20Product%20Documentation/VIIRS_C2_AF-375m_User_Guide_1.2.pdf).  
[4] [OpenStreetMap Wiki, “Tag: landuse=industrial”](https://wiki.openstreetmap.org/wiki/Tag:landuse%3Dindustrial).  
[5] [NASA FIRMS, “Static Thermal Anomalies—Mask”](https://firms.modaps.eosdis.nasa.gov/descriptions/Static_Thermal_Anomalies_Mask.html).  
[6] [NASA Earthdata, “FIRMS Releases New Features to Identify Active Fires by Type”](https://www.earthdata.nasa.gov/news/blog/firms-releases-new-features-identify-active-fires-type).  
[7] [India Meteorological Department, “IMD API Reference”](https://api.imd.gov.in/public/api_reference.html).  
[8] [Franklin et al., “Characterizing flaring from unconventional oil and gas operations in south Texas using satellite observations,” *Environmental Science & Technology*, 2019](https://pmc.ncbi.nlm.nih.gov/articles/PMC8915930/).  
[9] [Ma et al., “Annual dynamics of global remote industrial heat sources dataset from 2012 to 2021,” *Scientific Data*, 2024](https://www.nature.com/articles/s41597-024-03461-3).
