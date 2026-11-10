import { useState, useEffect, useRef, useCallback } from 'react'

/**
 * useUserLocation — tracks the user's real-time GPS position.
 * Starts automatically on mount. Returns position + controls.
 *
 * Separate from useGeolocation (which handles socket broadcasting).
 * This hook is purely for local map rendering (marker + accuracy circle).
 */
export function useUserLocation() {
  const [position, setPosition] = useState(null) // { lat, lng, accuracy }
  const [error, setError]       = useState(null)
  const [isTracking, setIsTracking] = useState(false)
  const watchIdRef = useRef(null)

  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by this browser')
      return
    }
    if (watchIdRef.current !== null) return // already tracking

    setIsTracking(true)
    setError(null)

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setPosition({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
        })
      },
      (err) => {
        console.warn('[useUserLocation]', err.message)
        setError(err.message)
        setIsTracking(false)
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 15000,
      }
    )
  }, [])

  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    setIsTracking(false)
    setPosition(null)
  }, [])

  // Auto-start on mount, cleanup on unmount
  useEffect(() => {
    startTracking()
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
    }
  }, [startTracking])

  return { position, error, isTracking, startTracking, stopTracking }
}
