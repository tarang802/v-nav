import mapboxgl from 'mapbox-gl'
import { BUILDINGS_URL, OSM_ATTRIBUTION } from '../../../constants/map.js'
import { kindLabel, renderHeight } from '../../../utils/mapFeatures.js'
import { popupContent } from '../popupContent.js'

const SOURCE = 'campus-buildings'
const EXTRUSION = 'campus-buildings-3d'
const LABELS = 'campus-buildings-labels'

/**
 * Campus buildings from OpenStreetMap: 3D extrusions, name labels, hover
 * highlight and a click popup. Buildings that are not in OSM are not drawn.
 */
export async function addBuildingsLayer(map) {
  const res = await fetch(BUILDINGS_URL)
  if (!res.ok) throw new Error(`Could not load campus buildings (${res.status})`)
  const data = await res.json()
  for (const f of data.features) f.properties.renderHeight = renderHeight(f.properties)
  if (!map.getStyle()) return () => {} // map was removed while loading

  map.addSource(SOURCE, { type: 'geojson', data, attribution: OSM_ATTRIBUTION })
  map.addLayer({
    id: EXTRUSION,
    type: 'fill-extrusion',
    source: SOURCE,
    paint: {
      'fill-extrusion-color': ['case', ['boolean', ['feature-state', 'hover'], false], '#4361f8', '#c7d2fe'],
      'fill-extrusion-height': ['get', 'renderHeight'],
      'fill-extrusion-opacity': 0.85,
    },
  })
  map.addLayer({
    id: LABELS,
    type: 'symbol',
    source: SOURCE,
    minzoom: 15.5,
    filter: ['has', 'name'],
    layout: {
      'text-field': ['get', 'name'],
      'text-size': 11,
      'text-max-width': 8,
      'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
    },
    paint: { 'text-color': '#1e1b4b', 'text-halo-color': '#ffffff', 'text-halo-width': 1.4 },
  })

  let hovered = null
  const setHover = (id) => {
    if (hovered !== null) map.setFeatureState({ source: SOURCE, id: hovered }, { hover: false })
    hovered = id
    if (id !== null) map.setFeatureState({ source: SOURCE, id }, { hover: true })
  }
  const onMove = (e) => {
    map.getCanvas().style.cursor = 'pointer'
    setHover(e.features[0].id)
  }
  const onLeave = () => {
    map.getCanvas().style.cursor = ''
    setHover(null)
  }
  const onClick = (e) => {
    const p = e.features[0].properties
    const levels = p.levels ? `${p.levels} ${p.levels === 1 ? 'level' : 'levels'}` : null
    const lines = [kindLabel(p.kind), levels].filter(Boolean)
    new mapboxgl.Popup({ closeButton: false, offset: 8 })
      .setLngLat(e.lngLat)
      .setDOMContent(popupContent(p.name || 'Unnamed building', lines))
      .addTo(map)
  }
  map.on('mousemove', EXTRUSION, onMove)
  map.on('mouseleave', EXTRUSION, onLeave)
  map.on('click', EXTRUSION, onClick)

  return () => {
    map.off('mousemove', EXTRUSION, onMove)
    map.off('mouseleave', EXTRUSION, onLeave)
    map.off('click', EXTRUSION, onClick)
  }
}
