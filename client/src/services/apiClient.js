/**
 * Fetch wrapper for the V-Nav API.
 *
 * - The access token lives in memory only and is sent as a Bearer header.
 * - The refresh token is an HttpOnly cookie the browser sends by itself; this
 *   code never sees it.
 * - On a 401 for an expired token, one refresh runs (shared by every request
 *   waiting on it) and the request is retried once.
 */

const BASE = `${(import.meta.env?.VITE_API_URL ?? '').replace(/\/$/, '')}/api/v1`

export class ApiError extends Error {
  constructor(status, code, message, details, retryAfter) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
    this.retryAfter = retryAfter
  }
}

/** Set by authStore so this module has no import cycle with it. */
let tokenAccess = { get: () => null, set: () => {}, clear: () => {} }
export function bindTokenAccess(access) {
  tokenAccess = access
}

let fetchImpl = (...args) => fetch(...args)
/** Tests replace the network. */
export function setFetch(fn) {
  fetchImpl = fn
}

async function parse(res) {
  if (res.status === 204) return null
  const text = await res.text()
  let body = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = null
  }
  if (res.ok) return body
  const err = body?.error ?? {}
  const retryAfter = Number(res.headers.get('Retry-After')) || undefined
  throw new ApiError(res.status, err.code ?? 'UNKNOWN', err.message ?? 'Request failed', err.details, retryAfter)
}

function send(path, { method = 'GET', body, token, csrf = false } = {}) {
  return fetchImpl(BASE + path, {
    method,
    credentials: 'include',
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(csrf ? { 'X-Requested-With': 'vnav' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }).catch(() => {
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server. Check your connection.')
  })
}

let refreshing = null

/**
 * Exchanges the refresh cookie for a new access token. Concurrent callers share
 * one request. If another tab refreshed at the same moment the server answers
 * REFRESH_CONFLICT; one retry then uses the cookie that tab just received.
 */
export function refreshSession() {
  if (!refreshing) {
    refreshing = (async () => {
      const attempt = () => send('/auth/refresh', { method: 'POST', csrf: true }).then(parse)
      let result
      try {
        result = await attempt()
      } catch (err) {
        if (!(err instanceof ApiError) || err.code !== 'REFRESH_CONFLICT') throw err
        await new Promise((r) => setTimeout(r, 400))
        result = await attempt()
      }
      tokenAccess.set(result)
      return result
    })().finally(() => {
      refreshing = null
    })
  }
  return refreshing
}

const REFRESHABLE = new Set(['TOKEN_EXPIRED', 'UNAUTHENTICATED'])

/** Authenticated request. Throws ApiError. */
export async function api(path, options = {}) {
  const first = await send(path, { ...options, token: tokenAccess.get() })
  if (first.status !== 401) return parse(first)

  let error
  try {
    await parse(first)
  } catch (err) {
    error = err
  }
  if (!REFRESHABLE.has(error.code)) {
    if (error.code === 'SESSION_REVOKED') tokenAccess.clear()
    throw error
  }
  try {
    await refreshSession()
  } catch (refreshError) {
    // The session is gone (signed out elsewhere, expired); the app returns to sign-in.
    if (refreshError instanceof ApiError && refreshError.status === 401) tokenAccess.clear()
    throw refreshError
  }
  return parse(await send(path, { ...options, token: tokenAccess.get() }))
}

/** Unauthenticated request (login and similar). */
export async function publicApi(path, options = {}) {
  return parse(await send(path, options))
}
