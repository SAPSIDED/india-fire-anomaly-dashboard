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
