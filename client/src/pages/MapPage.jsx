import { useRef } from 'react'
import MapView from '../components/map/MapView'

/**
 * MapPage — Basic campus map.
 * Uses the shared MapView base. No extra layers.
 */
export default function MapPage() {
  const mapRef = useRef(null)

  return (
    <div className="map-page">
      <MapView ref={mapRef}>
        {/* ── Overlay: Page badge ─────────────────────── */}
        <div className="page-badge">
          <span className="page-badge-dot page-badge-dot--blue" />
          Live Campus Map
        </div>

        {/* ── Overlay: Stats chips ────────────────────── */}
        <div className="map-page-chips">
          <div className="info-chip">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
            </svg>
            VIT Chennai Campus
          </div>
          <div className="info-chip">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            Zoom 16.5 · 3D
          </div>
        </div>
      </MapView>
    </div>
  )
}
