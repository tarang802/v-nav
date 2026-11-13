/** Map configuration for the campus shell. */

export const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || ''
export const MAP_STYLE = 'mapbox://styles/mapbox/light-v11'

/**
 * Bounding box of the campus boundary in OpenStreetMap (way 336095563), the
 * same boundary the server uses as its geofence: [west, south, east, north].
 */
export const CAMPUS_BOUNDS = [80.1507363, 12.8385517, 80.1621227, 12.8475158]
export const CAMPUS_CENTER = [
  (CAMPUS_BOUNDS[0] + CAMPUS_BOUNDS[2]) / 2,
  (CAMPUS_BOUNDS[1] + CAMPUS_BOUNDS[3]) / 2,
]
export const CAMPUS_VIEW = { center: CAMPUS_CENTER, zoom: 16, pitch: 45, bearing: 0 }
/** The map cannot be panned far from campus; this is a campus app. */
export const MAX_BOUNDS = [
  [CAMPUS_BOUNDS[0] - 0.03, CAMPUS_BOUNDS[1] - 0.03],
  [CAMPUS_BOUNDS[2] + 0.03, CAMPUS_BOUNDS[3] + 0.03],
]

export const BUILDINGS_URL = '/data/campus-buildings.geojson'
export const OSM_ATTRIBUTION = 'Campus buildings © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>'

/** A friend marker is dimmed after this long without an update… */
export const FRIEND_STALE_MS = 60_000
/** …and removed after this long (the server deletes the position at the same age). */
export const FRIEND_EXPIRE_MS = 120_000

/** Metres per building level, used only when OSM has a level count but no height. */
export const METERS_PER_LEVEL = 3.2
/** Extrusion height for buildings OSM has no height data for. A drawing default, not a measurement. */
export const DEFAULT_BUILDING_HEIGHT = 4

/** Location sending policy (docs/SOCKET_EVENTS.md §5). */
export const SEND_MIN_DISTANCE_M = 10
export const SEND_MIN_INTERVAL_MS = 3_000
export const SEND_HEARTBEAT_MS = 30_000
export const MAX_ACCURACY_M = 100
export const HIDDEN_PAUSE_MS = 5 * 60_000

/** Marker colour per event category. Unknown categories fall back to `other`. */
export const EVENT_CATEGORY_COLORS = {
  academic: '#2563eb',
  technical: '#7c3aed',
  cultural: '#db2777',
  sports: '#16a34a',
  club: '#0891b2',
  career: '#ca8a04',
  social: '#f97316',
  other: '#64748b',
}

export const SHARE_DURATIONS = [
  { minutes: 15, label: '15 minutes' },
  { minutes: 60, label: '1 hour' },
  { minutes: 240, label: '4 hours' },
  { minutes: null, label: 'Until I stop' },
]
