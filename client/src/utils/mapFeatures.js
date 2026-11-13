import { DEFAULT_BUILDING_HEIGHT, METERS_PER_LEVEL } from '../constants/map.js'

/** OSM building type → readable text: "dormitory" → "Dormitory", "sports_hall" → "Sports hall". */
export function kindLabel(kind) {
  if (typeof kind !== 'string' || kind.trim() === '') return null
  const text = kind.trim().replace(/_/g, ' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Height used for drawing: OSM height, else OSM levels × 3.2 m, else a small default. */
export function renderHeight(props) {
  if (props.height) return props.height
  if (props.levels) return props.levels * METERS_PER_LEVEL
  return DEFAULT_BUILDING_HEIGHT
}

