import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import MapView from '../components/map/MapView'
import { useStore } from '../store/useStore'
import api from '../utils/api'

function formatTime(dateStr) {
  const d = new Date(dateStr)
  return d.toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/**
 * EventsPage — Full-screen map + events side panel.
 * Uses the reusable MapView (streets-v12) and reads from Zustand store.
 */
export default function EventsPage() {
  const mapRef        = useRef(null)
  const events        = useStore((s) => s.events)
  const setEvents     = useStore((s) => s.setEvents)
  const removeEvent   = useStore((s) => s.removeEvent)
  const user          = useStore((s) => s.user)
  const addNotification = useStore((s) => s.addNotification)
  const [panelOpen, setPanelOpen] = useState(true)

  // Fetch events if not yet loaded
  useEffect(() => {
    if (events.length === 0) {
      api.get('/events/friends')
        .then(({ data }) => setEvents(data.events))
        .catch(console.error)
    }
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

  function flyToEvent(ev) {
    if (!ev?.location) return
    mapRef.current?.flyTo(ev.location.lng, ev.location.lat, { zoom: 18 })
  }

  return (
    <div className="map-page">
      <MapView ref={mapRef}>

        {/* ── Page badge ─────────────────────────────── */}
        <div className="page-badge">
          <span className="page-badge-dot page-badge-dot--amber" />
          Campus Events
        </div>

        {/* ── Toggle panel button ─────────────────────── */}
        <button
          onClick={() => setPanelOpen((v) => !v)}
          title={panelOpen ? 'Hide events panel' : 'Show events panel'}
          style={{
            position: 'absolute', top: 16, right: 16, zIndex: 25,
            width: 38, height: 38, borderRadius: 10,
            background: '#ffffff', border: '1px solid rgba(0,0,0,0.10)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: '#374151',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            {panelOpen
              ? <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>
              : <><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>
            }
          </svg>
        </button>

        {/* ── Events side panel ───────────────────────── */}
        <AnimatePresence>
          {panelOpen && (
            <motion.div
              key="events-panel"
              initial={{ x: -280, opacity: 0 }}
              animate={{ x: 0,    opacity: 1, transition: { duration: 0.28, ease: [0.34, 1.15, 0.64, 1] } }}
              exit={{    x: -280, opacity: 0, transition: { duration: 0.20, ease: 'easeIn' } }}
              style={{
                position: 'absolute', top: 16, left: 16, zIndex: 22,
                width: 268,
                background: 'rgba(255,255,255,0.97)',
                backdropFilter: 'blur(24px)',
                border: '1px solid rgba(0,0,0,0.08)',
                borderRadius: 18,
                boxShadow: '0 2px 4px rgba(0,0,0,0.06),0 12px 40px rgba(0,0,0,0.22)',
                display: 'flex', flexDirection: 'column',
                maxHeight: 'calc(100vh - 80px)',
                overflow: 'hidden',
                fontFamily: 'Inter, sans-serif',
              }}
            >
              {/* Header */}
              <div style={{
                padding: '13px 16px', borderBottom: '1px solid rgba(0,0,0,0.07)',
                background: 'rgba(249,250,251,0.80)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
                    <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                    Campus Events
                  </span>
                </div>
                <span style={{ fontSize: 11, color: '#9ca3af', fontFamily: 'monospace' }}>
                  {events.length} active
                </span>
              </div>

              {/* Events list */}
              <div style={{ overflowY: 'auto', flex: 1, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>

                {events.length === 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 16px', gap: 10, color: '#9ca3af' }}>
                    <div style={{ width: 48, height: 48, borderRadius: 12, background: '#fef9ec', border: '1px solid #fde68a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
                        <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                      </svg>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <p style={{ fontSize: 14, fontWeight: 600, color: '#374151', margin: '0 0 3px' }}>No events yet</p>
                      <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>Go to Dashboard to pin events on the map</p>
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
                        background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12,
                        padding: '10px 12px', cursor: 'pointer',
                        transition: 'border-color 0.15s, box-shadow 0.15s',
                      }}
                      onClick={() => flyToEvent(ev)}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = '#fde68a'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(245,158,11,0.15)' }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = '' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                          <div style={{
                            width: 30, height: 30, borderRadius: 8,
                            background: '#fff7ed', border: '1px solid #fed7aa',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
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
                            onClick={(e) => { e.stopPropagation(); handleDelete(ev._id) }}
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
                        <p style={{ fontSize: 12, color: '#4b5563', margin: '7px 0 0', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                          {ev.description}
                        </p>
                      )}

                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 7 }}>
                        <span style={{ fontSize: 10, color: '#9ca3af', fontFamily: 'monospace' }}>{formatTime(ev.createdAt)}</span>
                        <span style={{ color: '#d1d5db' }}>·</span>
                        <span style={{ fontSize: 10, color: '#3b82f6', fontFamily: 'monospace' }}>
                          📍 Tap to fly
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </MapView>
    </div>
  )
}
