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
