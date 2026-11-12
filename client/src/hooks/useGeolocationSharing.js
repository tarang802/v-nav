import { useEffect } from 'react'
import { useStore } from 'zustand'
import { HIDDEN_PAUSE_MS } from '../constants/map.js'
import { sendLocation } from '../sockets/socketClient.js'
import { locationStore } from '../stores/locationStore.js'
import { shouldSendFix } from '../utils/geo.js'

const GEO_ERRORS = { 1: 'denied', 2: 'unavailable', 3: 'timeout' }

/**
 * Watches the device position **only while sharing is on**, and sends it to
 * the server following the movement/heartbeat policy. The watcher is removed
 * as soon as sharing stops, and paused when the tab has been hidden for more
 * than five minutes. A denied permission is never retried automatically.
 */
export function useGeolocationSharing() {
  const sharing = useStore(locationStore, (s) => s.share.sharing)

  useEffect(() => {
    if (!sharing) {
      locationStore.getState().setSelf(null)
      return
    }
    if (!('geolocation' in navigator)) {
      locationStore.getState().setGeoError('unsupported')
      return
    }

    let watchId = null
    let lastSent = null
    let hiddenTimer = null

    const onFix = (pos) => {
      const fix = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }
      locationStore.getState().setSelf({ ...fix, ts: Date.now() })
      if (shouldSendFix(fix, lastSent) && sendLocation(fix)) lastSent = { ...fix, sentAt: Date.now() }
    }
    const onError = (err) => locationStore.getState().setGeoError(GEO_ERRORS[err.code] ?? 'unavailable')

    const start = () => {
      if (watchId !== null) return
      watchId = navigator.geolocation.watchPosition(onFix, onError, {
        enableHighAccuracy: true,
        maximumAge: 10_000,
        timeout: 20_000,
      })
    }
    const stop = () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId)
      watchId = null
    }

    const onVisibility = () => {
      clearTimeout(hiddenTimer)
      if (document.hidden) hiddenTimer = setTimeout(stop, HIDDEN_PAUSE_MS)
      else start()
    }

    start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      clearTimeout(hiddenTimer)
      stop()
    }
  }, [sharing])
}
