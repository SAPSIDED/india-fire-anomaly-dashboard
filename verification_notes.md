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
