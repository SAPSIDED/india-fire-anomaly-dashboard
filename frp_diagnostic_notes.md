# FRP Unit and Provenance Diagnostic Notes

NASA Earthdata’s **Active Fire Data Attributes for MODIS and VIIRS** documentation states that the FRP attribute for both NRT MODIS and NRT VIIRS records depicts pixel-integrated fire radiative power in **megawatts (MW)**. Source: https://www.earthdata.nasa.gov/data/tools/firms/active-fire-data-attributes-modis-viirs

The same documentation identifies `DayNight` as `D` for day and `N` for night for both products. It also describes material sensor/algorithm differences: MODIS fire pixels are approximately 1 km, whereas VIIRS active-fire pixels are nominally 375 m; VIIRS FRP retrieval is subject to sensor-specific hybrid 375/750 m processing and retrieval limits. Equal FRP units therefore do not by themselves make unscreened mixed-sensor variance directly comparable.

Current database diagnostic finding, 2026-08-28: `detectionHistory` contains 228 rows dated 2026-08-19 through 2026-08-27, but zero non-null `frp` and zero valid `dayNight` values. The storage schema does not include a sensor/platform or source-version column, so existing rows cannot be audited to identify or normalize MODIS/VIIRS mixing. No data or code was changed as part of this diagnostic.
