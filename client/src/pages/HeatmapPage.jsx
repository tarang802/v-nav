import { useRef, useEffect, useState } from 'react'
import MapView from '../components/map/MapView'

const INTENSITY_LEVELS = [
  { label: 'Low',    color: '#93c5fd', value: 0.3 },
  { label: 'Medium', color: '#f59e0b', value: 0.6 },
  { label: 'High',   color: '#ef4444', value: 0.9 },
]

/**
 * HeatmapPage — Map + heatmap controls overlay.
 * Heatmap layer is future-ready; shows UI panel + legend now.
 */
export default function HeatmapPage() {
  const mapRef        = useRef(null)
  const [active, setActive] = useState(1) // medium by default

  return (
    <div className="map-page">
      <MapView ref={mapRef}>

        {/* ── Page badge ───────────────────────────────── */}
        <div className="page-badge">
          <span className="page-badge-dot page-badge-dot--amber" />
          Crowd Heatmap
        </div>

        {/* ── Control panel ────────────────────────────── */}
        <div className="overlay-panel overlay-panel--top-left">
          <div className="overlay-panel-header">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
              <path d="M12 6c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6z"/>
              <circle cx="12" cy="12" r="2"/>
            </svg>
            Heatmap Settings
          </div>

          <div className="overlay-panel-body">
            <p className="overlay-label">Intensity</p>
            <div className="heatmap-intensity-row">
              {INTENSITY_LEVELS.map((lvl, i) => (
                <button
                  key={lvl.label}
                  className={`heatmap-intensity-btn${active === i ? ' heatmap-intensity-btn--active' : ''}`}
                  style={{ '--dot-color': lvl.color }}
                  onClick={() => setActive(i)}
                >
                  <span className="heatmap-dot" style={{ background: lvl.color }} />
                  {lvl.label}
                </button>
              ))}
            </div>

            <div className="overlay-divider" />

            <p className="overlay-label">Legend</p>
            <div className="heatmap-legend">
              <div className="heatmap-gradient" />
              <div className="heatmap-legend-labels">
                <span>Low</span>
                <span>High</span>
              </div>
            </div>

            <div className="overlay-coming-soon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              Live heatmap layer — coming soon
            </div>
          </div>
        </div>

      </MapView>
    </div>
  )
}
