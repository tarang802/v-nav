import { useEffect, useState } from 'react'
import { useStore } from 'zustand'
import { SHARE_DURATIONS } from '../../constants/map.js'
import { startSharing, stopSharing } from '../../sockets/socketClient.js'
import { locationStore } from '../../stores/locationStore.js'

const GEO_MESSAGES = {
  denied: 'Location permission is blocked. Allow it in your browser settings, then start sharing again.',
  unavailable: 'Your device cannot find its position right now.',
  timeout: 'Finding your position is taking too long. Still trying…',
  unsupported: 'This browser has no location support.',
}
const REJECTION_MESSAGES = {
  OFF_CAMPUS: 'You are off campus, so friends cannot see you. Sharing resumes when you are back.',
  LOW_ACCURACY: 'Your GPS signal is too weak to share right now.',
}

export function remainingLabel(expiresAt, now = Date.now()) {
  const m = Math.max(0, Math.ceil((expiresAt - now) / 60_000))
  if (m < 60) return `${m} min left`
  return m % 60 === 0 ? `${m / 60} h left` : `${Math.floor(m / 60)} h ${m % 60} min left`
}

/** Start/stop location sharing. The server holds the real state; this only reflects it. */
export default function SharingControl() {
  const share = useStore(locationStore, (s) => s.share)
  const online = useStore(locationStore, (s) => s.connection === 'online')
  const geoError = useStore(locationStore, (s) => s.geoError)
  const rejection = useStore(locationStore, (s) => s.rejection)
  const [choosing, setChoosing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [, tick] = useState(0)

  useEffect(() => {
    if (!share.sharing || !share.expiresAt) return
    // Re-render so the countdown, read from the clock at render time, stays current.
    const t = setInterval(() => tick((n) => n + 1), 30_000)
    return () => clearInterval(t)
  }, [share.sharing, share.expiresAt])

  const run = async (fn) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      setChoosing(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const notice = share.sharing ? (GEO_MESSAGES[geoError] ?? REJECTION_MESSAGES[rejection]) : null

  return (
    <section aria-label="Location sharing" className="rounded-2xl bg-white p-4 shadow-lg ring-1 ring-slate-200">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            {share.sharing ? 'Sharing your location' : 'Location sharing is off'}
          </h2>
          <p className="text-xs text-slate-500">
            {share.sharing
              ? share.expiresAt
                ? remainingLabel(share.expiresAt)
                : 'Until you stop'
              : 'Only your friends can see you, and only on campus.'}
          </p>
        </div>
        {share.sharing ? (
          <button
            type="button"
            disabled={busy || !online}
            onClick={() => run(stopSharing)}
            className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            Stop
          </button>
        ) : (
          <button
            type="button"
            disabled={busy || !online}
            aria-expanded={choosing}
            onClick={() => setChoosing((v) => !v)}
            className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            Share
          </button>
        )}
      </div>

      {choosing && !share.sharing && (
        <div className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label="Share for how long?">
          {SHARE_DURATIONS.map((d) => (
            <button
              key={d.label}
              type="button"
              disabled={busy || !online}
              onClick={() => run(() => startSharing(d.minutes))}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:border-brand-500 hover:bg-brand-50 disabled:opacity-50"
            >
              {d.label}
            </button>
          ))}
        </div>
      )}

      {!online && <p className="mt-2 text-xs text-amber-700">Reconnecting to the server…</p>}
      {notice && <p role="status" className="mt-2 text-xs text-amber-700">{notice}</p>}
      {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
    </section>
  )
}
