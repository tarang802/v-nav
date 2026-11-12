import mapboxgl from 'mapbox-gl'
import { locationStore } from '../../../stores/locationStore.js'
import { circlePolygon } from '../../../utils/geo.js'

const SOURCE = 'self-accuracy'
const LAYER = 'self-accuracy-fill'
const EMPTY = { type: 'FeatureCollection', features: [] }

/**
 * Your own position: one DOM marker plus an accuracy circle. Shown from the
 * local GPS fix, so it appears even when an update is not sent to the server.
 */
export function addSelfLayer(map) {
  map.addSource(SOURCE, { type: 'geojson', data: EMPTY })
  map.addLayer({
    id: LAYER,
    type: 'fill',
    source: SOURCE,
    paint: { 'fill-color': '#22d3a1', 'fill-opacity': 0.15, 'fill-outline-color': '#22d3a1' },
  })

  const el = document.createElement('div')
  el.className = 'vnav-self-marker'
  el.setAttribute('aria-label', 'Your location')
  const marker = new mapboxgl.Marker({ element: el })
  let onMap = false

  const draw = (self) => {
    if (!self) {
      if (onMap) marker.remove()
      onMap = false
      map.getSource(SOURCE)?.setData(EMPTY)
      return
    }
    marker.setLngLat([self.lng, self.lat])
    if (!onMap) marker.addTo(map)
    onMap = true
    map.getSource(SOURCE)?.setData(circlePolygon(self.lng, self.lat, self.accuracy))
  }

  draw(locationStore.getState().self)
  const unsubscribe = locationStore.subscribe((s, prev) => {
    if (s.self !== prev.self) draw(s.self)
  })
  return () => {
    unsubscribe()
    marker.remove()
  }
}
