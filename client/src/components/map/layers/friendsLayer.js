import mapboxgl from 'mapbox-gl'
import { friendFeatures, locationStore } from '../../../stores/locationStore.js'
import { agoLabel } from '../../../utils/geo.js'
import { popupContent } from '../popupContent.js'

const SOURCE = 'friends'
const CLUSTERS = 'friends-clusters'
const CLUSTER_COUNT = 'friends-cluster-count'
const POINTS = 'friends-points'
const INITIALS = 'friends-initials'
const NAMES = 'friends-names'

const FONT = ['DIN Pro Bold', 'Arial Unicode MS Bold']
const STALE_CHECK_MS = 10_000

/**
 * Friends who are sharing, as one GeoJSON source (not a DOM node per friend).
 * The layer subscribes to the location store outside React and redraws at most
 * once per animation frame, however many updates arrive. Friends standing
 * close together merge into a count bubble when zoomed out.
 */
export function addFriendsLayer(map) {
  map.addSource(SOURCE, {
    type: 'geojson',
    data: friendFeatures(locationStore.getState()),
    cluster: true,
    clusterMaxZoom: 17,
    clusterRadius: 44,
  })

  map.addLayer({
    id: CLUSTERS,
    type: 'circle',
    source: SOURCE,
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': '#2b42ed',
      'circle-radius': ['step', ['get', 'point_count'], 18, 10, 22, 50, 28],
      'circle-stroke-width': 3,
      'circle-stroke-color': '#ffffff',
    },
  })
  map.addLayer({
    id: CLUSTER_COUNT,
    type: 'symbol',
    source: SOURCE,
    filter: ['has', 'point_count'],
    layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 13, 'text-font': FONT, 'text-allow-overlap': true },
    paint: { 'text-color': '#ffffff' },
  })
  map.addLayer({
    id: POINTS,
    type: 'circle',
    source: SOURCE,
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-color': ['case', ['get', 'stale'], '#94a3b8', '#4361f8'],
      'circle-radius': 16,
      'circle-stroke-width': 3,
      'circle-stroke-color': '#ffffff',
      'circle-opacity': ['case', ['get', 'stale'], 0.7, 1],
    },
  })
  map.addLayer({
    id: INITIALS,
    type: 'symbol',
    source: SOURCE,
    filter: ['!', ['has', 'point_count']],
    layout: { 'text-field': ['get', 'initials'], 'text-size': 12, 'text-font': FONT, 'text-allow-overlap': true },
    paint: { 'text-color': '#ffffff' },
  })
  map.addLayer({
    id: NAMES,
    type: 'symbol',
    source: SOURCE,
    minzoom: 16,
    filter: ['!', ['has', 'point_count']],
    layout: { 'text-field': ['get', 'name'], 'text-size': 11, 'text-font': FONT, 'text-offset': [0, 2], 'text-anchor': 'top', 'text-optional': true },
    paint: { 'text-color': '#0f172a', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
  })

  // ── Store → map, batched per animation frame ──
  let frame = null
  const flush = () => {
    frame = null
    map.getSource(SOURCE)?.setData(friendFeatures(locationStore.getState()))
  }
  const schedule = () => {
    if (frame === null) frame = requestAnimationFrame(flush)
  }
  const unsubscribe = locationStore.subscribe((s, prev) => {
    if (s.locations !== prev.locations || s.directory !== prev.directory) schedule()
  })
  // Markers age even when no update arrives: dim after 60 s, drop after 120 s.
  const staleTimer = setInterval(() => {
    locationStore.getState().pruneExpired()
    schedule()
  }, STALE_CHECK_MS)

  // ── Interaction ──
  const pointer = () => (map.getCanvas().style.cursor = 'pointer')
  const noPointer = () => (map.getCanvas().style.cursor = '')
  const onPointClick = (e) => {
    const f = e.features[0]
    const p = f.properties
    new mapboxgl.Popup({ closeButton: false, offset: 20 })
      .setLngLat(f.geometry.coordinates)
      .setDOMContent(popupContent(p.name, [`Updated ${agoLabel(p.ts)}`, `Accurate to about ${Math.round(p.accuracy)} m`]))
      .addTo(map)
  }
  const onClusterClick = (e) => {
    const f = e.features[0]
    map.getSource(SOURCE).getClusterExpansionZoom(f.properties.cluster_id, (err, zoom) => {
      if (!err) map.easeTo({ center: f.geometry.coordinates, zoom: zoom + 0.5 })
    })
  }
  map.on('click', POINTS, onPointClick)
  map.on('click', CLUSTERS, onClusterClick)
  for (const layer of [POINTS, CLUSTERS]) {
    map.on('mouseenter', layer, pointer)
    map.on('mouseleave', layer, noPointer)
  }

  return () => {
    unsubscribe()
    clearInterval(staleTimer)
    if (frame !== null) cancelAnimationFrame(frame)
  }
}
