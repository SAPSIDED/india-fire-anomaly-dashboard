# Interaction Fix Tasks

- [x] Make each rendered risk-zone hit target reliably receive pointer hover and click events above the embedded map.
- [x] Open the conditional-verification popup directly when a risk zone is clicked, while retaining a concise hover summary.
- [x] Ensure the selected observation is passed into the popup and that its final conclusion is clearly stated.
- [x] Validate the corrected interaction at desktop and mobile sizes.

## Geospatial and Corroboration Correction Tasks

- [x] Replace screen-relative hotspot overlays with map-native markers and zones anchored by latitude and longitude.
- [x] Open a map-native information window that keeps the selected anomaly tied to the marker while users pan and zoom.
- [x] Run the satellite, industrial-context, persistence, weather, and corroboration checks concurrently in the verifier UI.
- [x] Make unconfigured or unavailable corroboration sources visibly lower confidence instead of producing a conclusive result.
- [x] Validate marker anchoring while zooming and panning the India map.
- [x] Query an independent second VIIRS platform and make cross-platform agreement an explicit concurrent corroboration condition.
- [x] Verify and document marker persistence after a live map-pan interaction.

## Live Extraction Resilience Tasks

- [x] Diagnose FIRMS and Overpass upstream failures from the server runtime.
- [x] Add bounded retry, endpoint fallback, and clear failure classification for live FIRMS and OSM lookups.
- [x] Cache recent successful source responses and make their timestamp/freshness visible in the verifier.
- [x] Ensure an upstream outage produces a professional evidence-pending result, never a crash or false industrial-fire conclusion.
- [x] Add deterministic tests for retry, fallback, cached evidence, and failure-safe conclusions.
- [x] Test a full no-cache outage path and assert that it returns evidence-pending rather than a candidate or crash.
- [x] Verify and document the no-cache evidence-pending state in the running verifier UI.
- [x] Bound the overall live-evidence window so delayed upstream calls cannot leave the verifier loading indefinitely.
- [x] Prove bounded retry and alternate-Overpass mirror handling with a deterministic test.
- [x] Extend existing OSM industrial evidence with nearest-facility name, matched tag type, and distance while preserving the industrial feature count and thresholds.
- [x] Add deterministic named-match, unnamed-match, and no-match coverage for additive nearest-facility metadata.

## Operational Evidence Recovery Tasks

- [x] Diagnose the effective NASA FIRMS credential and server-to-source connectivity for each live evidence provider.
- [x] Replace avoidable external-source outages with validated, operational fallback providers or official alternative routes.
- [x] Add an administrator-controlled authority or verified-facility incident-evidence input path required for a confirmed industrial-fire conclusion.
- [x] Present a source-backed conclusion only when all required evidence conditions are actually met.
- [x] Validate the repaired verifier with a live source-backed run and document any remaining user-supplied requirement.
- [x] Add the official NASA FIRMS WFS route for Russia and Asia as a thermal-detection fallback and use NOAA-21 as the independent VIIRS sensor.
- [x] Validate the official WFS fallback with a deterministic server test and a live verifier request.
- [x] Prevent deterministic test fixtures from being persisted or displayed as live cached evidence, then remove any existing fixture cache records.
- [x] Add an authenticated Google Places facility-context fallback for OSM outages and label its provenance clearly in the verdict.

## Permanent NASA FIRMS Relay Tasks

- [x] Assess connected Cloudflare deployment credentials and the required secure environment variables for a persistent Worker relay.
- [x] Implement a transparent Worker relay that permits only official NASA FIRMS request paths and keeps NASA_FIRMS_MAP_KEY server-side.
- [x] Deploy the Worker to a permanent HTTPS URL and configure its production secrets without exposing them to the frontend.
- [x] Configure the FireGuard backend to use the relay base URL, retaining retries, cache policy, OSM, and weather integrations.
- [x] Verify the live FireGuard frontend-to-backend-to-relay-to-NASA and response path with a real FIRMS request.
- [x] Validate the replacement Cloudflare token from the permitted deployment environment.
- [x] Explicitly verify the completed relay-backed verdict text in the browser after a map-zone check.

## Backend Review Package

- [x] Package the complete FireGuard backend source, schema, tests, and runtime guide for review.

## Presentation-Only Redesign

- [x] Redesign the FireGuard presentation layer as a responsive, restrained satellite thermal-intelligence interface without changing backend code, data flow, routes, authentication, or verifier behavior.
- [x] Add an accessible, reduced-motion-safe interactive thermal background, pastel map styling, and a geometric display-font refinement without changing any backend or tracker functionality.
- [x] Rework the presentation layer into a light, playful thermal-canvas experience inspired by the supplied contemporary Japanese design reference, while preserving and revalidating the live conditional-verification workflow unchanged.
- [x] Complete a post-redesign live browser verification to a returned source-backed screening result and document the verdict text.
- [x] Apply the FF Mark Pro–first geometric font stack consistently across interface text and make the light thermal background more visibly heat-driven and pointer-responsive, without changing tracker logic.
- [x] Resolve the reported incidentEvidence module-export error and reverify the live map, source-verification modal, and corrected visual presentation without runtime errors.
- [x] Capture a completed post-restart source-verification modal state and clean console result to prove the runtime error does not recur during conditional checking.
- [x] Capture and document a completed post-restart verifier verdict with a clean console to prove the full conditional-checking flow remains runtime-error-free.
- [x] Replace the peach display-text emphasis with a cherry-red gradient without changing the thermal canvas or tracker functionality.
- [x] Turn the historical-analysis panel into an interactive, clearly labelled statistical visualization without presenting illustrative target context as live historical evidence.
- [x] Make the historical graph visibly interactive for zero-observation live responses using selectable evidence-safe views and explicit no-detection timeline marks, without inventing historical detections.
- [x] Verify in the browser that a live zero-detection response renders selectable zero-observation marks and that both preview and live marker selections update the selected-day callout.
- [x] Verify browser selection changes for both the NOT QUERIED preview markers and live zero-observation markers, then record the updated callout states.
- [x] Restore and confirm browser-preview availability if the local preview connection becomes unavailable during graph interaction validation.
- [x] Capture an independently observable NOT QUERIED preview-marker change from its default date to a different selected-day callout before finalizing the historical graph validation.
- [x] Capture browser readbacks before and after a NOT QUERIED marker activation to document the callout transition from 25 Aug to a different date.

## Additive Rule-Based Classification

- [x] Add a pure classification module for industrial thermal source, likely wildfire vegetation, and uncertain other labels using only existing corroboration evidence.
- [x] Attach the additive classification field to the existing corroboration response without changing source retrieval, database, dependencies, or existing procedure contracts.
- [x] Add deterministic tests for each classification rule and run the full existing validation suite.
- [x] Extend the classifier input and decision reasons with already available land-cover and long-term-history evidence, without changing retrieval or persistence code.
- [x] Add deterministic agreement, disagreement, and unavailable-evidence fallback tests for the enriched classification rules.

## Database-Backed FIRMS History

- [x] Add an additive detection-history table for deduplicated FIRMS location, date, brightness/confidence, and created-at records.
- [x] Store real FIRMS detection rows returned by the existing live capture path without changing Stage 1 classification rules or live request behavior.
- [x] Add a database-only long-term persistence summary and attach it additively to the corroboration response.
- [x] Test history capture, duplicate safety, empty-history behavior, and source-outage handling.
- [x] Add deterministic coverage that live FIRMS rows reach the detection-history capture path while cached and unavailable results do not.
- [x] Add deterministic coverage for the additive longTermHistory response field under empty-history and database-unavailable conditions.
- [x] Inspect a non-test live verification response and the detectionHistory database table to confirm real persistence and long-term-history readback end to end.
- [x] Automatically retrieve the first current valid Indian FIRMS detection from the configured official relay and use it for the real write/read-back validation.
- [x] Retrieve a real Indian FIRMS detection from an official 24-hour relay route and verify `firmsCurrent` is available with at least one local detection.
- [x] Repeat the write/read-back and duplicate-safe database checks using that genuinely current detection coordinate.
- [x] Prefer a completed live official FIRMS response with valid local detections over an earlier successful zero-row response, while keeping the three existing relay requests, retries, caching, response contract, and Stage 1 classification unchanged.
- [x] Add deterministic coverage for the detected-row preference and rerun the real 24-hour FIRMS persistence validation.
- [x] Make positive local FIRMS detections win without waiting for slower empty, failed, or hanging sibling routes.
- [x] Add a timing regression test for a fast zero-row route, a positive route, and a hanging sibling route.

## Additive Land-Cover Evidence

- [x] Research a free public land-cover source suitable for point lookups in India and record its class mapping and source attribution.
- [x] Add a failure-safe `server/landcover.ts` lookup with successful-response caching for approximately 30 days and cached fallback.
- [x] Expose land-cover evidence additively in `corroboration.run` without changing Stage 1 classification, existing FIRMS/OSM logic, or Stage 2 history.
- [x] Add deterministic live, cached-fallback, and unavailable-source coverage, then validate the full application build.
- [x] Prove a hanging land-cover request cannot delay the existing corroboration result.
- [x] Run and record a production build after the additive land-cover implementation.

## Additive Sentinel-2 Imagery Evidence

- [x] Cancelled at user request; no Sentinel-2 imagery integration, credential, module, retrieval, or test change will be implemented.

## Additive GPPD Power-Plant Reference

- [x] Research and record the authoritative WRI Global Power Plant Database source, schema, license, and India filter used for reference ingestion.
- [x] Add the `gppd_reference` table and radius-friendly nearest-plant lookup for name, fuel type, capacity, latitude, and longitude.
- [x] Add a failure-safe India GPPD loader with successful-reference caching and non-blocking cached fallback, without changing existing Stage 1–3 or FIRMS retrieval behavior.
- [x] Expose the nearest in-radius plant only as an additive `corroboration.run` field and add deterministic match, no-match, and load-failure tests.
- [x] Run and report a direct India-filtered GPPD table count with five stored sample reference rows.

## India-Wide FIRMS Hotspot Snapshot Refresh

- [x] Assess the supported persistent scheduling mechanism and document a 20–30 minute rate-safe refresh design that reuses the existing country-wide FIRMS request.
- [x] Add an additive `india_hotspot_snapshot` database table and migration for the latest FIRMS detection snapshot.
- [x] Rename the physical snapshot table to the exact required `india_hotspot_snapshot` name without losing stored official FIRMS rows, then re-verify refresh and reads.
- [x] Extract a shared country-wide FIRMS retrieval helper from the existing approved request construction without changing the per-coordinate verification flow.
- [x] Implement an immediate-start and scheduled snapshot refresh that atomically replaces rows only after a successful FIRMS retrieval, preserving the prior snapshot on failure.
- [x] Add a read-only `getIndiaHotspots` tRPC query that returns snapshot rows without making a live FIRMS request.
- [x] Add deterministic startup, success, failure-preservation, and repeat-refresh tests; verify stored rows after an authentic refresh.
- [x] Add a cron-authenticated `/api/scheduled/refreshIndiaHotspots` callback and a 20-minute managed schedule after the application is published.
- [x] Keep the official country FIRMS route preferred and use only the approved existing official WFS/Area fallback with an India-wide bounding box when that route fails.
- [x] Normalize country and fallback rows to the same snapshot schema and persist the active official source with the refresh timestamp.
- [x] Disclose the active snapshot source and freshness timestamp in the India map interface without changing Stage 1–3 conclusions.
- [x] Complete authentic fallback snapshot write/read-back and repeat-refresh validation with no synthetic data.
- [x] Inspect the first platform-triggered 20-minute callback execution and confirm it preserves the current snapshot on failure or atomically refreshes it on success.

## Managed Snapshot Refresh Reliability

- [x] Inspect recurring managed callback timeouts and corresponding production runtime logs.
- [x] Correct the identified callback reliability issue without changing the official-country-first snapshot behavior.
- [x] Verify a subsequent platform-triggered refresh succeeds and report the actual cadence and error status.
- [x] Observe a second platform-triggered run of the replacement job and record its scheduled and finished times.
- [x] Compare the stale timeout history with replacement-job logs and confirm whether any post-replacement errors occurred.
- [x] Set an explicit 30-minute managed schedule to keep observed dispatch cadence safely within the requested 20–30 minute rate window.

## Hotspot Marker Verification Wiring

- [x] Connect each stored India hotspot marker selection to the existing per-coordinate corroboration query without duplicating backend logic.
- [x] Render explicit loading, success, withheld, and error states in the selected-hotspot investigation panel.
- [x] Bind real OSM context, FIRMS history and persistence, land-cover evidence, and Stage 1 classification fields to investigation steps 01–04.
- [x] Add deterministic frontend coverage for selected-hotspot verification query input and validate marker-click behavior on desktop and mobile.
- [x] Add an explicit retained-selection error state with retry action to the selected-hotspot investigation rail.
- [x] Add focused interaction coverage for marker selection, verification request initiation, and returned evidence/classification rendering.
- [x] Validate and document a mobile marker tap that triggers the existing verification flow and updates the selected-hotspot rail.
- [x] Add a rendered UI interaction regression covering marker selection, existing request initiation, loading state, and returned evidence/classification presentation.
- [x] Capture actual mobile-width marker activation with corroboration request and completed selected-rail evidence/classification readback.
- [x] Confirm responsive selected-hotspot completion through the 375 px live verifier check, the rendered actual map-marker listener regression, and user confirmation that the repaired preview flow works.
- [x] Trace and fix the frontend state flow so a successful corroboration.run response renders evidence steps 01–04 and the returned classification in the selected-hotspot rail.
- [x] Add a Home-level regression test that proves a successful marker-triggered corroboration.run response transitions the rendered rail to visible completed evidence and classification output.
- [x] Trace the production marker-click response handoff and identify why a successful corroboration.run payload can remain invisible in the selected-hotspot UI.
- [x] Ensure marker selection displays an immediate, persistent in-panel loading indicator before the existing verification request settles.
- [x] Add regression coverage for a delayed successful response so the active marker remains visibly loading and then renders the returned evidence/classification.
- [x] Publish the validated frontend response-rendering and immediate-loading fix to the live FireGuard production site.
