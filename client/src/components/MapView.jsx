import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react'
import mapboxgl from 'mapbox-gl'
import { useStore } from '../store/useStore'

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || ''

// Default campus center — update to your campus coordinates
const DEFAULT_CENTER = [77.2090, 28.6139] // New Delhi placeholder
const DEFAULT_ZOOM   = 15

/**
 * MapView — fullscreen Mapbox GL JS map.
 * Exposes { flyToUser } via ref for Dashboard to call.
 * Manages markers for: self (blue pulse), friends (green pulse), events (orange diamond).
 */
const MapView = forwardRef(function MapView(_props, ref) {
  const mapContainer  = useRef(null)
  const mapRef        = useRef(null)
  const selfMarker    = useRef(null)
  const friendMarkers = useRef({})  // userId → mapboxgl.Marker
  const eventMarkers  = useRef({})  // eventId → mapboxgl.Marker

  const user          = useStore((s) => s.user)
  const liveLocations = useStore((s) => s.liveLocations)
  const events        = useStore((s) => s.events)

  // ── Expose helpers to parent via ref ─────────────────────
  useImperativeHandle(ref, () => ({
    flyToUser(userId) {
      const loc = useStore.getState().liveLocations[userId]
      if (!loc || !mapRef.current) return
      mapRef.current.flyTo({ center: [loc.lng, loc.lat], zoom: 17, duration: 1200 })
      friendMarkers.current[userId]?.togglePopup()
    },
    placeSelf(lat, lng) {
      placeSelfMarker(lat, lng)
    },
    removeSelf() {
      selfMarker.current?.remove()
      selfMarker.current = null
    },
  }))

  // ── Marker element factories ─────────────────────────────
  function createSelfEl() {
    const el = document.createElement('div')
    el.className = 'marker-self'
    el.style.cssText = `
      width:18px; height:18px; border-radius:50%;
      background:#4361f8; border:3px solid #fff;
      box-shadow:0 2px 12px rgba(67,97,248,0.7);
      cursor:pointer;
    `
    return el
  }

  function createFriendEl(name) {
    const el = document.createElement('div')
    el.title = name
    el.className = 'marker-friend'
    el.style.cssText = `
      width:16px; height:16px; border-radius:50%;
      background:#22d3a1; border:2.5px solid #fff;
      box-shadow:0 2px 10px rgba(34,211,161,0.6);
      cursor:pointer;
    `
    return el
  }

  function createEventEl() {
    const el = document.createElement('div')
    el.style.cssText = `
      width:14px; height:14px; border-radius:4px;
      background:#f97316; border:2.5px solid #fff;
      box-shadow:0 2px 10px rgba(249,115,22,0.6);
      cursor:pointer; transform:rotate(45deg);
    `
    return el
  }

  // ── Self marker placement ────────────────────────────────
  const placeSelfMarker = useCallback((lat, lng) => {
    const map = mapRef.current
    if (!map) return
    if (selfMarker.current) {
      selfMarker.current.setLngLat([lng, lat])
    } else {
      const popup = new mapboxgl.Popup({ offset: 20, closeButton: false })
        .setText(`You (${user?.name || ''})`)
      selfMarker.current = new mapboxgl.Marker({ element: createSelfEl() })
        .setLngLat([lng, lat])
        .setPopup(popup)
        .addTo(map)
    }
  }, [user])

  // ── Init map ─────────────────────────────────────────────
  useEffect(() => {
    if (mapRef.current) return

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      attributionControl: false,
    })

    map.addControl(
      new mapboxgl.NavigationControl({ showCompass: false }),
      'bottom-right'
    )

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // ── Sync friend markers when liveLocations changes ───────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const syncMarkers = () => {
      const existingIds = new Set(Object.keys(friendMarkers.current))

      Object.values(liveLocations).forEach((loc) => {
        const { userId, name, lat, lng } = loc
        if (!userId || userId === user?._id) return

        if (friendMarkers.current[userId]) {
          // Animate to new position smoothly
          friendMarkers.current[userId].setLngLat([lng, lat])
        } else {
          const popup = new mapboxgl.Popup({ offset: 16, closeButton: true })
            .setHTML(`
              <div>
                <p style="margin:0 0 4px;font-weight:700;font-size:14px;color:#f1f1f1">${name}</p>
                <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.5)">Live location · ${new Date(loc.timestamp).toLocaleTimeString()}</p>
              </div>
            `)
          const marker = new mapboxgl.Marker({ element: createFriendEl(name) })
            .setLngLat([lng, lat])
            .setPopup(popup)
            .addTo(map)
          friendMarkers.current[userId] = marker
        }
        existingIds.delete(userId)
      })

      // Remove markers for friends who went offline
      existingIds.forEach((uid) => {
        friendMarkers.current[uid]?.remove()
        delete friendMarkers.current[uid]
      })
    }

    if (map.loaded()) syncMarkers()
    else map.on('load', syncMarkers)
  }, [liveLocations, user])

  // ── Sync event markers when events list changes ───────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const syncEvents = () => {
      const existingIds = new Set(Object.keys(eventMarkers.current))

      events.forEach((ev) => {
        const { _id, name, description, location, createdBy } = ev
        if (eventMarkers.current[_id]) {
          existingIds.delete(_id)
          return
        }
        const popup = new mapboxgl.Popup({ offset: 16, closeButton: true })
          .setHTML(`
            <div>
              <p style="margin:0 0 2px;font-weight:700;font-size:14px;color:#f1f1f1">${name}</p>
              <p style="margin:0 0 6px;font-size:11px;color:rgba(255,255,255,0.5)">by ${createdBy?.name || 'Unknown'}</p>
              ${description ? `<p style="margin:0;font-size:12px;color:rgba(255,255,255,0.8)">${description}</p>` : ''}
            </div>
          `)
        const marker = new mapboxgl.Marker({ element: createEventEl() })
          .setLngLat([location.lng, location.lat])
          .setPopup(popup)
          .addTo(map)
        eventMarkers.current[_id] = marker
        existingIds.delete(_id)
      })

      // Remove deleted events
      existingIds.forEach((id) => {
        eventMarkers.current[id]?.remove()
        delete eventMarkers.current[id]
      })
    }

    if (map.loaded()) syncEvents()
    else map.on('load', syncEvents)
  }, [events])

  return (
    <div
      ref={mapContainer}
      id="map-container"
      className="absolute inset-0 w-full h-full"
    />
  )
})

export default MapView
