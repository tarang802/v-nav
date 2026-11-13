import { useEffect, useState } from 'react'
import { useStore } from 'zustand'
import { FRIEND_STALE_MS } from '../../constants/map.js'
import { locationStore } from '../../stores/locationStore.js'
import { agoLabel, initialsOf } from '../../utils/geo.js'
import { mapController } from './mapController.js'

/**
 * Friends who are sharing right now. Re-renders when the set of sharing
 * friends changes or every 15 s for the "x ago" labels, not on every position
 * update (those go straight to the map layer).
 */
export default function FriendsOnMap({ loading, error }) {
  const ids = useStore(locationStore, (s) => Object.keys(s.locations).sort().join(','))
  const directory = useStore(locationStore, (s) => s.directory)
  const presence = useStore(locationStore, (s) => s.presence)
  const [, tick] = useState(0)

  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 15_000)
    return () => clearInterval(t)
  }, [])

  const { locations } = locationStore.getState()
  const now = Date.now()
  const rows = (ids ? ids.split(',') : [])
    .map((id) => ({ id, name: directory[id]?.name ?? 'Friend', ...locations[id] }))
    .filter((r) => r.ts)
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <section aria-label="Friends on the map" className="rounded-2xl bg-white p-4 shadow-lg ring-1 ring-slate-200">
      <h2 className="text-sm font-semibold text-slate-900">
        Friends on campus{rows.length > 0 && <span className="ml-1 text-slate-400">({rows.length})</span>}
      </h2>

      {loading && <p className="mt-2 text-xs text-slate-500">Loading your friends…</p>}
      {error && <p role="alert" className="mt-2 text-xs text-red-600">Could not load your friends. Names may be missing.</p>}
      {!loading && rows.length === 0 && (
        <p className="mt-2 text-xs text-slate-500">None of your friends are sharing their location right now.</p>
      )}

      <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto">
        {rows.map((r) => {
          const stale = now - r.ts >= FRIEND_STALE_MS
          return (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => mapController.flyTo(r)}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-slate-50"
              >
                <span
                  aria-hidden="true"
                  className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${stale ? 'bg-slate-400' : 'bg-brand-500'}`}
                >
                  {initialsOf(r.name)}
                  {presence[r.id]?.online && (
                    <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" title="Online" />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm text-slate-900">{r.name}</span>
                  <span className="block text-xs text-slate-500">
                    {stale ? `Last seen here ${agoLabel(r.ts, now)}` : `Updated ${agoLabel(r.ts, now)}`}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
