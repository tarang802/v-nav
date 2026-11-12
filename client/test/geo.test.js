import { describe, expect, it } from 'vitest'
import { agoLabel, circlePolygon, haversine, initialsOf, shouldSendFix } from '../src/utils/geo.js'

const here = { lat: 12.8435, lng: 80.1555, accuracy: 10 }
/** About 11.1 m north per 0.0001° of latitude. */
const north = (m) => ({ ...here, lat: here.lat + (m / 11.1) * 0.0001 })

describe('haversine', () => {
  it('measures short distances in metres', () => {
    expect(haversine(here, here)).toBe(0)
    expect(haversine(here, north(50))).toBeGreaterThan(49)
    expect(haversine(here, north(50))).toBeLessThan(51)
  })
})

describe('shouldSendFix', () => {
  const t0 = 1_000_000
  const sent = { ...here, sentAt: t0 }

  it('sends the first accurate fix', () => {
    expect(shouldSendFix(here, null, t0)).toBe(true)
  })
  it('never sends inaccurate fixes', () => {
    expect(shouldSendFix({ ...here, accuracy: 101 }, null, t0)).toBe(false)
    expect(shouldSendFix({ ...here, accuracy: 0 }, null, t0)).toBe(false)
    expect(shouldSendFix({ ...here, accuracy: NaN }, null, t0)).toBe(false)
  })
  it('waits 3 s between sends even when moving', () => {
    expect(shouldSendFix(north(50), sent, t0 + 2_900)).toBe(false)
    expect(shouldSendFix(north(50), sent, t0 + 3_000)).toBe(true)
  })
  it('does not send small movements', () => {
    expect(shouldSendFix(north(9), sent, t0 + 10_000)).toBe(false)
    expect(shouldSendFix(north(11), sent, t0 + 10_000)).toBe(true)
  })
  it('sends a heartbeat every 30 s while stationary', () => {
    expect(shouldSendFix(here, sent, t0 + 29_000)).toBe(false)
    expect(shouldSendFix(here, sent, t0 + 30_000)).toBe(true)
  })
})

describe('helpers', () => {
  it('builds a closed accuracy circle of roughly the right radius', () => {
    const ring = circlePolygon(here.lng, here.lat, 25).geometry.coordinates[0]
    expect(ring[0]).toEqual(ring.at(-1))
    for (const [lng, lat] of ring) {
      const d = haversine(here, { lat, lng })
      expect(d).toBeGreaterThan(24.5)
      expect(d).toBeLessThan(25.5)
    }
  })
  it('makes initials', () => {
    expect(initialsOf('Asha Raman')).toBe('AR')
    expect(initialsOf('  asha  ')).toBe('A')
    expect(initialsOf('A B C')).toBe('AC')
    expect(initialsOf('')).toBe('?')
    expect(initialsOf(null)).toBe('?')
  })
  it('labels ages', () => {
    const now = 10_000_000
    expect(agoLabel(now - 5_000, now)).toBe('just now')
    expect(agoLabel(now - 40_000, now)).toBe('40 s ago')
    expect(agoLabel(now - 5 * 60_000, now)).toBe('5 min ago')
    expect(agoLabel(now - 3 * 3_600_000, now)).toBe('3 h ago')
  })
})
