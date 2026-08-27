# VNF Flare Lookup Scope

The VNF publisher’s current portal provides nightly CSV and KMZ downloads, but it states that VNF data is subject to a VIIRS Nightfire Data Use License effective 10 January 2025. The portal exposes dated download files rather than a documented public point-query API. Downloading or scanning global/nightly catalogs for every corroboration request would therefore be both inefficient and inconsistent with the requested bounded lookup design.

The implemented path will use a clean bounded-candidate adapter that accepts only the queried coordinate and radius. In the absence of an approved licensed VNF endpoint or maintained local spatial index, it returns an explicit unavailable/empty candidate result without delaying or changing the existing corroboration workflow. Deterministic local candidate fixtures cover flare, mining, and no-match decisions; no fixture is represented as live VNF evidence.

## Source

- [Earth Observation Group, VIIRS Nightfire portal](https://eogdata.mines.edu/products/vnf/)

## Official V4.0 listing inspection

The user-supplied EOG V4.0 listing at `https://eogdata.mines.edu/pages/download_viirs_fire_iframe_ncor_v40.html` was inspected on 27 August 2026. It reports a last update of 30 April 2026 and expands dated **NPP CSV** and KMZ entries. The latest listed CSV examples are actual provider links such as `https://eogdata.mines.edu/wwwdata/viirs_products/vnf/v40//VNF_npp_d20260427_eog_v40.csv`; no URL pattern was inferred. Opening the exposed CSV redirected to the EOG account sign-in service, so this account-gated source remains an optional disabled adapter rather than a tracker dependency.

## NASA FIRMS gas-flare reference direction

NASA FIRMS publicly documents a **Gas Flares** map layer containing more than 145,640 inventoried flare locations for 2012–2023, with an identifier, type, inventory year, size/volume, and coordinates. FIRMS states that the layer provides reference context for thermal detections that may not be vegetation fires and should be used with caution. Its stated upstream source is the World Bank in partnership with NOAA and the Colorado School of Mines. The documented FIRMS `area` service provides active-fire hotspot CSV retrieval, but is not documented as a gas-flare classification service. A compliant conservative path may therefore use nearby FIRMS gas-flare inventory context with the existing fixed-location persistence and typed facility evidence; it must not represent a thermal detection alone as proof of gas flaring.

The public FIRMS Global Fire Map and its Layers panel were also inspected. The map identifies active detections as thermal anomalies with limited accuracy and says they may arise from fire, hot smoke, agriculture, or other sources. The standard visible Layers panel did not document a separate public request endpoint for extracting the Gas Flares layer. Implementation will therefore use only a discoverable official data service or a documented public reference file, rather than reverse-engineering the map client.
