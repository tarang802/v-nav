import { CAMPUS_VIEW } from '../../constants/map.js'

/**
 * Handle to the one map instance, for code outside the map component (panels,
 * controls). Empty until the map has loaded; every method is a safe no-op then.
 */
let map = null
let events = null
/** Latest events GeoJSON; kept so it can be applied when the map finishes loading. */
let eventData = null

/** People who ask their system for reduced motion get an instant jump instead of a flying camera. */
const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true

function moveCamera(options) {
  if (!map) return
  if (prefersReducedMotion()) map.jumpTo(options)
  else map.flyTo({ ...options, essential: true })
}

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
    moveCamera({ center: [lng, lat], zoom })
  },
  resetView() {
    moveCamera({ ...CAMPUS_VIEW })
  },
  /** GeoJSON FeatureCollection from `GET /events/map`, or null to clear. */
  setEventCollection(collection) {
    eventData = collection
    events?.setData(collection)
  },
}
