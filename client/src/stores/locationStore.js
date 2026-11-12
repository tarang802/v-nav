import { createStore } from 'zustand/vanilla'
import { FRIEND_EXPIRE_MS, FRIEND_STALE_MS } from '../constants/map.js'
import { initialsOf } from '../utils/geo.js'

const NOT_SHARING = { sharing: false, startedAt: null, expiresAt: null }

const initial = () => ({
  /** 'offline' | 'connecting' | 'online' */
  connection: 'offline',
  /** userId → { lat, lng, accuracy, ts } — friends who are sharing right now. */
  locations: {},
  /** userId → { online, lastSeenAt } — only friends who allow it. */
  presence: {},
  /** userId → { name, avatarUrl } — from the friends list, for marker labels. */
  directory: {},
  share: NOT_SHARING,
  /** Own latest GPS fix, shown locally whether or not it was shared. */
  self: null,
  /** null | 'denied' | 'unavailable' | 'timeout' | 'unsupported' */
  geoError: null,
  /** Last reason the server refused an update: 'OFF_CAMPUS' | 'LOW_ACCURACY' | null */
  rejection: null,
})

/**
 * Live map state. A vanilla store, because the map layers subscribe to it
 * outside React and redraw at most once per animation frame; no component
 * re-renders per location update.
 */
export const locationStore = createStore((set) => ({
  ...initial(),

  setConnection: (connection) => set({ connection }),

  applySnapshot: ({ locations = [], presence = [] }) =>
    set({
      locations: Object.fromEntries(locations.map((l) => [l.userId, pick(l)])),
      presence: Object.fromEntries(presence.map((p) => [p.userId, { online: p.online, lastSeenAt: p.lastSeenAt }])),
    }),

  upsertLocation: (l) => set((s) => ({ locations: { ...s.locations, [l.userId]: pick(l) } })),

  removeLocation: (userId) =>
    set((s) => {
      if (!(userId in s.locations)) return s
      const { [userId]: _gone, ...rest } = s.locations
      return { locations: rest }
    }),

  setPresence: ({ userId, online, lastSeenAt }) =>
    set((s) => ({ presence: { ...s.presence, [userId]: { online, lastSeenAt } } })),

  /** Unfriended or blocked: forget everything about them. */
  removeFriend: (userId) =>
    set((s) => {
      const { [userId]: _l, ...locations } = s.locations
      const { [userId]: _p, ...presence } = s.presence
      const { [userId]: _d, ...directory } = s.directory
      return { locations, presence, directory }
    }),

  setDirectory: (friends) =>
    set({ directory: Object.fromEntries(friends.map((f) => [f.id, { name: f.name, avatarUrl: f.avatarUrl ?? null }])) }),

  /** Drops positions the server has also deleted by now. Returns nothing; no-op when nothing expired. */
  pruneExpired: (now = Date.now()) =>
    set((s) => {
      const keep = Object.entries(s.locations).filter(([, l]) => now - l.ts < FRIEND_EXPIRE_MS)
      return keep.length === Object.keys(s.locations).length ? s : { locations: Object.fromEntries(keep) }
    }),

  setShare: (share) =>
    set({
      share: share.sharing
        ? { sharing: true, startedAt: toMs(share.startedAt), expiresAt: toMs(share.expiresAt) }
        : NOT_SHARING,
      ...(share.sharing ? {} : { rejection: null }),
    }),

  setSelf: (self) => set({ self, geoError: null }),
  setGeoError: (geoError) => set({ geoError }),
  setRejection: (rejection) => set({ rejection }),

  reset: () => set(initial()),
}))

const pick = (l) => ({ lat: l.lat, lng: l.lng, accuracy: l.accuracy, ts: l.ts })
const toMs = (v) => (v == null ? null : new Date(v).getTime())

/**
 * Builds the GeoJSON for the friends layer. Pure, so it is unit-tested.
 * Positions older than FRIEND_EXPIRE_MS are left out; older than
 * FRIEND_STALE_MS are flagged so the layer can dim them.
 */
export function friendFeatures(state, now = Date.now()) {
  const features = []
  for (const [userId, l] of Object.entries(state.locations)) {
    const age = now - l.ts
    if (age >= FRIEND_EXPIRE_MS) continue
    const name = state.directory[userId]?.name ?? 'Friend'
    features.push({
      type: 'Feature',
      properties: { userId, name, initials: initialsOf(name), stale: age >= FRIEND_STALE_MS, ts: l.ts, accuracy: l.accuracy },
      geometry: { type: 'Point', coordinates: [l.lng, l.lat] },
    })
  }
  return { type: 'FeatureCollection', features }
}
