import { useState } from 'react'
import { useStore } from '../store/useStore'
import api from '../utils/api'

const panel = {
  background: 'white', border: '1px solid #e5e7eb', borderRadius: 10,
  boxShadow: '0 2px 8px rgba(0,0,0,0.08)', width: 280, overflow: 'hidden',
  fontFamily: 'Inter, sans-serif',
}

export default function AddFriend() {
  const addNotification = useStore((s) => s.addNotification)
  const user = useStore((s) => s.user)
  const [code, setCode]       = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult]   = useState(null)

  async function handleAdd(e) {
    e.preventDefault()
    if (!code.trim()) return
    setLoading(true); setResult(null)
    try {
      const { data } = await api.post('/friends/add', { friendCode: code.trim() })
      setResult({ type: 'success', msg: data.message })
      setCode('')
      addNotification({ type: 'success', message: data.message })
    } catch (err) {
      const msg = err.response?.data?.error || 'Something went wrong'
      setResult({ type: 'error', msg })
    } finally { setLoading(false) }
  }

  function handleCopy() {
    navigator.clipboard.writeText(user?.friendCode || '')
    addNotification({ type: 'success', message: 'Code copied!' })
  }

  return (
    <div style={panel} id="panel-add-friend">
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Add Friend
        </span>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Your code */}
        <div style={{ background: '#f8faff', border: '1px solid #dbeafe', borderRadius: 8, padding: '12px 14px' }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: '#3b82f6', textTransform: 'uppercase', margin: '0 0 6px' }}>Your Friend Code</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 16, color: '#1d4ed8', letterSpacing: 2, flex: 1 }}>
              {user?.friendCode || '—'}
            </span>
            <button
              onClick={handleCopy}
              style={{ padding: '4px 10px', fontSize: 12, fontWeight: 500, border: '1px solid #93c5fd', borderRadius: 6, cursor: 'pointer', background: 'white', color: '#2563eb' }}
            >
              Copy
            </button>
          </div>
          <p style={{ fontSize: 12, color: '#9ca3af', margin: '6px 0 0' }}>Share this with friends so they can add you</p>
        </div>

        {/* Add by code */}
        <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>Add by Friend Code</label>
          <input
            id="friend-code-input"
            type="text"
            value={code}
            onChange={(e) => { setCode(e.target.value.toUpperCase()); setResult(null) }}
            placeholder="VNAV-XXXXXXX"
            maxLength={12}
            style={{
              width: '100%', padding: '8px 12px', fontSize: 14, fontFamily: 'monospace',
              border: '1px solid #d1d5db', borderRadius: 8, outline: 'none',
              boxSizing: 'border-box', letterSpacing: 1,
            }}
            onFocus={(e) => e.target.style.borderColor = '#2563eb'}
            onBlur={(e) => e.target.style.borderColor = '#d1d5db'}
          />

          {result && (
            <div style={{
              padding: '8px 12px', fontSize: 13, borderRadius: 8,
              background: result.type === 'success' ? '#f0fdf4' : '#fef2f2',
              border: `1px solid ${result.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
              color: result.type === 'success' ? '#16a34a' : '#dc2626',
            }}>
              {result.msg}
            </div>
          )}

          <button
            id="send-friend-request"
            type="submit"
            disabled={loading || !code.trim()}
            style={{
              padding: '9px', fontSize: 13, fontWeight: 600,
              background: '#2563eb', color: 'white', border: 'none', borderRadius: 8,
              cursor: loading || !code.trim() ? 'not-allowed' : 'pointer',
              opacity: loading || !code.trim() ? 0.6 : 1,
            }}
          >
            {loading ? 'Sending…' : 'Send Request'}
          </button>
        </form>
      </div>
    </div>
  )
}
