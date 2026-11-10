import { useState, useRef, useEffect } from 'react'
import mapboxgl from 'mapbox-gl'
import { useStore } from '../store/useStore'
import api from '../utils/api'

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || ''

const VIT_CENTER  = [80.1534, 12.8406]
const GEOJSON_URL = '/data/vit-buildings.geojson'

export default function AddEventModal({ onClose }) {
  const addEvent        = useStore((s) => s.addEvent)
  const addNotification = useStore((s) => s.addNotification)

  const miniMapContainer = useRef(null)
  const miniMap          = useRef(null)
  const pinMarker        = useRef(null)

  const [form, setForm]         = useState({ name: '', description: '' })
  const [coords, setCoords]     = useState(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [locating, setLocating] = useState(false)

  // ── Init mini-map ───────────────────────────────────────────
  useEffect(() => {
    if (!miniMapContainer.current || miniMap.current) return

    const map = new mapboxgl.Map({
      container: miniMapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: VIT_CENTER,
      zoom: 16,          // zoom 16 so campus + labels are immediately visible
      pitch: 30,
      attributionControl: false,
    })

    map.on('load', () => {
      // ── Add VIT building labels so user can see AB1, AB2, etc. ──
      fetch(GEOJSON_URL)
        .then((r) => r.json())
        .then((data) => {
          map.addSource('mini-vit', { type: 'geojson', data })

          // Faint outline so buildings are identifiable over the light base
          map.addLayer({
            id: 'mini-vit-outline',
            type: 'line',
            source: 'mini-vit',
            paint: {
              'line-color': '#3b82f6',
              'line-opacity': 0.5,
              'line-width': 1.4,
            },
          })

          // Short name labels — dark text with white halo for streets-v12
          map.addLayer({
            id: 'mini-vit-labels',
            type: 'symbol',
            source: 'mini-vit',
            layout: {
              'text-field': ['get', 'shortName'],
              'text-size': 10,
              'text-anchor': 'center',
              'text-font': ['DIN Offc Pro Bold', 'Arial Unicode MS Bold'],
              'text-allow-overlap': false,
            },
            paint: {
              'text-color': '#1e40af',
              'text-halo-color': 'rgba(255,255,255,0.95)',
              'text-halo-width': 1.5,
            },
          })
        })
        .catch(console.error)
    })

    // Click on map → drop pin
    map.on('click', (e) => {
      const { lng, lat } = e.lngLat
      placePin(map, lng, lat)
    })

    miniMap.current = map

    return () => {
      map.remove()
      miniMap.current  = null
      pinMarker.current = null
    }
  }, [])

  // ── Place / move pin ─────────────────────────────────────────
  function placePin(map, lng, lat) {
    setCoords({ lat: parseFloat(lat.toFixed(6)), lng: parseFloat(lng.toFixed(6)) })

    if (pinMarker.current) {
      pinMarker.current.setLngLat([lng, lat])
    } else {
      const el = document.createElement('div')
      el.style.cssText = `
        width:14px; height:14px; border-radius:4px;
        background:#f97316; border:2.5px solid #fff;
        box-shadow:0 2px 10px rgba(249,115,22,0.8);
        transform:rotate(45deg);
      `
      pinMarker.current = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([lng, lat])
        .addTo(map)
    }
  }

  // ── Use My Location ─────────────────────────────────────────
  // maximumAge:Infinity → re-uses the browser's cached GPS fix from the
  // main map's watchPosition, so it returns instantly with no timeout risk.
  function handleUseMyLocation() {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported in this browser')
      return
    }
    setLocating(true)
    setError('')

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { longitude: lng, latitude: lat } = pos.coords
        const map = miniMap.current
        if (map) {
          placePin(map, lng, lat)
          map.flyTo({ center: [lng, lat], zoom: 17, pitch: 30, duration: 700 })
        }
        setLocating(false)
      },
      (err) => {
        // Friendly messages for each error code
        const msg = [
          'Location permission denied — please allow in browser settings',
          'Position unavailable — try clicking the map manually',
          'Request timed out — try clicking the map manually',
        ][err.code - 1] || `Location error: ${err.message}`
        setError(msg)
        setLocating(false)
      },
      {
        enableHighAccuracy: false,
        timeout: 8000,
        maximumAge: Infinity,  // reuse cached GPS from main map immediately
      }
    )
  }

  // ── Submit ───────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault()
    if (!coords) { setError('Please click the map to drop a pin first'); return }
    if (!form.name.trim()) { setError('Event name is required'); return }

    setLoading(true)
    setError('')
    try {
      const { data } = await api.post('/events', {
        name: form.name,
        description: form.description,
        lat: coords.lat,
        lng: coords.lng,
      })
      addEvent(data.event)
      addNotification({ type: 'success', message: `"${data.event.name}" created!` })
      onClose()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create event')
    } finally {
      setLoading(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, background: 'rgba(0,0,0,0.65)',
        fontFamily: 'Inter, sans-serif',
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        id="add-event-modal"
        style={{
          background: 'white', borderRadius: 14, width: '100%', maxWidth: 480,
          boxShadow: '0 20px 60px rgba(0,0,0,0.45)', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: '#fff7ed', border: '1px solid #fed7aa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 10, height: 10, background: '#f97316', borderRadius: 3, transform: 'rotate(45deg)' }} />
            </div>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>Create Event</span>
          </div>
          <button
            onClick={onClose}
            style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid #e5e7eb', background: 'white', cursor: 'pointer', color: '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* ── Mini-map ─────────────────────────────────────────── */}
          <div style={{ position: 'relative' }}>
            {/* Map container */}
            <div
              ref={miniMapContainer}
              style={{ width: '100%', height: 200, borderRadius: 10, overflow: 'hidden', border: '1px solid #e5e7eb' }}
            />

            {/* Use My Location btn — floats top-right of map */}
            <button
              type="button"
              onClick={handleUseMyLocation}
              disabled={locating}
              style={{
                position: 'absolute', top: 8, right: 8, zIndex: 5,
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '5px 10px', fontSize: 12, fontWeight: 600,
                background: '#ffffff',
                border: '1px solid rgba(0,0,0,0.10)',
                boxShadow: '0 2px 10px rgba(0,0,0,0.15)',
                borderRadius: 8,
                color: locating ? '#9ca3af' : '#2563eb',
                cursor: locating ? 'not-allowed' : 'pointer',
              }}
            >
              {locating ? (
                <svg style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }} viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="#e5e7eb" strokeWidth="3"/>
                  <path d="M12 2a10 10 0 0 1 10 10" stroke="#2563eb" strokeWidth="3" strokeLinecap="round"/>
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
                </svg>
              )}
              {locating ? 'Locating…' : 'Use My Location'}
            </button>

            {/* Hint overlay — only when no pin and not locating */}
            {!coords && !locating && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <div style={{
                  background: 'rgba(17,24,39,0.75)', backdropFilter: 'blur(6px)',
                  borderRadius: 10, padding: '7px 14px', fontSize: 12,
                  color: 'rgba(255,255,255,0.92)', border: '1px solid rgba(255,255,255,0.15)',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.20)',
                  fontWeight: 500,
                }}>
                  📍 Click on the map to drop a pin
                </div>
              </div>
            )}

            {/* Coordinates badge — shows when pin is placed */}
            {coords && (
              <div style={{
                position: 'absolute', bottom: 8, left: 8, zIndex: 5,
                background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
                borderRadius: 6, padding: '3px 8px', fontSize: 10,
                color: '#4ade80', fontFamily: 'monospace',
                border: '1px solid rgba(255,255,255,0.15)',
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80', display: 'inline-block' }} />
                {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
              </div>
            )}
          </div>

          {/* ── Event Name ──────────────────────────────────────────── */}
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
              Event Name <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              id="event-name"
              type="text"
              value={form.name}
              onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value })); setError('') }}
              placeholder="e.g. Study session at AB1 library"
              required
              maxLength={100}
              style={{
                width: '100%', padding: '9px 12px', fontSize: 14,
                border: '1px solid #d1d5db', borderRadius: 8, outline: 'none',
                boxSizing: 'border-box', color: '#111827', background: 'white',
              }}
              onFocus={(e) => e.target.style.borderColor = '#2563eb'}
              onBlur={(e) => e.target.style.borderColor = '#d1d5db'}
            />
          </div>

          {/* ── Description ─────────────────────────────────────────── */}
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
              Description <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 400 }}>(optional)</span>
            </label>
            <textarea
              id="event-description"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Optional details…"
              maxLength={500}
              rows={3}
              style={{
                width: '100%', padding: '9px 12px', fontSize: 14, resize: 'none',
                border: '1px solid #d1d5db', borderRadius: 8, outline: 'none',
                boxSizing: 'border-box', color: '#111827', background: 'white',
                fontFamily: 'Inter, sans-serif',
              }}
              onFocus={(e) => e.target.style.borderColor = '#2563eb'}
              onBlur={(e) => e.target.style.borderColor = '#d1d5db'}
            />
          </div>

          {/* ── Error ───────────────────────────────────────────────── */}
          {error && (
            <div style={{
              background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
              padding: '9px 14px', fontSize: 13, color: '#dc2626',
              display: 'flex', alignItems: 'flex-start', gap: 6,
            }}>
              <svg width="14" height="14" style={{ marginTop: 1, flexShrink: 0 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {error}
            </div>
          )}

          {/* ── Actions ─────────────────────────────────────────────── */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={onClose}
              style={{
                flex: 1, padding: '10px', fontSize: 13, fontWeight: 600,
                border: '1px solid #d1d5db', borderRadius: 8, cursor: 'pointer',
                background: 'white', color: '#374151',
              }}
            >
              Cancel
            </button>
            <button
              id="create-event-submit"
              onClick={handleSubmit}
              disabled={loading || !form.name.trim()}
              style={{
                flex: 1, padding: '10px', fontSize: 13, fontWeight: 600,
                background: '#2563eb', color: 'white', border: 'none', borderRadius: 8,
                cursor: loading || !form.name.trim() ? 'not-allowed' : 'pointer',
                opacity: loading || !form.name.trim() ? 0.6 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              {loading && (
                <svg style={{ width: 15, height: 15, animation: 'spin 1s linear infinite' }} viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" strokeWidth="3"/>
                  <path d="M12 2a10 10 0 0 1 10 10" stroke="white" strokeWidth="3" strokeLinecap="round"/>
                </svg>
              )}
              {loading ? 'Creating…' : 'Create Event'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
