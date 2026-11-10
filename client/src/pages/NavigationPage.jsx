import { useRef, useState } from 'react'
import MapView from '../components/map/MapView'

const QUICK_SPOTS = [
  { label: 'Main Gate',    lng: 80.1523, lat: 12.8398 },
  { label: 'Tech Tower',   lng: 80.1541, lat: 12.8411 },
  { label: 'Cafeteria',    lng: 80.1548, lat: 12.8403 },
  { label: 'Sports Block', lng: 80.1530, lat: 12.8420 },
]

/**
 * NavigationPage — Map + route planner UI overlay.
 * Inputs are UI-only; no mock data or fake routes.
 */
export default function NavigationPage() {
  const mapRef      = useRef(null)
  const [origin, setOrigin] = useState('')
  const [dest,   setDest]   = useState('')
  const [mode,   setMode]   = useState('walk') // walk | bike | car

  function handleQuickSelect(spot) {
    setDest(spot.label)
    mapRef.current?.flyTo(spot.lng, spot.lat, { zoom: 18 })
  }

  return (
    <div className="map-page">
      <MapView ref={mapRef}>

        {/* ── Page badge ───────────────────────────────── */}
        <div className="page-badge">
          <span className="page-badge-dot page-badge-dot--green" />
          Navigation
        </div>

        {/* ── Route planner panel ──────────────────────── */}
        <div className="overlay-panel overlay-panel--top-left">
          <div className="overlay-panel-header">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="3 11 22 2 13 21 11 13 3 11"/>
            </svg>
            Route Planner
          </div>

          <div className="overlay-panel-body">
            {/* Origin */}
            <div className="nav-input-group">
              <span className="nav-input-dot nav-input-dot--blue" />
              <input
                className="nav-input"
                placeholder="From: Your location"
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
                aria-label="Origin"
              />
            </div>

            {/* Swap */}
            <div className="nav-swap-row">
              <div className="nav-connector-line" />
              <button className="nav-swap-btn" title="Swap origin and destination"
                onClick={() => { const t = origin; setOrigin(dest); setDest(t) }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"/>
                </svg>
              </button>
            </div>

            {/* Destination */}
            <div className="nav-input-group">
              <span className="nav-input-dot nav-input-dot--green" />
              <input
                className="nav-input"
                placeholder="To: Destination"
                value={dest}
                onChange={(e) => setDest(e.target.value)}
                aria-label="Destination"
              />
            </div>

            <div className="overlay-divider" />

            {/* Travel mode */}
            <p className="overlay-label">Mode</p>
            <div className="nav-mode-row">
              {[
                { id: 'walk', label: 'Walk',  icon: '🚶' },
                { id: 'bike', label: 'Bike',  icon: '🚲' },
                { id: 'car',  label: 'Drive', icon: '🚗' },
              ].map((m) => (
                <button
                  key={m.id}
                  className={`nav-mode-btn${mode === m.id ? ' nav-mode-btn--active' : ''}`}
                  onClick={() => setMode(m.id)}
                >
                  <span>{m.icon}</span>
                  <span>{m.label}</span>
                </button>
              ))}
            </div>

            <div className="overlay-divider" />

            {/* Quick destinations */}
            <p className="overlay-label">Quick Spots</p>
            <div className="nav-quick-spots">
              {QUICK_SPOTS.map((spot) => (
                <button
                  key={spot.label}
                  className="nav-quick-btn"
                  onClick={() => handleQuickSelect(spot)}
                >
                  📍 {spot.label}
                </button>
              ))}
            </div>

            <button className="nav-go-btn" disabled={!dest}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="3 11 22 2 13 21 11 13 3 11"/>
              </svg>
              Start Navigation
            </button>
          </div>
        </div>

      </MapView>
    </div>
  )
}
