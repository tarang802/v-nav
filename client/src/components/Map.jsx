import {
  useEffect, useRef, useCallback,
  forwardRef, useImperativeHandle
} from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import mapboxgl from 'mapbox-gl'
import { useStore } from '../store/useStore'
import { useUserLocation } from '../hooks/useUserLocation'
import {
  CAMPUS,
  createSelfMarkerEl,
  createFriendMarkerEl,
  createEventMarkerEl,
  createAccuracyCircle,
  add3DBuildings,
  addFog,
  addSkyLayer,
  flyTo,
  resetCampusView,
  friendPopupHTML,
  eventPopupHTML,
  addVITBuildingLayers,
} from '../utils/mapHelpers'

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || ''

// ── Accuracy source/layer IDs ────────────────────────────────
const ACCURACY_SOURCE = 'user-accuracy-source'
const ACCURACY_LAYER  = 'user-accuracy-layer'

/**
 * Map — Production-grade Mapbox GL JS campus map.
 *
 * Features:
 *  - VIT Chennai campus center, zoom 17, pitch 60°
 *  - 3D building extrusion with hover highlight
 *  - Dark fog + sky atmosphere
 *  - Live user pulsing dot + accuracy circle
 *  - Friend green markers (from Zustand liveLocations)
 *  - Event orange diamond markers (from Zustand events)
 *  - Locate Me + Reset View floating buttons
 *  - Compass + zoom controls
 *
 * Exposes via ref: { flyToFriend(userId), flyToCoords(lng, lat) }
 */
const Map = forwardRef(function Map(_props, ref) {
  const containerRef  = useRef(null)
  const mapRef        = useRef(null)
  const selfMarker    = useRef(null)
  const friendMarkers = useRef({})  // userId → Marker
  const eventMarkers  = useRef({})  // eventId → Marker
  const hoveredBldId  = useRef(null)
  const tooltipRef    = useRef(null) // building hover tooltip element
  const vitCleanup    = useRef(null) // VIT building layer cleanup fn

  const user          = useStore((s) => s.user)
  const liveLocations = useStore((s) => s.liveLocations)
  const events        = useStore((s) => s.events)

  // GPS position for self marker
  const { position } = useUserLocation()

  // ── Expose ref methods to Dashboard ─────────────────────────
  useImperativeHandle(ref, () => ({
    flyToFriend(userId) {
      const loc = useStore.getState().liveLocations[userId]
      if (!loc || !mapRef.current) return
      flyTo(mapRef.current, loc.lng, loc.lat, { zoom: 19 })
      setTimeout(() => {
        friendMarkers.current[userId]?.togglePopup()
      }, 800)
    },
    flyToCoords(lng, lat, zoom = 19) {
      if (!mapRef.current) return
      flyTo(mapRef.current, lng, lat, { zoom })
    },
    resetView() {
      if (!mapRef.current) return
      resetCampusView(mapRef.current)
    },
  }))

  // ── Initialise Map ───────────────────────────────────────────
  useEffect(() => {
    if (mapRef.current) return

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: CAMPUS.center,
      zoom: CAMPUS.zoom,
      pitch: CAMPUS.pitch,
      bearing: CAMPUS.bearing,
      minZoom: CAMPUS.minZoom,
      maxZoom: CAMPUS.maxZoom,
      maxBounds: CAMPUS.bounds,
      attributionControl: false,
      antialias: true, // smoother 3D edges
    })

    // Controls
    map.addControl(
      new mapboxgl.NavigationControl({ visualizePitch: true }),
      'bottom-right'
    )

    // ── On style load → add atmosphere + buildings ──────────────────
    map.on('load', () => {
      add3DBuildings(map)
      setupBuildingHover(map)
      // Custom VIT named buildings with hover + popup + click-zoom
      vitCleanup.current = addVITBuildingLayers(map)
    })

    mapRef.current = map

    return () => {
      vitCleanup.current?.()
      map.remove()
      mapRef.current = null
    }
  }, [])

  // ── Building hover interaction ───────────────────────────────
  function setupBuildingHover(map) {
    // Create floating tooltip element
    const tooltip = document.createElement('div')
    tooltip.style.cssText = `
      position: absolute; z-index: 5; pointer-events: none;
      background: rgba(10,10,20,0.92); backdrop-filter: blur(8px);
      border: 1px solid rgba(255,255,255,0.12); border-radius: 8px;
      padding: 6px 10px; font-size: 11px; font-weight: 600;
      color: #f1f1f1; display: none; white-space: nowrap;
      font-family: Inter, sans-serif;
      box-shadow: 0 8px 24px rgba(0,0,0,0.6);
    `
    containerRef.current?.appendChild(tooltip)
    tooltipRef.current = tooltip

    map.on('mousemove', '3d-buildings', (e) => {
      map.getCanvas().style.cursor = 'pointer'

      if (e.features.length === 0) return

      const feat = e.features[0]

      if (hoveredBldId.current !== null && hoveredBldId.current !== feat.id) {
        map.setFeatureState(
          { source: 'composite', sourceLayer: 'building', id: hoveredBldId.current },
          { hover: false }
        )
      }

      hoveredBldId.current = feat.id
      map.setFeatureState(
        { source: 'composite', sourceLayer: 'building', id: feat.id },
        { hover: true }
      )

      // Position tooltip near cursor
      const point = e.point
      tooltip.style.display  = 'block'
      tooltip.style.left     = `${point.x + 12}px`
      tooltip.style.top      = `${point.y - 28}px`
      tooltip.textContent    = feat.properties?.name || 'Campus Building'
    })

    map.on('mouseleave', '3d-buildings', () => {
      map.getCanvas().style.cursor = ''
      if (hoveredBldId.current !== null) {
        map.setFeatureState(
          { source: 'composite', sourceLayer: 'building', id: hoveredBldId.current },
          { hover: false }
        )
        hoveredBldId.current = null
      }
      if (tooltipRef.current) tooltipRef.current.style.display = 'none'
    })
  }

  // ── Self marker + accuracy circle ────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.loaded()) return
    if (!position) return

    const { lng, lat, accuracy } = position

    // Place / update self marker
    if (selfMarker.current) {
      selfMarker.current.setLngLat([lng, lat])
    } else {
      const popup = new mapboxgl.Popup({ offset: 22, closeButton: false })
        .setHTML(`<p style="margin:0;font-weight:600;font-size:13px;color:#f1f1f1">
          You${user?.name ? ` · ${user.name}` : ''}
        </p>`)

      selfMarker.current = new mapboxgl.Marker({
        element: createSelfMarkerEl(),
        anchor: 'center',
      })
        .setLngLat([lng, lat])
        .setPopup(popup)
        .addTo(map)
    }

    // Accuracy circle as GeoJSON polygon
    const circleGeoJSON = createAccuracyCircle(lng, lat, accuracy || 20)

    if (map.getSource(ACCURACY_SOURCE)) {
      map.getSource(ACCURACY_SOURCE).setData(circleGeoJSON)
    } else {
      map.addSource(ACCURACY_SOURCE, {
        type: 'geojson',
        data: circleGeoJSON,
      })
      map.addLayer({
        id: ACCURACY_LAYER,
        type: 'fill',
        source: ACCURACY_SOURCE,
        paint: {
          'fill-color': 'rgba(67,97,248,0.15)',
          'fill-outline-color': 'rgba(67,97,248,0.5)',
        },
      })
    }
  }, [position, user])

  // ── Sync friend markers ───────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const sync = () => {
      const stale = new Set(Object.keys(friendMarkers.current))

      Object.values(liveLocations).forEach((loc) => {
        const { userId, name, lat, lng, timestamp } = loc
        if (!userId || userId === user?._id) return

        if (friendMarkers.current[userId]) {
          friendMarkers.current[userId].setLngLat([lng, lat])
          // Refresh popup content (updates timestamp)
          friendMarkers.current[userId].getPopup()?.setHTML(friendPopupHTML(name, timestamp))
        } else {
          const popup = new mapboxgl.Popup({ offset: 16, closeButton: true })
            .setHTML(friendPopupHTML(name, timestamp))

          const marker = new mapboxgl.Marker({
            element: createFriendMarkerEl(name),
            anchor: 'center',
          })
            .setLngLat([lng, lat])
            .setPopup(popup)
            .addTo(map)

          friendMarkers.current[userId] = marker
        }
        stale.delete(userId)
      })

      // Remove offline friends
      stale.forEach((uid) => {
        friendMarkers.current[uid]?.remove()
        delete friendMarkers.current[uid]
      })
    }

    if (map.loaded()) sync()
    else map.on('load', sync)
  }, [liveLocations, user])

  // ── Sync event markers ────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const sync = () => {
      const stale = new Set(Object.keys(eventMarkers.current))

      events.forEach((ev) => {
        const { _id, location } = ev
        if (!eventMarkers.current[_id]) {
          const popup = new mapboxgl.Popup({ offset: 16, closeButton: true })
            .setHTML(eventPopupHTML(ev))

          const marker = new mapboxgl.Marker({
            element: createEventMarkerEl(),
            anchor: 'center',
          })
            .setLngLat([location.lng, location.lat])
            .setPopup(popup)
            .addTo(map)

          eventMarkers.current[_id] = marker
        }
        stale.delete(_id)
      })

      stale.forEach((id) => {
        eventMarkers.current[id]?.remove()
        delete eventMarkers.current[id]
      })
    }

    if (map.loaded()) sync()
    else map.on('load', sync)
  }, [events])

  // ── Locate Me handler ─────────────────────────────────────────
  const handleLocateMe = useCallback(() => {
    const map = mapRef.current
    if (!map) return

    if (position) {
      flyTo(map, position.lng, position.lat, { zoom: 19 })
      return
    }

    // One-shot getCurrentPosition if watchPosition hasn't got a fix yet
    navigator.geolocation?.getCurrentPosition(
      (pos) => flyTo(map, pos.coords.longitude, pos.coords.latitude, { zoom: 19 }),
      () => resetCampusView(map)
    )
  }, [position])

  // ── Reset View handler ────────────────────────────────────────
  const handleResetView = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    resetCampusView(map)
  }, [])

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="absolute inset-0 w-full h-full" id="map-container">
      {/* Mapbox container */}
      <div ref={containerRef} className="absolute inset-0 w-full h-full" />

      {/* ── Floating Action Buttons ─────────────────────────── */}
      <div className="absolute bottom-24 right-4 z-20 flex flex-col gap-2">
        <button
          id="btn-locate-me"
          onClick={handleLocateMe}
          title="Locate Me"
          style={{
            width: 42, height: 42, borderRadius: 13,
            background: 'linear-gradient(145deg,#eff6ff,#fff)',
            border: '1px solid rgba(0,0,0,0.10)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.22),0 1px 4px rgba(0,0,0,0.10)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: '#2563eb',
            transition: 'transform 0.12s, box-shadow 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='0 8px 28px rgba(0,0,0,0.28)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow='0 4px 20px rgba(0,0,0,0.22),0 1px 4px rgba(0,0,0,0.10)'; }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
          </svg>
        </button>

        <button
          id="btn-reset-view"
          onClick={handleResetView}
          title="Reset Campus View"
          style={{
            width: 42, height: 42, borderRadius: 13,
            background: '#ffffff',
            border: '1px solid rgba(0,0,0,0.10)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.22),0 1px 4px rgba(0,0,0,0.10)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: '#374151',
            transition: 'transform 0.12s, box-shadow 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='0 8px 28px rgba(0,0,0,0.28)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow='0 4px 20px rgba(0,0,0,0.22),0 1px 4px rgba(0,0,0,0.10)'; }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
            <path d="M3 3v5h5"/>
          </svg>
        </button>
      </div>

      {/* ── Campus label ─────────────────────────────────────── */}
      <div
        className="absolute bottom-4 left-4 z-20 pointer-events-none"
        style={{
          background: 'rgba(17,24,39,0.78)', backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: 20, padding: '5px 12px', fontSize: 11,
          fontWeight: 600, color: 'rgba(255,255,255,0.90)', letterSpacing: '0.05em',
          textTransform: 'uppercase', fontFamily: 'Inter, sans-serif',
        }}
      >
        📍 VIT Chennai Campus
      </div>

      {/* ── Live position indicator ───────────────────────────── */}
      {position && (
        <div
          className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 pointer-events-none"
          style={{
            background: 'rgba(17,24,39,0.78)', backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: 20, padding: '5px 12px', fontSize: 11,
            color: 'rgba(255,255,255,0.80)', fontFamily: 'monospace',
            boxShadow: '0 4px 12px rgba(0,0,0,0.20)',
          }}
        >
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#4ade80', display: 'inline-block' }} />
          {position.lat.toFixed(5)}, {position.lng.toFixed(5)}
          {position.accuracy && <span style={{ color: 'rgba(255,255,255,0.40)' }}> ±{Math.round(position.accuracy)}m</span>}
        </div>
      )}
    </div>
  )
})

export default Map
