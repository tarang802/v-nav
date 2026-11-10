import { Link } from 'react-router-dom'
import { useStore } from '../store/useStore'

const NAV_ITEMS = [
  { key: 'friends',   label: 'Friends'    },
  { key: 'events',    label: 'Events'     },
  { key: 'addFriend', label: 'Add Friend' },
]

// Quick-access map pages reachable from the Dashboard Navbar
const MAP_PAGES = [
  {
    to: '/app/map',
    label: 'Map',
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/>
        <line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/>
      </svg>
    ),
  },
  {
    to: '/app/heatmap',
    label: 'Heatmap',
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <circle cx="12" cy="12" r="6"/>
        <circle cx="12" cy="12" r="2"/>
      </svg>
    ),
  },
  {
    to: '/app/navigation',
    label: 'Navigate',
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="3 11 22 2 13 21 11 13 3 11"/>
      </svg>
    ),
  },
  {
    to: '/app/explore',
    label: 'Explore',
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        <line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
      </svg>
    ),
  },
  {
    to: '/app/events',
    label: 'Events Map',
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    ),
  },
]

export default function Navbar({ onAddEvent, onToggleLocation }) {
  const user           = useStore((s) => s.user)
  const activePanel    = useStore((s) => s.activePanel)
  const setActivePanel = useStore((s) => s.setActivePanel)
  const isSharing      = useStore((s) => s.isSharing)
  const logout         = useStore((s) => s.logout)
  const pendingReqs    = useStore((s) => s.pendingRequests)

  return (
    <div style={{
      position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
      zIndex: 30, display: 'flex', alignItems: 'center', gap: 4,
      background: 'white', border: '1px solid #e5e7eb', borderRadius: 12,
      padding: '6px 10px', boxShadow: '0 4px 20px rgba(0,0,0,0.12),0 1px 4px rgba(0,0,0,0.06)',
      fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap',
      maxWidth: '98vw',
    }}>

      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, paddingRight: 10, borderRight: '1px solid #e5e7eb', marginRight: 4 }}>
        <div style={{ width: 26, height: 26, borderRadius: 6, background: 'linear-gradient(135deg,#3b82f6,#6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
        </div>
        <span style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>V-Nav</span>
      </div>

      {/* Social panel toggle buttons */}
      {NAV_ITEMS.map(({ key, label }) => (
        <div key={key} style={{ position: 'relative' }}>
          <button
            id={`nav-${key}`}
            onClick={() => setActivePanel(activePanel === key ? null : key)}
            style={{
              padding: '6px 12px', fontSize: 13, fontWeight: 500,
              border: 'none', borderRadius: 7, cursor: 'pointer',
              background: activePanel === key ? '#2563eb' : 'transparent',
              color: activePanel === key ? 'white' : '#374151',
            }}
          >
            {label}
          </button>
          {key === 'friends' && pendingReqs.length > 0 && (
            <span style={{
              position: 'absolute', top: 2, right: 4, background: '#ef4444',
              color: 'white', fontSize: 10, fontWeight: 700,
              borderRadius: '50%', width: 14, height: 14,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {pendingReqs.length}
            </span>
          )}
        </div>
      ))}

      <div style={{ width: 1, height: 20, background: '#e5e7eb', margin: '0 4px' }} />

      {/* ── Map pages quick-nav ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {MAP_PAGES.map(({ to, label, icon }) => (
          <Link
            key={to}
            to={to}
            title={label}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '5px 10px', fontSize: 12, fontWeight: 500,
              border: '1px solid #e5e7eb', borderRadius: 7,
              color: '#374151', textDecoration: 'none',
              background: 'transparent',
              transition: 'background 0.15s, color 0.15s, border-color 0.15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = '#eff6ff'
              e.currentTarget.style.color = '#2563eb'
              e.currentTarget.style.borderColor = '#bfdbfe'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = '#374151'
              e.currentTarget.style.borderColor = '#e5e7eb'
            }}
          >
            {icon}
            {label}
          </Link>
        ))}
      </div>

      <div style={{ width: 1, height: 20, background: '#e5e7eb', margin: '0 4px' }} />

      {/* Event + Location */}
      <button
        id="nav-add-event"
        onClick={onAddEvent}
        style={{
          padding: '6px 12px', fontSize: 13, fontWeight: 500,
          border: 'none', borderRadius: 7, cursor: 'pointer',
          background: 'transparent', color: '#374151',
        }}
      >
        + Event
      </button>

      <button
        id="nav-location-toggle"
        onClick={onToggleLocation}
        style={{
          padding: '5px 12px', fontSize: 13, fontWeight: 500,
          border: `1px solid ${isSharing ? '#16a34a' : '#d1d5db'}`,
          borderRadius: 7, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
          background: isSharing ? '#f0fdf4' : 'transparent',
          color: isSharing ? '#16a34a' : '#374151',
        }}
      >
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: isSharing ? '#16a34a' : '#9ca3af', display: 'inline-block' }} />
        {isSharing ? 'Live' : 'Share'}
      </button>

      <div style={{ width: 1, height: 20, background: '#e5e7eb', margin: '0 2px' }} />

      {/* User */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ fontSize: 13, lineHeight: 1.3 }}>
          <div style={{ fontWeight: 600, color: '#111827' }}>{user?.name}</div>
          <div style={{ fontSize: 11, color: '#9ca3af', fontFamily: 'monospace' }}>{user?.friendCode}</div>
        </div>
        <button
          id="nav-logout"
          onClick={logout}
          title="Sign out"
          style={{
            padding: '5px 10px', fontSize: 12, fontWeight: 500,
            border: '1px solid #d1d5db', borderRadius: 7, cursor: 'pointer',
            background: 'transparent', color: '#6b7280',
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
