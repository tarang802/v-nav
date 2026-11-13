import mapboxgl from 'mapbox-gl'
import { EVENT_CATEGORY_COLORS } from '../../../constants/map.js'
import { eventTimingLabel } from '../../../utils/geo.js'
import { popupContent } from '../popupContent.js'

const SOURCE = 'events'
const CLUSTERS = 'events-clusters'
const CLUSTER_COUNT = 'events-cluster-count'
const POINTS = 'events-points'
const TITLES = 'events-titles'
const FONT = ['DIN Pro Bold', 'Arial Unicode MS Bold']

const EMPTY = { type: 'FeatureCollection', features: [] }

/** Mapbox `match` expression: category → colour. */
const CATEGORY_COLOR = [
  'match',
  ['get', 'category'],
  ...Object.entries(EVENT_CATEGORY_COLORS).flatMap(([category, color]) => [category, color]),
  EVENT_CATEGORY_COLORS.other,
]

/**
 * Clustered events layer, fed with the GeoJSON from `GET /events/map`
 * (properties: id, title, category, startsAt, endsAt). The server has already
 * applied the visibility rules; this layer only draws what it is given.
 */
export function addEventsLayer(map, initial = EMPTY) {
  map.addSource(SOURCE, { type: 'geojson', data: initial, cluster: true, clusterMaxZoom: 17, clusterRadius: 50 })

  map.addLayer({
    id: CLUSTERS,
    type: 'circle',
    source: SOURCE,
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': '#f97316',
      'circle-radius': ['step', ['get', 'point_count'], 16, 10, 20, 50, 26],
      'circle-stroke-width': 3,
      'circle-stroke-color': '#ffffff',
    },
  })
  map.addLayer({
    id: CLUSTER_COUNT,
    type: 'symbol',
    source: SOURCE,
    filter: ['has', 'point_count'],
    layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 12, 'text-font': FONT, 'text-allow-overlap': true },
    paint: { 'text-color': '#ffffff' },
  })
  map.addLayer({
    id: POINTS,
    type: 'circle',
    source: SOURCE,
    filter: ['!', ['has', 'point_count']],
    paint: { 'circle-color': CATEGORY_COLOR, 'circle-radius': 9, 'circle-stroke-width': 3, 'circle-stroke-color': '#ffffff' },
  })
  map.addLayer({
    id: TITLES,
    type: 'symbol',
    source: SOURCE,
    minzoom: 15.5,
    filter: ['!', ['has', 'point_count']],
    layout: { 'text-field': ['get', 'title'], 'text-size': 11, 'text-font': FONT, 'text-offset': [0, 1.2], 'text-anchor': 'top', 'text-optional': true, 'text-max-width': 9 },
    paint: { 'text-color': '#1e293b', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
  })

  const onPointClick = (e) => {
    const f = e.features[0]
    const when = f.properties.startsAt ? new Date(f.properties.startsAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : null
    const timing = eventTimingLabel(f.properties.startsAt, f.properties.endsAt)
    const lines = [timing, when, f.properties.category].filter(Boolean)
    new mapboxgl.Popup({ closeButton: false, offset: 14 })
      .setLngLat(f.geometry.coordinates)
      .setDOMContent(popupContent(f.properties.title, lines))
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

  return {
    setData: (collection) => map.getSource(SOURCE)?.setData(collection ?? EMPTY),
    remove: () => {
      map.off('click', POINTS, onPointClick)
      map.off('click', CLUSTERS, onClusterClick)
    },
  }
}
