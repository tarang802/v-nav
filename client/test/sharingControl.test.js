import { describe, expect, it, vi } from 'vitest'

// The component module imports the socket client; only the pure label helper is under test here.
vi.mock('../src/sockets/socketClient.js', () => ({ startSharing: vi.fn(), stopSharing: vi.fn() }))
const { remainingLabel } = await import('../src/components/map/SharingControl.jsx')

describe('remainingLabel', () => {
  const now = 1_000_000_000
  it('counts down from the current time', () => {
    expect(remainingLabel(now + 15 * 60_000, now)).toBe('15 min left')
    expect(remainingLabel(now + 14 * 60_000 + 1, now)).toBe('15 min left')
    expect(remainingLabel(now + 30_000, now)).toBe('1 min left')
    expect(remainingLabel(now - 5_000, now)).toBe('0 min left')
  })
  it('formats hours', () => {
    expect(remainingLabel(now + 60 * 60_000, now)).toBe('1 h left')
    expect(remainingLabel(now + 239 * 60_000, now)).toBe('3 h 59 min left')
  })
})
