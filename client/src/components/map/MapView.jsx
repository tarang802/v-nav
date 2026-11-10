import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react'
import mapboxgl from 'mapbox-gl'
import { useUserLocation } from '../../hooks/useUserLocation'

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || ''

// ── Campus constants ─────────────────────────────────────────
export const VIT_CENTER = [80.15345, 12.84068]
export const VIT_CONFIG = {
  center:  VIT_CENTER,
  zoom:    16.5,
  pitch:   55,
  bearing: 10,
}

const ACCURACY_SOURCE = 'mapview-accuracy-source'
const ACCURACY_LAYER  = 'mapview-accuracy-layer'

// ── Accuracy circle GeoJSON helper ───────────────────────────
function accuracyCircleGeoJSON(lng, lat, radiusMeters, steps = 64) {
  const km   = radiusMeters / 1000
  const distX = km / (111.32 * Math.cos((lat * Math.PI) / 180))
  const distY = km / 110.574
  const coords = []
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * 2 * Math.PI
    coords.push([lng + distX * Math.cos(angle), lat + distY * Math.sin(angle)])
  }
  return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [coords] } }
}

/**
 * MapView — Production-ready reusable Mapbox map.
 *
 * Props:
 *   children  — optional React overlays rendered on top of the map
 *   className — extra class for the container div
 *
 * Ref methods:
 *   flyTo(lng, lat, opts)  — smooth camera flight
 *   resetView()            — return to VIT campus
 *   locateUser()           — fly to user's GPS position
 */
const MapView = forwardRef(function MapView({ children, className = '' }, ref) {
  const containerRef = useRef(null)
  const mapRef       = useRef(null)
  const selfMarker   = useRef(null)
  const locateBtnRef = useRef(null)

  const { position } = useUserLocation()

  // ── Expose imperative API ────────────────────────────────
  useImperativeHandle(ref, () => ({
    flyTo(lng, lat, opts = {}) {
      const map = mapRef.current
      if (!map) return
      map.flyTo({
        center: [lng, lat],
        zoom:     opts.zoom    ?? 18,
        pitch:    opts.pitch   ?? 55,
        bearing:  opts.bearing ?? 10,
        duration: opts.duration ?? 1400,
        essential: true,
      })
    },
    resetView() {
      const map = mapRef.current
      if (!map) return
      map.flyTo({ ...VIT_CONFIG, duration: 1200, essential: true })
    },
    locateUser() {
      handleLocateMe()
    },
    getMap() {
      return mapRef.current
    },
  }))

  // ── Init map ─────────────────────────────────────────────
  useEffect(() => {
    if (mapRef.current) return

    const map = new mapboxgl.Map({
      container:        containerRef.current,
      style:            'mapbox://styles/mapbox/streets-v12',
      center:           VIT_CONFIG.center,
      zoom:             VIT_CONFIG.zoom,
      pitch:            VIT_CONFIG.pitch,
      bearing:          VIT_CONFIG.bearing,
      antialias:        true,
      attributionControl: false,
    })

    // NavigationControl — top-right
    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'top-right')

    // On load: add 3D buildings
    map.on('load', () => {
      add3DBuildings(map)
    })

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // ── 3D Building layer (composite source, streets-v12 compat) ─
  function add3DBuildings(map) {
    if (map.getLayer('mapview-3d-buildings')) return

    // Find the first label layer to insert buildings below it
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
        id:           'mapview-3d-buildings',
        source:       'composite',
        'source-layer': 'building',
        filter:       ['==', 'extrude', 'true'],
        type:         'fill-extrusion',
        minzoom:      15,
        paint: {
          // Warm slate colour — clearly visible over the coloured streets base
          'fill-extrusion-color': [
            'interpolate', ['linear'], ['zoom'],
            15,   '#c8cdd6',   // cooler / lighter when zoomed out
            17,   '#b0b8c8',   // deeper slate-blue at campus zoom
            20,   '#9aa4b8',
          ],
          // Smooth height reveal on zoom-in
          'fill-extrusion-height': [
            'interpolate', ['linear'], ['zoom'],
            15,   0,
            15.5, ['get', 'height'],
          ],
          'fill-extrusion-base': [
            'interpolate', ['linear'], ['zoom'],
            15,   0,
            15.5, ['get', 'min_height'],
          ],
          // Fade in, then settle at a solid, visible opacity
          'fill-extrusion-opacity': [
            'interpolate', ['linear'], ['zoom'],
            15,   0,
            15.5, 0.82,
            17,   0.9,
          ],
          // Fake ambient-occlusion: slight vertical gradient
          'fill-extrusion-vertical-gradient': true,
        },
      },
      labelLayerId // insert below labels so labels remain readable
    )
  }

  // ── Self marker + accuracy circle ────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !position) return

    const { lng, lat, accuracy } = position

    const setupMarker = () => {
      if (selfMarker.current) {
        selfMarker.current.setLngLat([lng, lat])
      } else {
        const el = document.createElement('div')
        el.className = 'mapview-self-marker'
        selfMarker.current = new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat([lng, lat])
          .addTo(map)
      }

      const circle = accuracyCircleGeoJSON(lng, lat, accuracy || 20)
      if (map.getSource(ACCURACY_SOURCE)) {
        map.getSource(ACCURACY_SOURCE).setData(circle)
      } else {
        map.addSource(ACCURACY_SOURCE, { type: 'geojson', data: circle })
        map.addLayer({
          id: ACCURACY_LAYER,
          type: 'fill',
          source: ACCURACY_SOURCE,
          paint: {
            'fill-color':         'rgba(59,130,246,0.12)',
            'fill-outline-color': 'rgba(59,130,246,0.45)',
          },
        })
      }
    }

    if (map.loaded()) setupMarker()
    else map.on('load', setupMarker)
  }, [position])

  // ── Locate Me handler ────────────────────────────────────
  const handleLocateMe = useCallback(() => {
    const map = mapRef.current
    if (!map) return

    // Pulse the button
    locateBtnRef.current?.classList.add('locating')
    setTimeout(() => locateBtnRef.current?.classList.remove('locating'), 1200)

    if (position) {
      map.flyTo({
        center:   [position.lng, position.lat],
        zoom:     18,
        pitch:    55,
        bearing:  10,
        duration: 1200,
        essential: true,
      })
      return
    }

    navigator.geolocation?.getCurrentPosition(
      (pos) => map.flyTo({
        center:   [pos.coords.longitude, pos.coords.latitude],
        zoom:     18,
        pitch:    55,
        duration: 1200,
        essential: true,
      }),
      () => map.flyTo({ ...VIT_CONFIG, duration: 1200, essential: true })
    )
  }, [position])

  // ── Reset View handler ───────────────────────────────────
  const handleResetView = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    map.flyTo({ ...VIT_CONFIG, duration: 1200, essential: true })
  }, [])

  // ── Render ───────────────────────────────────────────────
  return (
    <div className={`mapview-root ${className}`}>
      {/* Mapbox canvas */}
      <div ref={containerRef} className="mapview-canvas" />

      {/* ── Floating controls — bottom right ─────────────── */}
      <div className="mapview-fab-stack">
        {/* Locate Me */}
        <button
          id="mapview-btn-locate"
          ref={locateBtnRef}
          className="mapview-glass-btn mapview-btn-locate"
          onClick={handleLocateMe}
          title="Locate Me"
          aria-label="Locate Me"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
          </svg>
        </button>

        {/* Reset */}
        <button
          id="mapview-btn-reset"
          className="mapview-glass-btn mapview-btn-reset"
          onClick={handleResetView}
          title="Reset to Campus"
          aria-label="Reset Campus View"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
            <path d="M3 3v5h5"/>
          </svg>
        </button>
      </div>

      {/* ── Campus watermark ─────────────────────────────── */}
      <div className="mapview-campus-label" aria-hidden="true">
        VIT Chennai
      </div>

      {/* ── Page-level overlays (children) ───────────────── */}
      {children}
    </div>
  )
})

export default MapView
