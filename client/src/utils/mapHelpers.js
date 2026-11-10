/**
 * mapHelpers.js — Utility functions and constants for V-Nav map
 * VIT Chennai campus map helpers
 */
import mapboxgl from 'mapbox-gl'


// ── Campus Constants ─────────────────────────────────────────
export const CAMPUS = {
  center: [80.1534, 12.8406], // VIT Chennai [lng, lat]
  zoom: 17,
  pitch: 60,
  bearing: -17,
  minZoom: 13,
  maxZoom: 22,
  // Slightly wider bounds so map feels free but stays on campus
  bounds: [
    [80.10, 12.80], // SW corner
    [80.21, 12.89], // NE corner
  ],
}

// ── Marker Element Factories ─────────────────────────────────
/** Blue pulsing dot — current user */
export function createSelfMarkerEl() {
  const el = document.createElement('div')
  el.className = 'marker-self'
  el.style.cssText = `
    width: 18px; height: 18px; border-radius: 50%;
    background: #4361f8; border: 3px solid rgba(255,255,255,0.9);
    box-shadow: 0 2px 12px rgba(67,97,248,0.8);
    cursor: default; position: relative; z-index: 10;
  `
  return el
}

/** Green pulsing dot — online friend */
export function createFriendMarkerEl(name) {
  const el = document.createElement('div')
  el.className = 'marker-friend'
  el.title = name
  el.style.cssText = `
    width: 16px; height: 16px; border-radius: 50%;
    background: #22d3a1; border: 2.5px solid rgba(255,255,255,0.9);
    box-shadow: 0 2px 10px rgba(34,211,161,0.7);
    cursor: pointer;
  `
  return el
}

/** Orange rotated diamond — event */
export function createEventMarkerEl() {
  const el = document.createElement('div')
  el.style.cssText = `
    width: 14px; height: 14px; border-radius: 4px;
    background: #f97316; border: 2.5px solid rgba(255,255,255,0.9);
    box-shadow: 0 2px 10px rgba(249,115,22,0.7);
    cursor: pointer; transform: rotate(45deg);
  `
  return el
}

// ── GeoJSON Accuracy Circle ───────────────────────────────────
/**
 * Returns a GeoJSON Polygon approximating a circle of radiusMeters
 * around [lng, lat]. Used to render the location accuracy ring.
 */
export function createAccuracyCircle(lng, lat, radiusMeters, steps = 64) {
  const km = radiusMeters / 1000
  const distX = km / (111.32 * Math.cos((lat * Math.PI) / 180))
  const distY = km / 110.574
  const coords = []

  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * 2 * Math.PI
    coords.push([
      lng + distX * Math.cos(angle),
      lat + distY * Math.sin(angle),
    ])
  }

  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [coords] },
  }
}

// ── Camera Helpers ───────────────────────────────────────────
/** Smooth camera flight to any position */
export function flyTo(map, lng, lat, opts = {}) {
  map.flyTo({
    center: [lng, lat],
    zoom: opts.zoom ?? 18,
    pitch: opts.pitch ?? 60,
    bearing: opts.bearing ?? -17,
    duration: opts.duration ?? 1400,
    essential: true,
  })
}

/** Reset camera to campus default view */
export function resetCampusView(map) {
  map.flyTo({
    center: CAMPUS.center,
    zoom: CAMPUS.zoom,
    pitch: CAMPUS.pitch,
    bearing: CAMPUS.bearing,
    duration: 1200,
    essential: true,
  })
}

// ── 3D Building Layer ─────────────────────────────────────────
/**
 * Adds 3D building extrusion layer with hover highlight support.
 * Uses Mapbox's composite 'building' source layer.
 * Future: replace source with custom MongoDB-backed GeoJSON.
 */
export function add3DBuildings(map) {
  if (map.getLayer('3d-buildings')) return

  const layers = map.getStyle()?.layers ?? []
  let labelLayerId
  for (const layer of layers) {
    if (layer.type === 'symbol' && layer.layout?.['text-field']) {
      labelLayerId = layer.id
      break
    }
  }

  map.addLayer(
    {
      id: '3d-buildings',
      source: 'composite',
      'source-layer': 'building',
      filter: ['==', 'extrude', 'true'],
      type: 'fill-extrusion',
      minzoom: 14,
      paint: {
        // Slate-blue — visible over streets-v12 beige/grey base
        'fill-extrusion-color': [
          'case',
          ['boolean', ['feature-state', 'hover'], false],
          '#3b82f6',   // hovered: brand blue
          '#b0b8c8',   // default: slate-blue (same as MapView.jsx)
        ],
        // Smooth zoom-in height reveal
        'fill-extrusion-height': [
          'interpolate', ['linear'], ['zoom'],
          14, 0,
          14.5, ['get', 'height'],
        ],
        'fill-extrusion-base': [
          'interpolate', ['linear'], ['zoom'],
          14, 0,
          14.5, ['get', 'min_height'],
        ],
        'fill-extrusion-opacity': [
          'interpolate', ['linear'], ['zoom'],
          14,   0,
          15,   0.82,
          17,   0.9,
        ],
        'fill-extrusion-vertical-gradient': true,
      },
    },
    labelLayerId
  )
}

// ── Fog / Atmosphere Layer ────────────────────────────────────
/** Fog — not used on light maps, kept as no-op for API compat */
// eslint-disable-next-line no-unused-vars
export function addFog(_map) { /* no-op for light style */ }

// ── Sky Layer ─────────────────────────────────────────────────
/** Adds a sky/atmosphere layer for high-pitch views */
export function addSkyLayer(map) {
  if (map.getLayer('sky')) return
  try {
    map.addLayer({
      id: 'sky',
      type: 'sky',
      paint: {
        'sky-type': 'atmosphere',
        'sky-atmosphere-sun': [0.0, 90.0],
        'sky-atmosphere-sun-intensity': 5,
        'sky-atmosphere-color': 'rgba(10, 10, 40, 1)',
      },
    })
  } catch (e) {
    // Sky layer not supported in this Mapbox version
  }
}

// ── Popup HTML Builders ───────────────────────────────────────
export function buildingTooltipHTML(name) {
  return `
    <div style="font-size:12px;font-weight:600;color:#f1f1f1;margin:0;">
      ${name || 'Campus Building'}
    </div>
  `
}

export function friendPopupHTML(name, timestamp) {
  const ago = timestamp
    ? Math.round((Date.now() - timestamp) / 1000) + 's ago'
    : 'Live'
  return `
    <div>
      <p style="margin:0 0 4px;font-weight:700;font-size:14px;color:#f1f1f1">${name}</p>
      <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.5)">Updated ${ago}</p>
    </div>
  `
}

export function eventPopupHTML(ev) {
  return `
    <div>
      <p style="margin:0 0 2px;font-weight:700;font-size:14px;color:#f1f1f1">${ev.name}</p>
      <p style="margin:0 0 6px;font-size:11px;color:rgba(255,255,255,0.5)">by ${ev.createdBy?.name || 'Unknown'}</p>
      ${ev.description ? `<p style="margin:0;font-size:12px;color:rgba(255,255,255,0.8)">${ev.description}</p>` : ''}
    </div>
  `
}

// ── VIT Chennai Named Building Layer ─────────────────────────
/**
 * Adds a custom GeoJSON building layer for VIT Chennai with:
 *  - Semi-transparent fill (shows on hover only)
 *  - Colour-coded outline (dim → bright on hover)
 *  - ShortName symbol labels at zoom ≥ 15
 *  - Rich popup on hover (name + departments)
 *  - Click-to-zoom on any building
 *
 * Returns a cleanup function — call it before removing the map.
 */
export function addVITBuildingLayers(map) {
  const SOURCE = 'vit-buildings'
  let hoveredId = null

  // ── 1. Source ────────────────────────────────────────────────
  map.addSource(SOURCE, {
    type: 'geojson',
    data: '/data/vit-buildings.geojson',
    generateId: false, // explicit numeric IDs in the GeoJSON
    promoteId: 'id',  // promote the "id" property as the feature ID
  })

  // ── 2. Fill layer (invisible by default, glows on hover) ────
  const TYPE_COLORS = {
    academic: '#3b82f6',  // blue
    hostel:   '#8b5cf6',  // purple
    facility: '#10b981',  // green
    sports:   '#f59e0b',  // amber
    admin:    '#ef4444',  // red
  }

  map.addLayer({
    id: 'vit-fill',
    type: 'fill',
    source: SOURCE,
    paint: {
      'fill-color': [
        'match', ['get', 'type'],
        'academic', TYPE_COLORS.academic,
        'hostel',   TYPE_COLORS.hostel,
        'facility', TYPE_COLORS.facility,
        'sports',   TYPE_COLORS.sports,
        'admin',    TYPE_COLORS.admin,
        '#3b82f6',
      ],
      'fill-opacity': [
        'case',
        ['boolean', ['feature-state', 'hover'], false],
        0.45,  // hovered: clearly visible
        0.08,  // idle: barely visible tint
      ],
    },
  })

  // ── 3. Outline layer ─────────────────────────────────────────
  map.addLayer({
    id: 'vit-outline',
    type: 'line',
    source: SOURCE,
    paint: {
      'line-color': [
        'match', ['get', 'type'],
        'academic', '#60a5fa',
        'hostel',   '#a78bfa',
        'facility', '#34d399',
        'sports',   '#fbbf24',
        'admin',    '#f87171',
        '#60a5fa',
      ],
      'line-opacity': [
        'case',
        ['boolean', ['feature-state', 'hover'], false],
        1.0,   // hovered: solid
        0.35,  // idle: faint
      ],
      'line-width': [
        'case',
        ['boolean', ['feature-state', 'hover'], false],
        2.5,
        1.0,
      ],
    },
  })

  // ── 4. Symbol label layer (shortName always visible) ─────────
  map.addLayer({
    id: 'vit-labels',
    type: 'symbol',
    source: SOURCE,
    minzoom: 15,
    layout: {
      'text-field': ['get', 'shortName'],
      'text-size': 11,
      'text-anchor': 'center',
      'text-font': ['DIN Offc Pro Bold', 'Arial Unicode MS Bold'],
      'text-allow-overlap': false,
    },
    paint: {
      'text-color': '#ffffff',
      'text-halo-color': 'rgba(0,0,0,0.85)',
      'text-halo-width': 1.5,
      'text-opacity': [
        'interpolate', ['linear'], ['zoom'],
        15, 0,
        15.5, 1,
      ],
    },
  })

  // ── 5. Hover popup ───────────────────────────────────────────
  const popup = new mapboxgl.Popup({
    closeButton: false,
    closeOnClick: false,
    offset: 12,
    maxWidth: '240px',
  })

  function onMouseMove(e) {
    if (!e.features.length) return
    map.getCanvas().style.cursor = 'pointer'

    const feat = e.features[0]
    const fid  = feat.properties.id // our explicit id

    if (hoveredId !== null && hoveredId !== fid) {
      map.setFeatureState({ source: SOURCE, id: hoveredId }, { hover: false })
    }
    hoveredId = fid
    map.setFeatureState({ source: SOURCE, id: hoveredId }, { hover: true })

    // Rich popup
    const p = feat.properties
    popup
      .setLngLat(e.lngLat)
      .setHTML(vitBuildingPopupHTML(p))
      .addTo(map)
  }

  function onMouseLeave() {
    map.getCanvas().style.cursor = ''
    if (hoveredId !== null) {
      map.setFeatureState({ source: SOURCE, id: hoveredId }, { hover: false })
    }
    hoveredId = null
    popup.remove()
  }

  // ── 6. Click → zoom into building ───────────────────────────
  function onClick(e) {
    if (!e.features.length) return
    map.flyTo({
      center: e.lngLat,
      zoom: Math.max(map.getZoom(), 18),
      pitch: 60,
      duration: 900,
    })
  }

  map.on('mousemove', 'vit-fill', onMouseMove)
  map.on('mouseleave', 'vit-fill', onMouseLeave)
  map.on('click',     'vit-fill', onClick)

  // Return cleanup for unmount
  return function cleanupVITBuildingLayers() {
    map.off('mousemove', 'vit-fill', onMouseMove)
    map.off('mouseleave', 'vit-fill', onMouseLeave)
    map.off('click',     'vit-fill', onClick)
    popup.remove()
    ;['vit-labels', 'vit-outline', 'vit-fill'].forEach((id) => {
      if (map.getLayer(id)) map.removeLayer(id)
    })
    if (map.getSource(SOURCE)) map.removeSource(SOURCE)
  }
}

// ── VIT Building popup HTML ───────────────────────────────────
const TYPE_LABELS = {
  academic: { icon: '🏛️', color: '#60a5fa' },
  hostel:   { icon: '🏠', color: '#a78bfa' },
  facility: { icon: '🏢', color: '#34d399' },
  sports:   { icon: '⚽', color: '#fbbf24' },
  admin:    { icon: '📋', color: '#f87171' },
}

function vitBuildingPopupHTML(p) {
  const tl = TYPE_LABELS[p.type] || TYPE_LABELS.facility
  return `
    <div style="padding:2px 0">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">
        <span style="font-size:14px">${tl.icon}</span>
        <span style="font-weight:700;font-size:13px;color:#f1f1f1">${p.name}</span>
        <span style="font-size:9px;font-weight:700;padding:1px 5px;border-radius:4px;
          background:${tl.color}25;color:${tl.color};border:1px solid ${tl.color}50;
          margin-left:auto;white-space:nowrap">
          ${p.shortName}
        </span>
      </div>
      <div style="font-size:11px;color:rgba(255,255,255,0.55);line-height:1.5;margin-bottom:4px">
        ${p.departments}
      </div>
      ${p.description ? `<div style="font-size:10px;color:rgba(255,255,255,0.35);border-top:1px solid rgba(255,255,255,0.08);padding-top:4px;margin-top:4px">${p.description}</div>` : ''}
    </div>
  `
}
