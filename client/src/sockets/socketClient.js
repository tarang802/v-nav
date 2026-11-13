import { io } from 'socket.io-client'
import { ApiError, refreshSession } from '../services/apiClient.js'
import { freshAccessToken, useAuthStore } from '../stores/authStore.js'
import { locationStore } from '../stores/locationStore.js'

const SOCKET_URL = (import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

let socket = null
let queryClient = null
let unsubscribeAuth = null

const store = () => locationStore.getState()
const invalidate = (...keys) => keys.forEach((queryKey) => queryClient?.invalidateQueries({ queryKey }))

/**
 * The app's single Socket.IO connection. Server events go straight into the
 * location store (for the map) or invalidate TanStack Query caches (for lists).
 * WebSocket only; reconnection uses Socket.IO's jittered backoff.
 */
export function connectSocket(client) {
  if (socket) return socket
  queryClient = client
  store().setConnection('connecting')

  socket = io(SOCKET_URL, {
    transports: ['websocket'],
    // Evaluated on every (re)connect, so the handshake always carries a fresh token.
    auth: (cb) => {
      freshAccessToken()
        .then((token) => cb({ token }))
        .catch(() => cb({}))
    },
    reconnectionDelay: 1000,
    reconnectionDelayMax: 30_000,
    randomizationFactor: 0.5,
  })

  socket.on('connect', () => store().setConnection('online'))
  socket.on('disconnect', () => store().setConnection(socket?.active ? 'connecting' : 'offline'))

  socket.on('connect_error', (err) => {
    const code = err?.data?.code
    if (code === 'TOKEN_EXPIRED') {
      // Refresh over REST, then let the normal reconnect carry the new token.
      refreshSession()
        .then(() => socket?.connect())
        .catch((e) => {
          if (e instanceof ApiError && e.status === 401) useAuthStore.getState().clear()
        })
    } else if (code === 'SESSION_REVOKED' || code === 'UNAUTHENTICATED') {
      useAuthStore.getState().clear()
    } else {
      store().setConnection('connecting')
    }
  })

  // ── Map data ──
  socket.on('friends:snapshot', (snapshot) => store().applySnapshot(snapshot))
  socket.on('friend:location', (l) => store().upsertLocation(l))
  socket.on('friend:location:removed', ({ userId }) => store().removeLocation(userId))
  socket.on('friend:presence', (p) => store().setPresence(p))
  socket.on('location:share:state', (s) => store().setShare(s))
  socket.on('location:rejected', ({ code }) => {
    if (code === 'OFF_CAMPUS' || code === 'LOW_ACCURACY') store().setRejection(code)
    if (code === 'NOT_SHARING') store().setShare({ sharing: false })
  })

  // ── Social changes: refresh lists ──
  socket.on('friend:request:received', () => invalidate(['friend-requests']))
  socket.on('friend:request:accepted', () => invalidate(['friends'], ['friend-requests']))
  socket.on('friendship:removed', ({ userId }) => {
    store().removeFriend(userId)
    invalidate(['friends'])
  })

  // Friends-only events changed (campus-wide ones are refetched on a timer instead).
  socket.on('event:changed', () => invalidate(['events']))

  // ── Session ──
  socket.on('session:revoked', () => useAuthStore.getState().clear())
  socket.on('auth:expired', () => {
    refreshSession()
      .then(() => socket?.connect())
      .catch(() => {})
  })

  // When the access token is renewed, tell the server so it does not drop the socket at expiry.
  unsubscribeAuth = useAuthStore.subscribe((state, prev) => {
    if (state.accessToken && state.accessToken !== prev.accessToken && socket?.connected) {
      socket.emit('auth:refresh', { token: state.accessToken })
    }
  })

  return socket
}

export function disconnectSocket() {
  unsubscribeAuth?.()
  unsubscribeAuth = null
  socket?.disconnect()
  socket = null
  store().reset()
}

function emitAck(event, payload) {
  return new Promise((resolve, reject) => {
    if (!socket?.connected) return reject(new Error('You are offline. Reconnecting…'))
    socket.timeout(5000).emit(event, payload, (err, res) => {
      if (err) return reject(new Error('The server did not respond. Try again.'))
      if (!res?.ok) return reject(new Error(res?.error?.message ?? 'Request failed'))
      resolve(res.data)
    })
  })
}

export async function startSharing(durationMinutes) {
  const state = await emitAck('location:share:start', { durationMinutes })
  store().setShare(state)
  return state
}

export async function stopSharing() {
  await emitAck('location:share:stop', {})
  store().setShare({ sharing: false })
}

/** Fire-and-forget; the server answers only with `location:rejected` when it drops the update. */
export function sendLocation({ lat, lng, accuracy }) {
  if (!socket?.connected) return false
  socket.emit('location:update', { lat, lng, accuracy, ts: Date.now() })
  return true
}
