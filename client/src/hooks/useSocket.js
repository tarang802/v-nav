import { useEffect, useRef } from 'react'
import { io } from 'socket.io-client'
import { useStore } from '../store/useStore'

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000'

/**
 * useSocket — creates and manages the Socket.IO connection.
 * Subscribes to friend location updates, notifications, etc.
 * Returns the socket instance for emitting events.
 */
export function useSocket() {
  const socketRef       = useRef(null)
  const token           = useStore((s) => s.token)
  const upsertLocation  = useStore((s) => s.upsertLocation)
  const removeLocation  = useStore((s) => s.removeLocation)
  const addNotification = useStore((s) => s.addNotification)

  useEffect(() => {
    if (!token) return

    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket'],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    })

    socketRef.current = socket

    socket.on('connect', () => {
      console.log('[Socket] Connected:', socket.id)
      socket.emit('join')
    })

    socket.on('connect_error', (err) => {
      console.error('[Socket] Connection error:', err.message)
    })

    // Batch snapshot of all online friends' locations
    socket.on('friends:snapshot', (locations) => {
      locations.forEach(upsertLocation)
    })

    // Single friend location update
    socket.on('friend:loc', (payload) => {
      upsertLocation(payload)
    })

    // Friend went offline / stopped sharing
    socket.on('friend:loc:removed', ({ userId }) => {
      removeLocation(userId)
    })

    // In-app notifications (friend joined, nearby, etc.)
    socket.on('notification', (n) => {
      addNotification(n)
    })

    socket.on('disconnect', () => {
      console.log('[Socket] Disconnected')
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [token, upsertLocation, removeLocation, addNotification])

  return socketRef
}
