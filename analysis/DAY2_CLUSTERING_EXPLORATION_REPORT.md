# Day 2 — FireDash ML Controlled Rebuild
## Clustering exploration for mining and agricultural-burning candidates

**Date:** 2026-09-20  
**Scope:** Read-only unsupervised analysis of the Day 1 feature artifact  
**Model status:** No model was trained, modified, or deployed. `classification.ts`, `corroboration.ts`, the database schema, the existing two-class fallback, and the existing four-class artifact were not changed.

## Executive conclusion

The current features do **not** provide a reliable unsupervised path to expand either class.

The 16 mining examples are concentrated mainly in one cluster, but that cluster is mixed with industrial, wildfire, agricultural, and unlabeled rows. It produces 47 non-mining/non-agricultural candidate rows, yet only **5** of those candidates have an explicit typed OSM mining category. Three of those five are already labeled wildfire, one is unlabeled, and one is part of the same nearby mining group. The remaining candidates have only geometric similarity or weak facility proximity and should not be promoted automatically.

The 61 agricultural-burning examples are scattered across **7 of the 8** primary clusters. Their largest cluster contains only 21 of 61 examples, or **34.4%**. The shared clusters are dominated by unlabeled and industrial rows. Of 1,419 non-mining/non-agricultural rows in those clusters, only **one** has cropland point land cover, and its seasonal calendar prior is not positive. Therefore, clustering found **zero strongly supportable new agricultural-burning candidates**.

The direct recommendation is to **abandon automatic four-class expansion from clustering**. Continue with the validated two-class model for production, and only revisit four classes after obtaining independent mining and agricultural-burning evidence. A manually reviewed mining queue may be worthwhile for the five typed-OSM candidates, but it is not enough to justify retraining. There is no comparable agricultural queue from this analysis.

## Method

The analysis used all **1,503 coordinate rows** in `server/data/agricultural_feature_foundation.json`.

The feature matrix contained FRP in megawatts, nearest GPPD distance, nearest OSM-facility distance, point land-cover class, and calendar prior where available. GPPD and OSM distances were log-transformed because their ranges are strongly right-skewed. Numeric missing values were median-imputed with missingness indicators. Point land-cover class was one-hot encoded. No labels were used to fit the clusters; labels were used only afterward to inspect cluster composition.

The primary analysis used **K-means with k=8, 50 initializations, and random seed 42**. Sensitivity checks used k values of 4, 6, 8, and 10. The full coordinate-level candidate and evidence output is in [the JSON candidate report](./day2_cluster_candidates.json).

## Cluster quality and composition

| k | Silhouette score | Interpretation |
|---:|---:|---|
| 4 | 0.4774 | Moderate geometric compactness, but large mixed clusters |
| 6 | 0.4754 | Similar result; mining remains mixed with other labels |
| 8 | 0.3869 | Primary analysis; more detailed but weaker separation |
| 10 | 0.3808 | Further splitting does not improve class separation |

The silhouette score measures geometric compactness, not class correctness. The moderate scores at k=4 and k=6 are driven largely by distance and categorical partitions; they do not demonstrate that the heuristic labels are naturally separable.

### Primary k=8 cluster sizes and labels

| Cluster | Size | Mining | Agricultural | Industrial | Wildfire | Unlabeled |
|---:|---:|---:|---:|---:|---:|---:|
| 0 | 208 | 0 | 16 | 16 | 30 | 146 |
| 1 | 634 | 0 | 5 | 222 | 4 | 403 |
| 2 | 38 | 13 | 2 | 11 | 4 | 8 |
| 3 | 124 | 0 | 6 | 20 | 7 | 91 |
| 4 | 51 | 0 | 6 | 1 | 1 | 43 |
| 5 | 416 | 0 | 21 | 0 | 11 | 384 |
| 6 | 9 | 2 | 0 | 3 | 1 | 3 |
| 7 | 23 | 1 | 5 | 4 | 6 | 7 |

## Mining analysis

The 16 mining examples occupy clusters 2, 6, and 7. Thirteen of 16 are in cluster 2, giving a dominant-cluster share of **81.25%**. However, cluster 2 is not mining-specific: it also contains 11 industrial rows, 4 wildfire rows, 2 agricultural rows, and 8 unlabeled rows.

The union of mining-seed clusters contains **47** other rows after excluding existing mining and agricultural labels. Their evidence quality is:

| Candidate group | Count | Meaning |
|---|---:|---|
| Any explicit support in the available evidence | 15 | Mostly GPPD proximity or typed mining tags; not sufficient by itself for a mining label |
| Explicit typed OSM mining category | **5** | Strongest review queue from this analysis |
| No explicit support | 32 | Cluster resemblance only; not suitable for automatic promotion |

The five typed-OSM mining candidates are:

| Latitude | Longitude | Existing label | Land cover | FRP MW | OSM distance |
|---:|---:|---|---|---:|---:|
| 18.72052 | 79.50629 | wildfire | forest_vegetation | 2.08 | 2,874.6 m |
| 27.71907 | 75.52586 | wildfire | grassland_rangeland | 3.77 | 4,086.3 m |
| 17.95855 | 80.79545 | wildfire | grassland_rangeland | 1.68 | 2,423.6 m |
| 17.95685 | 80.79299 | unlabeled | unavailable | 1.46 | 2,147.8 m |
| 17.95674 | 80.79336 | wildfire | grassland_rangeland | 2.41 | 2,147.8 m |

These are **review candidates**, not labels. The first, third, and fifth are already labeled wildfire by the existing heuristic pipeline, so the evidence is conflicting rather than cleanly additive. The fourth is unlabeled and may be worth manual inspection. Their OSM distances are also beyond the 2 km lookup radius used for the strict facility-reference match, so a human should confirm the actual OSM feature and its relationship to the hotspot before use.

## Agricultural-burning analysis

The 61 agricultural-burning examples occupy clusters 0, 1, 2, 3, 4, 5, and 7. The largest group is cluster 5 with only **21 examples**. The examples are therefore scattered across nearly the whole partition rather than forming a compact agricultural-burning region.

The union of those seven clusters contains **1,419** other rows. Their evidence quality is:

| Candidate group | Count | Meaning |
|---|---:|---|
| Point land cover is cropland | **1** | Weak contextual support only |
| Positive seasonal calendar prior | **0** | No calendar support in the current latest-date rows |
| Cropland plus positive calendar prior | **0** | No strongly supportable agricultural candidate |
| No explicit support | 1,418 | Cluster resemblance only |

The one cropland candidate is at **30.35007, 73.52268**. It is currently labeled `industrial_facility`, has FRP **7.46 MW**, is **78.1833 km** from the nearest GPPD plant, and has a nearby OSM `power_plant` category at **3,311.4 m**. Its calendar prior is not positive. This is not a credible agricultural-burning candidate without independent event evidence.

## Feature contribution check

A small ablation check repeated k=8 clustering with feature groups removed or isolated. The results should be interpreted cautiously because the calendar and land-cover-only matrices have very few effective patterns.

| Feature set | Silhouette | Interpretation |
|---|---:|---|
| All requested features | 0.3869 | Mixed class structure |
| FRP only | 0.6310 | Mostly thermal-intensity partitioning, not class separation |
| GPPD/OSM distances only | 0.6553 | Mostly facility-distance partitioning, not mining-vs-industrial separation |
| Calendar prior only | 1.0000 | Degenerate partition caused by near-constant/missing prior; not meaningful |
| Point land cover only | 1.0000 | Degenerate categorical partition; not evidence of class separability |

FRP and facility distances contribute most to the numerical geometry. They do not separate the target classes reliably because the same FRP and distance ranges occur across mining, wildfire, industrial, and agricultural rows. Point land cover and calendar prior are currently too sparse or degenerate to rescue the separation.

## Honest feasibility assessment

Mining shows a **partial but not trustworthy** cluster concentration. The primary mining cluster contains 13 of 16 seed rows, but its purity is only 13 of 38 because it also contains industrial, wildfire, agricultural, and unlabeled rows. Clustering therefore finds a small manual review queue, not a defensible source of new labels.

Agricultural-burning does **not** show natural separation. The heuristic examples are distributed across seven clusters and overlap heavily with industrial, wildfire, and unlabeled rows. The one cropland candidate found in the shared clusters has industrial context and no positive seasonal prior. It should not be treated as agricultural burning.

The results are consistent with the Day 1 label-quality warning: the current agricultural class is a cropland-only heuristic, and the current mining class is an OSM-context label. Neither is independently verified as the actual cause of the thermal anomaly.

## Recommendation for Day 3

Do **not** retrain the four-class model from these clustering results. Do **not** add any of the 47 mining-similarity rows or 1,419 agricultural-similarity rows to the training set automatically.

A narrow manual review of the five typed-OSM mining candidates is reasonable if the project can verify the actual OSM feature, distance, facility type, and whether the thermal observation is plausibly associated with it. Even if all five are confirmed, mining remains too small for a balanced four-class retrain.

For agricultural burning, obtain independent evidence first. Useful evidence would include a seasonal crop-residue signal tied to the same coordinate and date, repeated observations during the known Punjab/Haryana burning season, or an authoritative incident/source record. Point cropland alone is insufficient.

For production, the validated **two-class model remains the safer model path**. A future multi-class experiment should be considered only after independent mining and agricultural examples exist and the temporal and land-cover features have meaningful variation.

## Files and protected scope

The analysis created only these read-only deliverables:

- `analysis/DAY2_CLUSTERING_EXPLORATION_REPORT.md`
- `analysis/day2_cluster_candidates.json`

No production source file, classifier, model artifact, database schema, scheduler, or deployment behavior was changed. The temporary scripts used for the analysis were stored outside the repository under `/tmp` and are not project deliverables.

## References

[1]: https://firms.modaps.eosdis.nasa.gov/ "NASA FIRMS official fire information for resource management"
[2]: https://scikit-learn.org/stable/modules/clustering.html "scikit-learn clustering documentation"
