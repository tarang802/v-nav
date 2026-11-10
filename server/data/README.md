# Server data

## `campus-boundary.geojson`

Campus geofence used to decide whether a position may be shared (positions outside it are dropped and never stored).

- Source: OpenStreetMap way [336095563](https://www.openstreetmap.org/way/336095563), "Vellore Institute of Technology - Chennai", retrieved 2026-11-11 through the Overpass API.
- Licence: [ODbL 1.0](https://opendatacommons.org/licenses/odbl/), © OpenStreetMap contributors. The map UI must show this attribution (Phase 5).
- Not edited by hand. To refresh it, re-export the same way and keep the `source`, `license` and `retrieved` properties up to date.

If the official campus boundary differs from OSM, replace the file with surveyed GeoJSON (Polygon or MultiPolygon, `[lng, lat]`) and point `CAMPUS_BOUNDARY_FILE` at it. Do not draw an approximate boundary by hand.
