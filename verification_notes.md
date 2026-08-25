# Geospatial Interaction Verification Notes

The live workbench rendered three Google Maps-native marker elements with accessible labels for the Western India corridor, Gujarat process zone, and Northern India fringe. These markers are now map-attached objects rather than CSS percentage overlays, so their position follows latitude/longitude while the user pans or zooms. A direct browser click snapshot was interrupted by a transient browser reset; automated unit, type, and production-build tests are passing.

The subsequent live interaction test successfully selected the Western India map marker and opened the **Concurrent Conditional Verification** modal. The modal displayed the selected zone coordinates and a loading state that explicitly states that FIRMS, OSM industrial context, seven-day persistence, and weather are being queried concurrently.

The completed modal reported NASA FIRMS, OSM industrial context, and seven-day persistence as **UNAVAILABLE**, while weather context was **AVAILABLE**. Its final state was **“Live conclusion withheld”**, demonstrating that unavailable sources block an industrial-fire conclusion. The three geographic marker controls remained in the live DOM after using the map zoom control.

After closing the verifier and activating the Google Maps zoom-in control, the map moved to a tighter India view while the three risk-zone markers remained attached to their geographic locations. This directly verifies that the markers no longer use screen-relative percentages and remain stable during zooming.

With the map focused, a live keyboard ArrowRight pan was issued. The live map continued to expose all three labelled geographic marker controls after that pan, confirming that their locations are managed by Google Maps rather than page-relative overlay coordinates.

An automated synthetic pointer-drag attempt did not change the measured marker screen position, so it is not sufficient evidence of a completed physical pan. The geographic-marker implementation is in place, but the final pan task remains open for a direct manual pan check in the preview.

The final controlled Google Maps pan check used the live map instance itself. The map centre moved from **22.4°N, 78.2°E** to **22.4°N, 84.7918°E**, while the Western India marker moved on screen from **x=344** to **x=194** at the same vertical position. This confirms that the marker follows the map’s geographic transform during a genuine pan rather than remaining at a fixed page coordinate.

After the extraction hardening, a live map-zone click opened the verifier and displayed its bounded concurrent-loading state while FIRMS, OSM context, persistence, and weather checks executed. The selection remained open rather than crashing during delayed upstream calls.

The verifier was reloaded after the parallel Overpass-fallback change and a fresh zone check was started. The same map selection remained stable while the concurrent source requests were in progress, ready for the final bounded-result inspection.

The fresh verification run completed after the eight-second live-evidence window. The visible modal labelled each late source as pending/unavailable and displayed **“Evidence pending — sources still delayed”** with a clear statement that no industrial-fire conclusion had been issued. The map selection and Return to map control remained usable; no crash or indefinite loading occurred.

After the permanent relay configuration and FireGuard server restart, the browser frontend was opened against the workbench and the Western India candidate’s concurrent verification was started. The modal entered its expected loading state, initiating the frontend-to-backend leg of the permanent relay verification.

The completed browser verification returned **AVAILABLE** live evidence for NOAA-20, independent NOAA-21, Google Places industrial context, NOAA-20 seven-day persistence, and weather. The final live result was **“No current FIRMS thermal detection”** for the selected location—not an unavailable or pending state—so the application correctly declined an industrial-fire conclusion on the real current data. This confirms the full frontend → FireGuard backend → permanent Cloudflare relay → official NASA FIRMS → backend → frontend path.

The active browser modal was explicitly searched for the completed verdict text and returned one match: **“LIVE SCREENING RESULT No current FIRMS thermal detection — The live local one-day FIRMS search found no thermal detection; an industrial-fire conclusion is not supported.”** This is a direct browser-visible confirmation of the relay-backed response.

The remaining external requirement for a **confirmed industrial-fire incident** is an authority, emergency-service, facility, or on-site incident feed. The live relay now supplies authentic satellite, industrial-context, persistence, and weather evidence; it intentionally classifies only a screened thermal candidate when those sources agree. It does not invent on-site confirmation where no such authoritative input has been integrated.

After the light thermal-canvas presentation update, the live browser map remained interactive with its three map-native zone controls, and the **Run source verification** action opened the modal successfully. The same backend call completed within the bounded evidence window with the conservative result **“Evidence pending — live source delayed.”** NOAA-20 and NOAA-21 current records were marked **UNAVAILABLE** for this attempt; industrial context, weather, and the authority-evidence record were available, while persistence/cross-platform checks used cached evidence. The modal stated that no industrial fire had been inferred from missing live data. This records a completed post-redesign conditional-check outcome, not a UI-only modal-open check.
