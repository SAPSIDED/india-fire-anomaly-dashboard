# Global Power Plant Database Reference Source

The additive power-plant reference layer will use the World Resources Institute (WRI) Global Power Plant Database (GPPD), version 1.3.0. WRI describes GPPD as a comprehensive global open database of power plants; the catalogue lists version 1.3.0 as a downloadable data file and the WRI repository states that the CSV is released under CC BY 4.0. The upstream repository is archived/not currently maintained, so this system will record the source URL and load timestamp and will not claim real-time plant coverage.

For the India-only reference table, the loader will accept rows whose `country` is `IND` and retain only name, primary fuel, capacity in MW, latitude, longitude, a stable GPPD identifier, and source provenance. The lookup will be a reference-context result, not a fire or industrial-incident conclusion.

## Sources

1. [WRI Data Explorer — Global Power Plant Database](https://datasets.wri.org/datasets/global-power-plant-database)
2. [WRI Global Power Plant Database repository](https://github.com/wri/global-power-plant-database)
3. [CC BY 4.0 License](https://creativecommons.org/licenses/by/4.0/)
