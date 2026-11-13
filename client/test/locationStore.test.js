import { beforeEach, describe, expect, it } from 'vitest'
import { FRIEND_EXPIRE_MS, FRIEND_STALE_MS } from '../src/constants/map.js'
import { friendFeatures, locationStore } from '../src/stores/locationStore.js'
import { kindLabel, renderHeight } from '../src/utils/mapFeatures.js'

const s = () => locationStore.getState()
const loc = (userId, ts, extra = {}) => ({ userId, lat: 12.8435, lng: 80.1555, accuracy: 12, ts, ...extra })

beforeEach(() => s().reset())

describe('locationStore', () => {
  it('replaces everything from a snapshot', () => {
    s().upsertLocation(loc('old', 1))
    s().applySnapshot({
      locations: [loc('a', 100), loc('b', 200)],
      presence: [{ userId: 'a', online: true, lastSeenAt: null }],
    })
    expect(Object.keys(s().locations)).toEqual(['a', 'b'])
    expect(s().presence).toEqual({ a: { online: true, lastSeenAt: null } })
  })

  it('upserts and removes a friend location without touching others', () => {
    s().upsertLocation(loc('a', 100))
    s().upsertLocation(loc('b', 100))
    s().upsertLocation(loc('a', 200, { lat: 12.844 }))
    expect(s().locations.a).toEqual({ lat: 12.844, lng: 80.1555, accuracy: 12, ts: 200 })
    s().removeLocation('a')
    expect(Object.keys(s().locations)).toEqual(['b'])
    const before = s().locations
    s().removeLocation('nobody')
    expect(s().locations).toBe(before) // unchanged object: no needless map redraw
  })

  it('forgets a removed friend completely', () => {
    s().setDirectory([{ id: 'a', name: 'Asha Raman' }])
    s().upsertLocation(loc('a', 100))
    s().setPresence({ userId: 'a', online: true, lastSeenAt: null })
    s().removeFriend('a')
    expect(s().locations).toEqual({})
    expect(s().presence).toEqual({})
    expect(s().directory).toEqual({})
  })

  it('prunes positions older than the server keeps them', () => {
    const now = 1_000_000_000
    s().upsertLocation(loc('fresh', now - 1_000))
    s().upsertLocation(loc('gone', now - FRIEND_EXPIRE_MS))
    s().pruneExpired(now)
    expect(Object.keys(s().locations)).toEqual(['fresh'])
    const before = s().locations
    s().pruneExpired(now)
    expect(s().locations).toBe(before)
  })

  it('normalises sharing state and clears rejections when sharing stops', () => {
    s().setShare({ sharing: true, startedAt: '2026-11-11T10:00:00.000Z', expiresAt: null })
    expect(s().share).toEqual({ sharing: true, startedAt: Date.parse('2026-11-11T10:00:00.000Z'), expiresAt: null })
    s().setRejection('OFF_CAMPUS')
    s().setShare({ sharing: false })
    expect(s().share).toEqual({ sharing: false, startedAt: null, expiresAt: null })
    expect(s().rejection).toBeNull()
  })

  it('resets on sign-out', () => {
    s().upsertLocation(loc('a', 1))
    s().setConnection('online')
    s().reset()
    expect(s().locations).toEqual({})
    expect(s().connection).toBe('offline')
  })
})

describe('friendFeatures', () => {
  it('builds labelled points, flags stale ones and drops expired ones', () => {
    const now = 1_000_000_000
    s().setDirectory([{ id: 'a', name: 'Asha Raman' }])
    s().upsertLocation(loc('a', now - 1_000))
    s().upsertLocation(loc('b', now - FRIEND_STALE_MS))
    s().upsertLocation(loc('c', now - FRIEND_EXPIRE_MS))
    const fc = friendFeatures(s(), now)
    expect(fc.features.map((f) => f.properties.userId)).toEqual(['a', 'b'])
    expect(fc.features[0]).toMatchObject({
      geometry: { type: 'Point', coordinates: [80.1555, 12.8435] },
      properties: { name: 'Asha Raman', initials: 'AR', stale: false },
    })
    // A friend whose name has not loaded yet still gets a marker.
    expect(fc.features[1].properties).toMatchObject({ name: 'Friend', initials: 'F', stale: true })
  })
})

describe('map feature builders', () => {
  it('uses OSM height, then levels, then a small default', () => {
    expect(renderHeight({ height: 21, levels: 5 })).toBe(21)
    expect(renderHeight({ height: null, levels: 5 })).toBe(16)
    expect(renderHeight({ height: null, levels: null })).toBe(4)
  })

  it('makes OSM building types readable', () => {
    expect(kindLabel('dormitory')).toBe('Dormitory')
    expect(kindLabel('sports_hall')).toBe('Sports hall')
    expect(kindLabel(' university ')).toBe('University')
    expect(kindLabel(null)).toBeNull()
    expect(kindLabel('')).toBeNull()
  })

})
