import { useRef, useCallback } from 'react'
import { AnimatePresence } from 'framer-motion'
import { useStore } from '../store/useStore'
import { useSocket } from '../hooks/useSocket'
import { useGeolocation } from '../hooks/useGeolocation'
import Map from '../components/Map'
import Navbar from '../components/Navbar'
import FriendList from '../components/FriendList'
import AddFriend from '../components/AddFriend'
import EventPanel from '../components/EventPanel'
import AddEventModal from '../components/AddEventModal'
import NotificationStack from '../components/NotificationStack'

export default function Dashboard() {
  const activePanel     = useStore((s) => s.activePanel)
  const showAddEvent    = useStore((s) => s.showAddEvent)
  const setShowAddEvent = useStore((s) => s.setShowAddEvent)
  const addNotification = useStore((s) => s.addNotification)

  // Socket — manages real-time friend location subscriptions
  const socketRef = useSocket()

  // Map ref — exposes flyToFriend / flyToCoords / resetView
  const mapRef = useRef(null)

  // Throttled geolocation for socket broadcasting (4s interval)
  const handleLocationUpdate = useCallback(
    ({ lat, lng, accuracy, timestamp }) => {
      const socket = socketRef.current
      if (!socket?.connected) return
      socket.emit('loc:update', { lat, lng, accuracy, timestamp })
    },
    [socketRef]
  )

  const handleLocationError = useCallback(
    (msg) => {
      addNotification({ type: 'error', message: `Location error: ${msg}` })
    },
    [addNotification]
  )

  const { isSharing, startSharing, stopSharing } = useGeolocation({
    onUpdate: handleLocationUpdate,
    onError: handleLocationError,
  })

  function handleToggleLocation() {
    if (isSharing) {
      stopSharing()
      socketRef.current?.emit('location:stop')
    } else {
      startSharing()
    }
  }

  function handleFlyToFriend(userId) {
    mapRef.current?.flyToFriend(userId)
  }

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#0a0a0a]">

      {/* ── Fullscreen Map ─────────────────────────────────── */}
      <Map ref={mapRef} />

      {/* ── Floating Navbar ────────────────────────────────── */}
      <Navbar
        onAddEvent={() => setShowAddEvent(true)}
        onToggleLocation={handleToggleLocation}
      />

      {/* ── Left side panels ───────────────────────────────── */}
      <div className="absolute top-24 left-4 z-20 flex flex-col gap-3">
        <AnimatePresence mode="wait">
          {activePanel === 'friends' && (
            <FriendList key="friends" onFlyTo={handleFlyToFriend} />
          )}
          {activePanel === 'addFriend' && (
            <AddFriend key="addFriend" />
          )}
        </AnimatePresence>
      </div>

      {/* ── Right side panels ──────────────────────────────── */}
      <div className="absolute top-24 right-4 z-20 flex flex-col gap-3">
        <AnimatePresence mode="wait">
          {activePanel === 'events' && (
            <EventPanel key="events" />
          )}
        </AnimatePresence>
      </div>

      {/* ── Add Event Modal ─────────────────────────────────── */}
      <AnimatePresence>
        {showAddEvent && (
          <AddEventModal onClose={() => setShowAddEvent(false)} />
        )}
      </AnimatePresence>

      {/* ── Toast notifications ─────────────────────────────── */}
      <NotificationStack />

      {/* ── Location sharing status bar ─────────────────────── */}
      <AnimatePresence>
        {isSharing && (
          <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 glass px-4 py-2 rounded-2xl text-xs text-accent-green font-semibold border border-accent-green/20 shadow-xl shadow-black/60 pointer-events-none">
            <span className="w-2 h-2 rounded-full bg-accent-green animate-pulse" />
            Broadcasting live location to friends
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
