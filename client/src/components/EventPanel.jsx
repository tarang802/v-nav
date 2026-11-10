import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '../store/useStore'
import api from '../utils/api'

const slideRight = {
  hidden: { x: 320, opacity: 0 },
  show:   { x: 0, opacity: 1, transition: { duration: 0.3, ease: [0.34, 1.2, 0.64, 1] } },
  exit:   { x: 320, opacity: 0, transition: { duration: 0.2, ease: 'easeIn' } },
}

function formatTime(dateStr) {
  const d = new Date(dateStr)
  return d.toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const S = {
  panel: {
    background: 'white', border: '1px solid #e5e7eb', borderRadius: 10,
    boxShadow: '0 2px 8px rgba(0,0,0,0.10)', width: 280, overflow: 'hidden',
    fontFamily: 'Inter, sans-serif', display: 'flex', flexDirection: 'column', maxHeight: '70vh',
  },
  header: {
    padding: '12px 16px', borderBottom: '1px solid #e5e7eb',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  },
  title: { fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em' },
}

export default function EventPanel() {
  const events        = useStore((s) => s.events)
  const setEvents     = useStore((s) => s.setEvents)
  const removeEvent   = useStore((s) => s.removeEvent)
  const user          = useStore((s) => s.user)
  const addNotification = useStore((s) => s.addNotification)

  useEffect(() => {
    api.get('/events/friends')
      .then(({ data }) => setEvents(data.events))
      .catch(console.error)
  }, [])

  async function handleDelete(id) {
    try {
      await api.delete(`/events/${id}`)
      removeEvent(id)
      addNotification({ type: 'success', message: 'Event deleted' })
    } catch (e) {
      addNotification({ type: 'error', message: e.response?.data?.error || 'Error' })
    }
  }

  return (
    <motion.div
      variants={slideRight}
      initial="hidden"
      animate="show"
      exit="exit"
      style={S.panel}
      id="panel-events"
    >
      <div style={S.header}>
        <span style={S.title}>Events</span>
        <span style={{ fontSize: 11, color: '#9ca3af', fontFamily: 'monospace' }}>{events.length} active</span>
      </div>

      <div style={{ overflowY: 'auto', flex: 1, padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {events.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 16px', gap: 10, color: '#9ca3af' }}>
            <div style={{ width: 48, height: 48, borderRadius: 10, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: '#374151', margin: '0 0 3px' }}>No events yet</p>
              <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>Create events and pin them on the map</p>
            </div>
          </div>
        )}

        <AnimatePresence>
          {events.map((ev) => (
            <motion.div
              key={ev._id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              style={{
                background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10,
                padding: '10px 12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  {/* Orange pin icon */}
                  <div style={{
                    width: 28, height: 28, borderRadius: 8, background: '#fff7ed',
                    border: '1px solid #fed7aa', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', flexShrink: 0,
                  }}>
                    <div style={{ width: 10, height: 10, background: '#f97316', borderRadius: 3, transform: 'rotate(45deg)' }} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#111827', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ev.name}
                    </p>
                    <p style={{ fontSize: 11, color: '#6b7280', margin: 0 }}>by {ev.createdBy?.name}</p>
                  </div>
                </div>
                {ev.createdBy?._id === user?._id && (
                  <button
                    onClick={() => handleDelete(ev._id)}
                    style={{
                      flexShrink: 0, width: 24, height: 24, borderRadius: 6,
                      background: '#fef2f2', border: '1px solid #fecaca',
                      color: '#ef4444', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                )}
              </div>

              {ev.description && (
                <p style={{ fontSize: 12, color: '#4b5563', margin: '6px 0 0', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                  {ev.description}
                </p>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                <span style={{ fontSize: 10, color: '#9ca3af', fontFamily: 'monospace' }}>{formatTime(ev.createdAt)}</span>
                <span style={{ color: '#d1d5db' }}>·</span>
                <span style={{ fontSize: 10, color: '#9ca3af', fontFamily: 'monospace' }}>
                  {ev.location.lat.toFixed(4)}, {ev.location.lng.toFixed(4)}
                </span>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
