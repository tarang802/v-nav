import { CAMPUS_VIEW } from '../../constants/map.js'

/**
 * Handle to the one map instance, for code outside the map component (panels,
 * controls). Empty until the map has loaded; every method is a safe no-op then.
 */
let map = null
let events = null
/** Latest events GeoJSON; kept so it can be applied when the map finishes loading. */
let eventData = null

export const mapController = {
  attach(instance, layers) {
    map = instance
    events = layers?.events ?? null
    if (eventData) events?.setData(eventData)
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
  /** GeoJSON FeatureCollection from `GET /events/map`, or null to clear. */
  setEventCollection(collection) {
    eventData = collection
    events?.setData(collection)
  },
}
