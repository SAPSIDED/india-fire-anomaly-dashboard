# VNF Flare Lookup Scope

The VNF publisher’s current portal provides nightly CSV and KMZ downloads, but it states that VNF data is subject to a VIIRS Nightfire Data Use License effective 10 January 2025. The portal exposes dated download files rather than a documented public point-query API. Downloading or scanning global/nightly catalogs for every corroboration request would therefore be both inefficient and inconsistent with the requested bounded lookup design.

The implemented path will use a clean bounded-candidate adapter that accepts only the queried coordinate and radius. In the absence of an approved licensed VNF endpoint or maintained local spatial index, it returns an explicit unavailable/empty candidate result without delaying or changing the existing corroboration workflow. Deterministic local candidate fixtures cover flare, mining, and no-match decisions; no fixture is represented as live VNF evidence.

## Source

- [Earth Observation Group, VIIRS Nightfire portal](https://eogdata.mines.edu/products/vnf/)
