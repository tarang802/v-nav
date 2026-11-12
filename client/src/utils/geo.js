import { MAX_ACCURACY_M, SEND_HEARTBEAT_MS, SEND_MIN_DISTANCE_M, SEND_MIN_INTERVAL_MS } from '../constants/map.js'

const R = 6_371_000
const rad = (d) => (d * Math.PI) / 180

/** Great-circle distance in metres. */
export function haversine(a, b) {
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/**
 * Decides whether a new GPS fix should be sent to the server.
 * Send if moved ≥ 10 m and ≥ 3 s since the last send, or every 30 s as a
 * heartbeat while stationary. Inaccurate fixes are never sent.
 *
 * @param {{lat:number,lng:number,accuracy:number}} fix
 * @param {{lat:number,lng:number,sentAt:number}|null} lastSent
 */
export function shouldSendFix(fix, lastSent, now = Date.now()) {
  if (!(fix.accuracy > 0) || fix.accuracy > MAX_ACCURACY_M) return false
  if (!lastSent) return true
  const elapsed = now - lastSent.sentAt
  if (elapsed >= SEND_HEARTBEAT_MS) return true
  if (elapsed < SEND_MIN_INTERVAL_MS) return false
  return haversine(fix, lastSent) >= SEND_MIN_DISTANCE_M
}

/** GeoJSON polygon approximating a circle of `radiusMeters` around a point. */
export function circlePolygon(lng, lat, radiusMeters, steps = 48) {
  const dLat = (radiusMeters / R) * (180 / Math.PI)
  const dLng = dLat / Math.cos(rad(lat))
  const ring = []
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 2 * Math.PI
    ring.push([lng + dLng * Math.cos(t), lat + dLat * Math.sin(t)])
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } }
}

/** "Asha Raman" → "AR"; single names give one letter. */
export function initialsOf(name) {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0][0]
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (first + last).toUpperCase()
}

/** "just now", "2 min ago", … for marker popups and lists. */
export function agoLabel(ts, now = Date.now()) {
  const s = Math.max(0, Math.round((now - ts) / 1000))
  if (s < 15) return 'just now'
  if (s < 60) return `${s} s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  return `${Math.round(m / 60)} h ago`
}
