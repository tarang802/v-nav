import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { CAMPUS_VIEW, MAPBOX_TOKEN, MAP_STYLE, MAX_BOUNDS } from '../../constants/map.js'
import { addBuildingsLayer } from './layers/buildingsLayer.js'
import { addEventsLayer } from './layers/eventsLayer.js'
import { addFriendsLayer } from './layers/friendsLayer.js'
import { addSelfLayer } from './layers/selfLayer.js'
import { mapController } from './mapController.js'

/**
 * The single Mapbox map for the whole session. It lives in the app shell and
 * is never recreated by navigation; pages render on top of it.
 */
export default function CampusMap() {
  const containerRef = useRef(null)
  const [problem, setProblem] = useState(() => {
    if (!MAPBOX_TOKEN) return 'The map is not configured: VITE_MAPBOX_TOKEN is missing.'
    if (!mapboxgl.supported()) return 'This browser cannot display the map (WebGL is unavailable).'
    return null
  })
  const [buildingsError, setBuildingsError] = useState(null)

  useEffect(() => {
    if (problem) return
    mapboxgl.accessToken = MAPBOX_TOKEN
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      ...CAMPUS_VIEW,
      minZoom: 13,
      maxBounds: MAX_BOUNDS,
      attributionControl: true,
    })
    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'bottom-right')
    // Development builds only: lets the map be inspected from the browser console.
    if (import.meta.env.DEV) window.__vnavMap = map

    const cleanups = []
    let removed = false

    map.on('load', () => {
      if (removed) return
      const events = addEventsLayer(map)
      cleanups.push(events.remove)
      cleanups.push(addSelfLayer(map))
      cleanups.push(addFriendsLayer(map))
      mapController.attach(map, { events })
      // Buildings load separately: if the file fails, the rest of the map still works.
      addBuildingsLayer(map)
        .then((cleanup) => (removed ? cleanup() : cleanups.push(cleanup)))
        .catch((err) => setBuildingsError(err.message))
    })

    map.on('error', (e) => {
      const status = e?.error?.status
      if (status === 401 || status === 403) setProblem('The map could not load: the Mapbox token was rejected.')
    })

    return () => {
      removed = true
      mapController.detach()
      for (const c of cleanups) c()
      map.remove()
    }
  }, [problem])

  if (problem) {
    return (
      <div role="alert" className="absolute inset-0 flex items-center justify-center bg-slate-100 p-6 text-center text-slate-700">
        {problem}
      </div>
    )
  }
  return (
    <>
      {/* Mapbox sets `position: relative` on its container, which would cancel `absolute` there
          and collapse it to zero height. So the wrapper is positioned and the map fills it. */}
      <div className="absolute inset-0">
        <div ref={containerRef} className="h-full w-full" aria-label="Campus map" />
      </div>
      {buildingsError && (
        <div role="status" className="absolute bottom-10 left-1/2 -translate-x-1/2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 shadow">
          Campus buildings could not be loaded. Reload to try again.
        </div>
      )}
    </>
  )
}
