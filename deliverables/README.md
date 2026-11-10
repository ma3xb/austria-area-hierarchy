# Austria area hierarchy (internal, 2026-11-10)

PLZ -> Macrobrick (114) -> Standardregion (34) -> Bundesland (9), plus a separate **Nanobrick** layer (374 of 378).
No KAM layers. Internal tool only; not official IQVIA boundaries.

## Files

| File | Content |
|---|---|
| `austria-hierarchy.topojson` | One TopoJSON (shared arcs), objects: `postalcodes` (2,274), `plz_parts` (86 parts of 41 split PLZ), `macrobricks` (114), `standardregions` (34), `bundeslaender` (9), `nanobricks` (374). WGS84, quantized 1e6. |
| `AT_PLZ_Brick_Relation.csv` | One row per PLZ x macrobrick: `AREA_SHARE`, `IS_PLZ_FILE_BRICK`, `METHOD`, Veeva address counts, `CONFIDENCE`. A PLZ with several bricks has several rows. `;`-delimited, decimal comma, UTF-8 BOM. |
| `AT_Macrobrick_Keys.csv`, `AT_Nanobrick_Keys.csv` | Key tables (names, parents, counts, area, confidence / `HAS_POLYGON`). |
| `AT_Nano_PLZ_Overlap.csv` | Area overlap nanobrick x PLZ (>=1 % each side). Indicator only: there is no official PLZ -> nanobrick table. |
| `QA.json` | All checks, decisions, risk factors and lists (PLZ without geometry, contradictions, nanobrick gaps ...). |

Rebuild: `build/` scripts (`extract_addr.py`, `build_plz.py`, `make_topojson.py`, `nano_extract.py`, `build_hierarchy.py`, `make_hierarchy_topojson.py`, `write_qa.py`).

## Method in short

1. **PLZ geometry**: OSM `boundary=postal_code` (2,236 Austrian codes) + 38 derived address-based areas (see `build/comparison.md`).
2. **PLZ -> macrobrick**: crosswalk from the PLZ file (`AT_Area_Crosswalk`); Standardregion/Bundesland from the IQVIA hierarchy table.
3. **Split PLZ** (a PLZ in more than one brick): split if Veeva shows >1 brick *or* IQVIA nanobrick geometry puts >=30 % of the PLZ in another macrobrick; parts are cut along IQVIA nanobrick borders. Brick layers are a partition (no overlaps); the relation table and the hatched `plz_parts` layer show the multi-brick PLZ. PLZ whose file brick has <10 % of its area in IQVIA geometry stay whole (file wins) and are listed in `QA.json` -> `split.iqvia_geometry_contradicts_plz_file_kept_whole` (49 PLZ).
4. **Macro/StReg/BL** = dissolve of whole PLZ + split parts. **Nanobricks** = polygons extracted from the vector PDF map and georeferenced (risk factors N1-N6 in `QA.json` -> `nanobrick_layer`).

## Things to know

- Veeva address geocoding (OSM / BEV) was **not** run: only PLZ x brick counts exist in the workbook. IQVIA nanobrick borders were used as the cutting source. Optional follow-up: export `Address_vod__c` (street, no., PLZ, city, brick) for split PLZ to validate the cuts.
- 24 crosswalk PLZ have no polygon (special/large-customer PLZ, e.g. 1000, 4010, 5010 ...): in the table but not on the map.
- 41 geometry codes have no brick: foreign / mis-tagged codes (SI, CH, HU ...) left out on purpose.
- Macrobricks 621 and 908 differ strongly between the PLZ file and IQVIA geometry (union IoU ~5 %): confirm with Esteve/IQVIA.
- Licences: OSM data ODbL (c) OpenStreetMap contributors; IQVIA files (c) IQVIA, not for external redistribution.
