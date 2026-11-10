import { useEffect, useRef, useCallback } from 'react'
import { useStore } from '../store/useStore'

const INTERVAL_MS = 4000 // throttle: send location every 4 seconds

/**
 * useGeolocation — manages browser geolocation + throttled updates.
 * Calls onUpdate(coords) on each throttled position update.
 */
export function useGeolocation({ onUpdate, onError } = {}) {
  const watchIdRef  = useRef(null)
  const intervalRef = useRef(null)
  const latestPos   = useRef(null)
  const isSharing   = useStore((s) => s.isSharing)
  const setSharing  = useStore((s) => s.setSharing)

  const stopSharing = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    latestPos.current = null
    setSharing(false)
  }, [setSharing])

  const startSharing = useCallback(() => {
    if (!navigator.geolocation) {
      onError?.('Geolocation not supported by this browser')
      return
    }

    setSharing(true)

    // Watch position for continuous updates
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        latestPos.current = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
        }
      },
      (err) => {
        console.error('[Geo]', err.message)
        onError?.(err.message)
        stopSharing()
      },
      { enableHighAccuracy: true, maximumAge: 5000 }
    )

    // Throttle: emit to caller every INTERVAL_MS
    intervalRef.current = setInterval(() => {
      if (latestPos.current) {
        onUpdate?.(latestPos.current)
      }
    }, INTERVAL_MS)
  }, [onUpdate, onError, setSharing, stopSharing])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopSharing()
    }
  }, [stopSharing])

  return { isSharing, startSharing, stopSharing }
}
