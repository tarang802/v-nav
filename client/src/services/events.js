import { CAMPUS_BOUNDS } from '../constants/map.js'
import { api } from './apiClient.js'

/** A little beyond the campus boundary, so events at the very edge are included. */
const PAD = 0.002
const BBOX = [CAMPUS_BOUNDS[0] - PAD, CAMPUS_BOUNDS[1] - PAD, CAMPUS_BOUNDS[2] + PAD, CAMPUS_BOUNDS[3] + PAD].join(',')

/**
 * Upcoming and ongoing events the signed-in student may see, as GeoJSON for
 * the map layer. The campus is small, so one request covers it; there is no
 * per-viewport fetching.
 */
export function fetchMapEvents() {
  return api(`/events/map?bbox=${BBOX}`)
}
