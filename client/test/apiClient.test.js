import { beforeEach, describe, expect, it } from 'vitest'
import { ApiError, api, setFetch } from '../src/services/apiClient.js'
import { useAuthStore } from '../src/stores/authStore.js'

const json = (status, body, headers = {}) =>
  new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
const error = (status, code, headers) => json(status, { error: { code, message: code } }, headers)
const session = (token) => ({ accessToken: token, accessTokenExpiresAt: new Date(Date.now() + 900_000).toISOString(), user: { id: 'u1', name: 'Asha' } })

let calls
/** Routes requests to handlers by path; records every call. */
function network(handlers) {
  calls = []
  setFetch(async (url, init) => {
    const path = new URL(url, 'http://test').pathname.replace('/api/v1', '')
    calls.push({ path, auth: init.headers.Authorization ?? null, csrf: init.headers['X-Requested-With'] ?? null, credentials: init.credentials })
    return handlers[path](init, calls.filter((c) => c.path === path).length)
  })
}

beforeEach(() => {
  useAuthStore.getState().clear()
  useAuthStore.getState().setSession(session('old'))
})

describe('api', () => {
  it('sends the bearer token and credentials', async () => {
    network({ '/users/me': () => json(200, { user: { id: 'u1' } }) })
    expect(await api('/users/me')).toEqual({ user: { id: 'u1' } })
    expect(calls[0]).toMatchObject({ auth: 'Bearer old', credentials: 'include' })
  })

  it('refreshes once for concurrent expired requests and retries them', async () => {
    network({
      '/friends': (init) => (init.headers.Authorization === 'Bearer new' ? json(200, { items: [] }) : error(401, 'TOKEN_EXPIRED')),
      '/auth/refresh': async () => {
        await new Promise((r) => setTimeout(r, 20))
        return json(200, session('new'))
      },
    })
    const results = await Promise.all([api('/friends'), api('/friends'), api('/friends')])
    expect(results).toEqual([{ items: [] }, { items: [] }, { items: [] }])
    const refreshes = calls.filter((c) => c.path === '/auth/refresh')
    expect(refreshes).toHaveLength(1)
    expect(refreshes[0]).toMatchObject({ csrf: 'vnav', auth: null })
    expect(useAuthStore.getState().accessToken).toBe('new')
  })

  it('retries the refresh once when another tab refreshed at the same moment', async () => {
    network({
      '/friends': (init) => (init.headers.Authorization === 'Bearer new' ? json(200, { items: [] }) : error(401, 'TOKEN_EXPIRED')),
      '/auth/refresh': (_init, n) => (n === 1 ? error(401, 'REFRESH_CONFLICT') : json(200, session('new'))),
    })
    expect(await api('/friends')).toEqual({ items: [] })
    expect(calls.filter((c) => c.path === '/auth/refresh')).toHaveLength(2)
  })

  it('signs out locally when the session cannot be refreshed', async () => {
    network({
      '/friends': () => error(401, 'TOKEN_EXPIRED'),
      '/auth/refresh': () => error(401, 'SESSION_REVOKED'),
    })
    await expect(api('/friends')).rejects.toMatchObject({ status: 401, code: 'SESSION_REVOKED' })
    expect(useAuthStore.getState().status).toBe('signed_out')
    expect(useAuthStore.getState().accessToken).toBeNull()
  })

  it('signs out without a refresh attempt when the server says the session was revoked', async () => {
    network({ '/friends': () => error(401, 'SESSION_REVOKED') })
    await expect(api('/friends')).rejects.toMatchObject({ code: 'SESSION_REVOKED' })
    expect(calls).toHaveLength(1)
    expect(useAuthStore.getState().status).toBe('signed_out')
  })

  it('surfaces API errors with code, details and Retry-After', async () => {
    network({ '/friends/requests': () => error(429, 'RATE_LIMITED', { 'Retry-After': '120' }) })
    const err = await api('/friends/requests', { method: 'POST', body: { friendCode: 'VNAV-AAAAA' } }).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status: 429, code: 'RATE_LIMITED', retryAfter: 120 })
    expect(useAuthStore.getState().status).toBe('signed_in')
  })

  it('reports network failures without signing out', async () => {
    setFetch(async () => {
      throw new TypeError('fetch failed')
    })
    await expect(api('/friends')).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' })
    expect(useAuthStore.getState().status).toBe('signed_in')
  })

  it('returns null for 204', async () => {
    network({ '/location/sharing/stop': () => new Response(null, { status: 204 }) })
    expect(await api('/location/sharing/stop', { method: 'POST' })).toBeNull()
  })
})
