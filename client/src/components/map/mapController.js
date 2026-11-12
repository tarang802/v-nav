import { CAMPUS_VIEW } from '../../constants/map.js'

/**
 * Handle to the one map instance, for code outside the map component (panels,
 * controls). Empty until the map has loaded; every method is a safe no-op then.
 */
let map = null
let events = null

export const mapController = {
  attach(instance, layers) {
    map = instance
    events = layers?.events ?? null
  },
  detach() {
    map = null
    events = null
  },
  flyTo({ lng, lat }, zoom = 18) {
    map?.flyTo({ center: [lng, lat], zoom, essential: true })
  },
  resetView() {
    map?.flyTo({ ...CAMPUS_VIEW, essential: true })
  },
  /** Phase 6 feeds the events layer through this. */
  setEvents(list) {
    events?.setEvents(list)
  },
}
