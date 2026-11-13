import { DEFAULT_BUILDING_HEIGHT, METERS_PER_LEVEL } from '../constants/map.js'

/** Height used for drawing: OSM height, else OSM levels × 3.2 m, else a small default. */
export function renderHeight(props) {
  if (props.height) return props.height
  if (props.levels) return props.levels * METERS_PER_LEVEL
  return DEFAULT_BUILDING_HEIGHT
}

