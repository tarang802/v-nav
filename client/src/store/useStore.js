import { create } from 'zustand'

/**
 * Central Zustand store — replaces React Context for predictable state.
 * Sections: auth, friends, live locations, events, UI flags
 */
export const useStore = create((set, get) => ({
  // ── Auth ────────────────────────────────────────────────
  user:  JSON.parse(localStorage.getItem('vnav_user') || 'null'),
  token: localStorage.getItem('vnav_token') || null,

  setAuth: (user, token) => {
    localStorage.setItem('vnav_user', JSON.stringify(user))
    localStorage.setItem('vnav_token', token)
    set({ user, token })
  },

  logout: () => {
    localStorage.removeItem('vnav_user')
    localStorage.removeItem('vnav_token')
    set({ user: null, token: null, friends: [], liveLocations: {}, events: [], notifications: [] })
  },

  // ── Friends ─────────────────────────────────────────────
  friends: [],        // confirmed friends [{_id, name, studentId, friendCode}]
  pendingRequests: [], // incoming friend requests
  setFriends: (friends) => set({ friends }),
  setPendingRequests: (pendingRequests) => set({ pendingRequests }),

  // ── Live Locations ───────────────────────────────────────
  // Map: userId string → { userId, name, lat, lng, accuracy, timestamp }
  liveLocations: {},

  upsertLocation: (payload) =>
    set((s) => ({
      liveLocations: { ...s.liveLocations, [payload.userId]: payload },
    })),

  removeLocation: (userId) =>
    set((s) => {
      const next = { ...s.liveLocations }
      delete next[userId]
      return { liveLocations: next }
    }),

  // Self location sharing
  isSharing: false,
  setSharing: (v) => set({ isSharing: v }),

  // ── Events ──────────────────────────────────────────────
  events: [],
  setEvents: (events) => set({ events }),
  addEvent: (event) => set((s) => ({ events: [event, ...s.events] })),
  removeEvent: (id) => set((s) => ({ events: s.events.filter((e) => e._id !== id) })),

  // ── UI Panels ───────────────────────────────────────────
  activePanel: null, // 'friends' | 'events' | 'addFriend' | null
  setActivePanel: (panel) =>
    set((s) => ({ activePanel: s.activePanel === panel ? null : panel })),

  showAddEvent: false,
  setShowAddEvent: (v) => set({ showAddEvent: v }),

  // ── Notifications ────────────────────────────────────────
  notifications: [],
  addNotification: (n) => {
    const id = Date.now()
    set((s) => ({ notifications: [{ ...n, id }, ...s.notifications].slice(0, 5) }))
    setTimeout(() => {
      set((s) => ({ notifications: s.notifications.filter((x) => x.id !== id) }))
    }, 4000)
  },
}))
