import { create } from 'zustand'
import { ApiError, api, bindTokenAccess, publicApi, refreshSession } from '../services/apiClient.js'

/** Refresh this long before the access token expires, so sockets and requests never see an expired one. */
const REFRESH_LEAD_MS = 60_000

let refreshTimer = null

/**
 * Session state. The access token is kept in memory only (never localStorage),
 * so a page reload restores the session through the HttpOnly refresh cookie.
 *
 * status: 'unknown' (checking the cookie) | 'signed_in' | 'signed_out'
 */
export const useAuthStore = create((set, get) => ({
  status: 'unknown',
  user: null,
  accessToken: null,
  accessTokenExpiresAt: null,

  /** Called once at startup: is there a valid refresh cookie? */
  async bootstrap() {
    try {
      await refreshSession()
    } catch {
      get().clear()
    }
  },

  async login(email, password) {
    const result = await publicApi('/auth/login', { method: 'POST', body: { email, password } })
    get().setSession(result)
  },

  async logout() {
    try {
      await publicApi('/auth/logout', { method: 'POST', csrf: true })
    } catch (err) {
      // Still sign out locally; the server session expires by itself.
      if (!(err instanceof ApiError)) throw err
    } finally {
      get().clear()
    }
  },

  setSession({ accessToken, accessTokenExpiresAt, user }) {
    const expiresAt = new Date(accessTokenExpiresAt).getTime()
    set((s) => ({ status: 'signed_in', accessToken, accessTokenExpiresAt: expiresAt, user: user ?? s.user }))
    clearTimeout(refreshTimer)
    const delay = Math.max(5_000, expiresAt - Date.now() - REFRESH_LEAD_MS)
    refreshTimer = setTimeout(() => {
      refreshSession().catch((err) => {
        if (err instanceof ApiError && err.status === 401) get().clear()
        // Network errors: the next request or socket reconnect retries the refresh.
      })
    }, delay)
  },

  clear() {
    clearTimeout(refreshTimer)
    set({ status: 'signed_out', user: null, accessToken: null, accessTokenExpiresAt: null })
  },

  async reloadUser() {
    const { user } = await api('/users/me')
    set({ user })
  },
}))

bindTokenAccess({
  get: () => useAuthStore.getState().accessToken,
  set: (session) => useAuthStore.getState().setSession(session),
  clear: () => useAuthStore.getState().clear(),
})

/** A token that is valid for at least another 30 s, refreshing first if needed. Used by the socket handshake. */
export async function freshAccessToken() {
  const { accessToken, accessTokenExpiresAt } = useAuthStore.getState()
  if (accessToken && accessTokenExpiresAt - Date.now() > 30_000) return accessToken
  await refreshSession()
  return useAuthStore.getState().accessToken
}
