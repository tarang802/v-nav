import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore'
import api from '../utils/api'

const panel = {
  background: 'white', border: '1px solid #e5e7eb', borderRadius: 10,
  boxShadow: '0 2px 8px rgba(0,0,0,0.08)', width: 280, overflow: 'hidden',
  fontFamily: 'Inter, sans-serif',
}

const panelHeader = {
  padding: '12px 16px', borderBottom: '1px solid #e5e7eb',
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
}

const panelTitle = {
  fontSize: 12, fontWeight: 700, color: '#6b7280',
  textTransform: 'uppercase', letterSpacing: '0.06em',
}

export default function FriendList({ onFlyTo }) {
  const friends        = useStore((s) => s.friends)
  const pendingReqs    = useStore((s) => s.pendingRequests)
  const liveLocations  = useStore((s) => s.liveLocations)
  const setFriends     = useStore((s) => s.setFriends)
  const setPendingRequests = useStore((s) => s.setPendingRequests)
  const addNotification    = useStore((s) => s.addNotification)
  const [loading, setLoading] = useState(false)

  async function loadFriends() {
    try {
      setLoading(true)
      const { data } = await api.get('/friends/list')
      setFriends(data.friends)
      setPendingRequests(data.pendingRequests)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  useEffect(() => { loadFriends() }, [])

  async function handleAccept(requesterId) {
    try {
      await api.post('/friends/accept', { requesterId })
      addNotification({ type: 'success', message: 'Friend request accepted!' })
      loadFriends()
    } catch (e) {
      addNotification({ type: 'error', message: e.response?.data?.error || 'Error' })
    }
  }

  async function handleReject(requesterId) {
    try { await api.post('/friends/reject', { requesterId }); loadFriends() }
    catch (e) { console.error(e) }
  }

  return (
    <div style={panel} id="panel-friends">
      <div style={panelHeader}>
        <span style={panelTitle}>Friends</span>
        <button onClick={loadFriends} title="Refresh"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 16 }}>↻</button>
      </div>

      <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
        {/* Pending */}
        {pendingReqs.length > 0 && (
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', background: '#fffbeb' }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#d97706', textTransform: 'uppercase', marginBottom: 8 }}>
              Pending ({pendingReqs.length})
            </p>
            {pendingReqs.map((req) => (
              <div key={req.from._id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#111827', margin: 0 }}>{req.from.name}</p>
                  <p style={{ fontSize: 11, color: '#9ca3af', fontFamily: 'monospace', margin: 0 }}>{req.from.friendCode}</p>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => handleAccept(req.from._id)}
                    style={{ padding: '4px 10px', fontSize: 12, fontWeight: 600, border: '1px solid #16a34a', borderRadius: 6, cursor: 'pointer', background: '#f0fdf4', color: '#16a34a' }}>
                    Accept
                  </button>
                  <button onClick={() => handleReject(req.from._id)}
                    style={{ padding: '4px 10px', fontSize: 12, fontWeight: 600, border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', background: 'white', color: '#6b7280' }}>
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Friends */}
        <div style={{ padding: '8px 8px' }}>
          {loading && <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: 13, padding: 20 }}>Loading…</p>}
          {!loading && friends.length === 0 && (
            <div style={{ textAlign: 'center', padding: '24px 16px', color: '#9ca3af' }}>
              <p style={{ fontSize: 14, fontWeight: 500, margin: '0 0 4px' }}>No friends yet</p>
              <p style={{ fontSize: 12, margin: 0 }}>Add friends using their code</p>
            </div>
          )}
          {friends.map((friend) => {
            const isOnline = !!liveLocations[friend._id]
            return (
              <div
                key={friend._id}
                onClick={() => isOnline && onFlyTo?.(friend._id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 10px', borderRadius: 8, cursor: isOnline ? 'pointer' : 'default',
                  opacity: isOnline ? 1 : 0.6,
                }}
                onMouseEnter={(e) => isOnline && (e.currentTarget.style.background = '#f9fafb')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <div style={{
                  width: 34, height: 34, borderRadius: 8, background: '#2563eb',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'white', fontWeight: 700, fontSize: 14, flexShrink: 0,
                }}>
                  {friend.name?.[0]?.toUpperCase() || '?'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#111827', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{friend.name}</p>
                  <p style={{ fontSize: 11, color: '#9ca3af', fontFamily: 'monospace', margin: 0 }}>{friend.friendCode}</p>
                </div>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: isOnline ? '#16a34a' : '#d1d5db', flexShrink: 0 }} />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
