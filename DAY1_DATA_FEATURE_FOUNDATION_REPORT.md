# FireDash ML Controlled Rebuild — Day 1 Report

**Date:** 2026-09-19  
**Scope:** Mining evidence refresh and additive agricultural-burning feature foundation  
**Model status:** No model was trained, replaced, or deployed. The existing two-class fallback and the existing four-class artifact remain untouched.

## Executive summary

Day 1 refreshed only stale OSM cache entries whose previous cached payload was relevant to mining or quarry classification. The refresh used the existing `evaluateCorroboration()` pipeline, which in turn uses the established Overpass mirror set and existing cache writer. Twelve stale mining-relevant entries were found; ten returned valid current mining/quarry context and two remained unresolved because the live path fell back to Google Places without a typed mining result.

The previous audit reported **11 legitimate mining candidates**. After the refresh and regenerated feature foundation, the current evidence set contains **16 mining-provenance coordinate groups** under the existing mining-context rule. The ten successful stale refreshes are not all net-new coordinates: some overlap previously known locations, while the refresh also caused the existing corroboration path to persist additional real FIRMS history rows. No mining labels were fabricated or padded.

The additive feature foundation now contains **1,503 coordinate rows**. It preserves raw FIRMS-derived thermal/platform fields, adds a calendar prior as contextual evidence only, computes date-based temporal features, and records explicit nulls for unavailable hour-level and fractional land-cover features.

## Task A — mining OSM refresh

### Counts

| Measure | Exact result |
|---|---:|
| Previous audit mining count | **11** |
| Current exact stale OSM cache entries | **141** |
| Stale entries relevant to mining/quarry classification | **12** |
| Stale mining-relevant entries refreshed | **12 attempted** |
| New valid mining/quarry results from refresh | **10** |
| Unresolved/ambiguous refresh results | **2** |
| Final mining-provenance coordinate groups | **16** |

The earlier audit had approximately 135 stale entries; the current database query found **141** stale OSM entries exactly. Only the 12 entries whose old payload indicated mining/quarry relevance were refreshed.

### Successful refreshed mining evidence

The successful refresh returned typed mining or quarry context at ten coordinates. Representative named results included **Rajappa Coal Mine**, **Ramagundam III Coal Mine**, **Kamptee coal mine**, **Amalgamated Keshalpur-West Mudidih (AKWMC) Coal Mine**, **Rajmahal Coal Mine**, and **Giral Mine**. The returned distances ranged from approximately **38.8 m to 3,735.2 m**.

### Unresolved cases

Two stale mining-relevant cache entries did not produce valid typed mining evidence:

| Coordinate | Result |
|---|---|
| 21.744, 83.844 | Live result was `google-places-industrial`; no mining category, type, name, or distance was returned |
| 23.330, 70.213 | Live result was `google-places-industrial`; no mining category, type, name, or distance was returned |

These cases were **not counted as mining**.

### Side effect that is documented, not hidden

Because the refresh reused the existing full corroboration pipeline, it also persisted real FIRMS observations encountered during those verification runs. The feature foundation increased from **1,308 rows before refresh to 1,503 rows after refresh**, a net increase of **195 stored FIRMS history rows**. This was not synthetic data; it was the existing pipeline’s normal real-observation history write path. No existing database schema was changed.

## Task B — agricultural feature foundation

The generated artifact is:

`server/data/agricultural_feature_foundation.json`

It contains one row per stored coordinate group and includes the following feature families.

| Feature family | Fields | Source | Window | Computable now? | Coverage / variation |
|---|---|---|---|---|---|
| Calendar prior | state, month, day-of-year, numeric prior, confidence tier, calendar state | Existing seasonal agricultural calendar and stored state geometries | Latest stored FIRMS date | Partially | State identified for **56/1,503** rows; **0** were in-season at their latest date; prior had only value 0 in current data |
| Land-cover context | point class, cropland fractions at 250 m/500 m/1 km, forest/shrub fraction, forest distance | Existing Esri Sentinel-2 point land-cover cache | Point lookup; neighborhood fractions requested as additive fields | Point class only | Land-cover class **452/1,503**; all fractional and forest-distance fields unavailable |
| Temporal fire behaviour | 6 h, 24 h, 3 d, 7 d counts, burst duration, active-month count, recurrence-by-month | Stored FIRMS `detectionHistory` | Date-based; latest observation as anchor | Date-based only | 3 d and 7 d counts **1,503/1,503**, but both had only value **1**; burst duration and active months also had no variation; 6 h/24 h unavailable |
| Industrial spatial context | nearest GPPD distance, nearest OSM facility distance/category, recurrent industrial history | GPPD table and active OSM cache | Spatial nearest match; recurrence requires longer history | Partially | GPPD distance available **1,503/1,503**; OSM facility distance **74/1,503**; recurrent history intentionally null |
| Thermal context | FRP MW, brightness, bright T31, platform, confidence | Stored FIRMS rows | Latest stored row per coordinate | Partially | FRP **1,275/1,503**; platform **1,271/1,503**; confidence **1,503/1,503**; `bright_t31` unavailable because it is not persisted in the current schema |

### Current feature variation

| Feature | Non-null rows | Distinct values | Current finding |
|---|---:|---:|---|
| Detections within 3 days | 1,503 | 1 | Always 1; not useful yet |
| Detections within 7 days | 1,503 | 1 | Always 1; not useful yet |
| Burst duration | 1,503 | 1 | Always 0 days; not useful yet |
| Active months | 1,503 | 1 | Always 1; not useful yet |
| Recurrence by month | 1,503 | 1 | Always 1; not useful yet |
| Calendar prior | 56 | 1 | Only 0 in the current observed dates |
| FRP MW | 1,275 | 513 | Continuous variation exists; missingness remains explicit |

## Label-quality audit

The feature foundation preserves the existing label interpretation for audit purposes but does not change or promote labels.

| Legacy label provenance | Current coordinate-group count | Interpretation |
|---|---:|---|
| `industrial_facility` | **277** | GPPD or named typed OSM facility support; strongest available provenance in this artifact |
| `mining` | **16** | Typed mining/quarry OSM context after refresh |
| `wildfire` | **64** | Forest/grassland land-cover heuristic; not independently confirmed wildfire ground truth |
| `agricultural_burning` | **61** | Cropland-only heuristic; not independently confirmed agricultural burning |
| Independently facility-supported rows | **293** | Facility-context support exists; this is not equivalent to verified fire cause |

The calendar prior does **not** assign any label. The generated agricultural-burning rows remain heuristic because the current evidence only establishes cropland context, not crop-residue burning at the point. The report therefore does not treat the 61 rows as validated agricultural ground truth.

## Data-quality warnings

1. The existing history table stores `detectionDate` but not FIRMS acquisition time. Six-hour and 24-hour temporal features cannot be computed honestly and are emitted as `null`.
2. The existing land-cover integration returns a point class, not neighborhood fractions. Cropland fractions and forest/shrub fractions are emitted as `null` rather than estimated.
3. All current date-based persistence features are constant at one observation/one month/zero burst duration in the generated coordinate groups. More history must accumulate before these fields become useful.
4. The calendar prior is contextual evidence only. It is not a ground-truth label and must not be used as a direct agricultural-burning label.
5. FRP is available with meaningful continuous variation for 1,275 rows, but 228 rows remain missing FRP in the broader stored history and are preserved as missing.
6. Only 12 stale OSM entries were relevant to mining; 2 remain unresolved and were excluded from the mining count.
7. The existing full corroboration refresh path persisted 195 additional real FIRMS history rows. This is documented because it changes the database row count, although no schema or label rule was modified.

## Exact files changed

### Added source files

- `server/agriculturalFeatureFoundation.ts` — additive feature-generation module and database-backed JSON builder.
- `server/day1MiningRefresh.ts` — manual, narrowly filtered stale mining OSM refresh command using the existing corroboration path.
- `server/agriculturalFeatureFoundation.test.ts` — deterministic tests for calendar-prior behavior, temporal windows, null handling, thermal/platform preservation, and unavailable spatial fractions.

### Generated data artifact

- `server/data/agricultural_feature_foundation.json` — 1,503 auditable coordinate feature rows with coverage and warning metadata.

### Protected files not changed

- `server/classification.ts`
- `server/corroboration.ts`
- Existing ML classifier/model artifacts
- Database schema and migrations
- Scheduler behavior

## Validation

- Deterministic feature/calendar tests: **10 passed**.
- Full test suite: **24 test files, 120 tests passed**.
- TypeScript check: **passed**.
- Production build: **passed**.
- Repository diff check: **passed**.

The production build warning about a large frontend chunk remains an existing optimization warning; it is unrelated to this data-only Day 1 work.

## Day 2 recommendation

1. Backfill or persist FIRMS acquisition time and, where available, `bright_t31` without changing or fabricating historical values. This is required before 6-hour/24-hour behavior and additional thermal-difference features can be evaluated.
2. Add a real neighborhood land-cover source or raster-window computation to calculate cropland fractions at 250 m, 500 m, and 1 km. The current point-class source cannot provide those fractions.
3. Allow the scheduled FIRMS history process to accumulate repeated observations at the same coordinate. Re-run the feature builder only after repeated dates exist; do not train while persistence fields remain constant.
4. Use the calendar prior as a stratifying/context feature, never as a label. Keep agricultural labels flagged as heuristic until point-level independent evidence is available.
5. Continue OSM refresh for the remaining stale/ambiguous mining entries only when needed. Mining remains below the original 30-example threshold at 16 coordinate groups.
6. Reject the current agricultural-burning labels as validated ground truth for final four-class training. The feature foundation is ready for quality improvement, not final model retraining.

## Deployment note

This Day 1 work is intentionally not wired into live prediction and does not alter the Vercel UI or deployed model behavior. The source and generated artifact can be pushed through the existing GitHub-to-Vercel pipeline for versioning, but no new model or runtime classification behavior should be promoted from this report.
