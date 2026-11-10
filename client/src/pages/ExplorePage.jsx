import { useRef, useState, useEffect } from 'react'
import MapView, { VIT_CONFIG } from '../components/map/MapView'

/**
 * ExplorePage — Map + interactive camera controls panel.
 * Sliders for pitch, bearing, and zoom.
 */
export default function ExplorePage() {
  const mapRef   = useRef(null)
  const [pitch,   setPitch]   = useState(VIT_CONFIG.pitch)
  const [bearing, setBearing] = useState(VIT_CONFIG.bearing)
  const [zoom,    setZoom]    = useState(VIT_CONFIG.zoom)
  const [style,   setStyle]   = useState('light')

  const MAP_STYLES = {
    light:     'mapbox://styles/mapbox/light-v11',
    satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
    outdoors:  'mapbox://styles/mapbox/outdoors-v12',
  }

  // Apply camera whenever sliders change
  useEffect(() => {
    const map = mapRef.current?.getMap?.()
    if (!map) return
    map.easeTo({ pitch, bearing, zoom, duration: 400 })
  }, [pitch, bearing, zoom])

  return (
    <div className="map-page">
      <MapView ref={mapRef}>

        {/* ── Page badge ───────────────────────────────── */}
        <div className="page-badge">
          <span className="page-badge-dot page-badge-dot--purple" />
          Explore Mode
        </div>

        {/* ── Camera controls panel ────────────────────── */}
        <div className="overlay-panel overlay-panel--top-left">
          <div className="overlay-panel-header">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/>
            </svg>
            Camera Controls
          </div>

          <div className="overlay-panel-body">

            {/* Zoom */}
            <div className="explore-slider-group">
              <div className="explore-slider-header">
                <span className="overlay-label" style={{ margin: 0 }}>Zoom</span>
                <span className="explore-value">{zoom.toFixed(1)}</span>
              </div>
              <input type="range" min="14" max="21" step="0.1"
                value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                className="explore-slider"
                aria-label="Map zoom"
              />
              <div className="explore-slider-ticks"><span>14</span><span>21</span></div>
            </div>

            {/* Pitch */}
            <div className="explore-slider-group">
              <div className="explore-slider-header">
                <span className="overlay-label" style={{ margin: 0 }}>Pitch</span>
                <span className="explore-value">{pitch}°</span>
              </div>
              <input type="range" min="0" max="75" step="1"
                value={pitch}
                onChange={(e) => setPitch(parseInt(e.target.value, 10))}
                className="explore-slider"
                aria-label="Map pitch"
              />
              <div className="explore-slider-ticks"><span>Flat</span><span>75°</span></div>
            </div>

            {/* Bearing */}
            <div className="explore-slider-group">
              <div className="explore-slider-header">
                <span className="overlay-label" style={{ margin: 0 }}>Bearing</span>
                <span className="explore-value">{bearing}°</span>
              </div>
              <input type="range" min="-180" max="180" step="1"
                value={bearing}
                onChange={(e) => setBearing(parseInt(e.target.value, 10))}
                className="explore-slider"
                aria-label="Map bearing"
              />
              <div className="explore-slider-ticks"><span>−180°</span><span>180°</span></div>
            </div>

            <div className="overlay-divider" />

            {/* Reset */}
            <button
              className="explore-reset-btn"
              onClick={() => {
                setPitch(VIT_CONFIG.pitch)
                setBearing(VIT_CONFIG.bearing)
                setZoom(VIT_CONFIG.zoom)
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
              </svg>
              Reset Camera
            </button>

          </div>
        </div>

      </MapView>
    </div>
  )
}
