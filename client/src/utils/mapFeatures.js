import { DEFAULT_BUILDING_HEIGHT, METERS_PER_LEVEL } from '../constants/map.js'

/** Height used for drawing: OSM height, else OSM levels × 3.2 m, else a small default. */
export function renderHeight(props) {
  if (props.height) return props.height
  if (props.levels) return props.levels * METERS_PER_LEVEL
  return DEFAULT_BUILDING_HEIGHT
}

/**
 * Converts events from the API (`location` is a GeoJSON Point, see
 * docs/DATABASE_SCHEMA.md §2.8) into features for the events layer. Events
 * without a valid position are skipped.
 */
export function eventFeatures(events) {
  const features = []
  for (const e of events ?? []) {
    const c = e?.location?.coordinates
    if (!Array.isArray(c) || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) continue
    features.push({
      type: 'Feature',
      properties: { eventId: e.id, title: e.title ?? 'Event', startsAt: e.startsAt ?? null },
      geometry: { type: 'Point', coordinates: [c[0], c[1]] },
    })
  }
  return { type: 'FeatureCollection', features }
}
