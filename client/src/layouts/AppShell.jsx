import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Outlet } from 'react-router-dom'
import { useStore } from 'zustand'
import CampusMap from '../components/map/CampusMap.jsx'
import MapLegend from '../components/map/MapLegend.jsx'
import { mapController } from '../components/map/mapController.js'
import { useGeolocationSharing } from '../hooks/useGeolocationSharing.js'
import { fetchMapEvents } from '../services/events.js'
import { connectSocket, disconnectSocket } from '../sockets/socketClient.js'
import { useAuthStore } from '../stores/authStore.js'
import { locationStore } from '../stores/locationStore.js'

const CONNECTION = {
  online: { label: 'Live', dot: 'bg-emerald-500' },
  connecting: { label: 'Reconnecting…', dot: 'bg-amber-500' },
  offline: { label: 'Offline', dot: 'bg-slate-400' },
}

/**
 * Signed-in shell: the map fills the screen for the whole session and routes
 * render in the panel on top of it. Owns the socket connection and the
 * geolocation watcher, so neither restarts when the route changes.
 */
export default function AppShell() {
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const connection = useStore(locationStore, (s) => s.connection)
  const hasSelf = useStore(locationStore, (s) => s.self !== null)
  const [signingOut, setSigningOut] = useState(false)
  // On phones the panel covers the lower half of the map; it can be folded away.
  const [panelOpen, setPanelOpen] = useState(true)

  useEffect(() => {
    connectSocket(queryClient)
    return () => {
      disconnectSocket()
      mapController.setEventCollection(null) // nothing from this session stays on the map after sign-out
    }
  }, [queryClient])

  useGeolocationSharing()

  // Events on the map: refreshed every 2 minutes, and at once when a friend's event changes.
  const mapEvents = useQuery({ queryKey: ['events', 'map'], queryFn: fetchMapEvents, refetchInterval: 120_000 })
  useEffect(() => {
    if (mapEvents.data) mapController.setEventCollection(mapEvents.data)
  }, [mapEvents.data])

  const signOut = async () => {
    setSigningOut(true)
    try {
      await logout()
      queryClient.clear()
    } finally {
      setSigningOut(false)
    }
  }

  const status = CONNECTION[connection]

  return (
    <div className="relative h-full overflow-hidden">
      <CampusMap />

      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-3 p-3">
        <div className="pointer-events-auto flex items-center gap-3 rounded-2xl bg-white px-4 py-2 shadow-lg ring-1 ring-slate-200">
          <span className="text-base font-bold tracking-tight text-brand-700">V-Nav</span>
          <span className="flex items-center gap-1.5 text-xs text-slate-600" role="status" aria-live="polite">
            <span className={`h-2 w-2 rounded-full ${status.dot}`} aria-hidden="true" />
            {status.label}
          </span>
        </div>
        <div className="pointer-events-auto flex items-center gap-3 rounded-2xl bg-white px-4 py-2 shadow-lg ring-1 ring-slate-200">
          <span className="max-w-[10rem] truncate text-sm text-slate-700">{user?.name}</span>
          <button
            type="button"
            onClick={signOut}
            disabled={signingOut}
            className="text-sm font-medium text-slate-500 hover:text-red-600 disabled:opacity-50"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="pointer-events-none absolute inset-x-0 bottom-0 z-10 max-h-[55%] overflow-y-auto p-3 sm:inset-y-0 sm:left-0 sm:right-auto sm:top-16 sm:max-h-none sm:w-80">
        <button
          type="button"
          onClick={() => setPanelOpen((v) => !v)}
          aria-expanded={panelOpen}
          aria-controls="shell-panel"
          className="pointer-events-auto mx-auto mb-2 block rounded-full bg-white px-4 py-1 text-xs font-medium text-slate-600 shadow ring-1 ring-slate-200 sm:hidden"
        >
          {panelOpen ? 'Hide panel' : 'Show panel'}
        </button>
        <div id="shell-panel" className={`pointer-events-auto space-y-3 ${panelOpen ? '' : 'hidden sm:block'}`}>
          <Outlet />
        </div>
      </main>

      <div className="absolute right-3 top-20 z-10 flex flex-col items-end gap-2">
        <MapLegend />
        <button
          type="button"
          onClick={() => mapController.resetView()}
          className="rounded-xl bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-lg ring-1 ring-slate-200 hover:bg-slate-50"
        >
          Whole campus
        </button>
        {hasSelf && (
          <button
            type="button"
            onClick={() => mapController.flyTo(locationStore.getState().self)}
            className="rounded-xl bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-lg ring-1 ring-slate-200 hover:bg-slate-50"
          >
            Find me
          </button>
        )}
      </div>
    </div>
  )
}
