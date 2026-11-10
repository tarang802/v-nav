import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '../store/useStore'
import api from '../utils/api'

// ── Design tokens ────────────────────────────────────────────
const C = {
  bg:           '#0a0a0a',
  card:         'rgba(255,255,255,0.032)',
  cardBorder:   'rgba(255,255,255,0.08)',
  inputBg:      'rgba(255,255,255,0.055)',
  inputBorder:  'rgba(255,255,255,0.12)',
  inputFocus:   'rgba(99,102,241,0.75)',
  inputGlow:    'rgba(99,102,241,0.18)',
  textPrimary:  '#f0f2ff',
  textSecond:   'rgba(255,255,255,0.52)',
  textMuted:    'rgba(255,255,255,0.28)',
  accent:       '#6366f1',
  accentPurple: '#8b5cf6',
  errorBg:      'rgba(239,68,68,0.09)',
  errorBorder:  'rgba(239,68,68,0.3)',
  errorText:    '#fc8181',
}

// ── Animated blob background ─────────────────────────────────
function Blobs() {
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {/* Blue blob — top left */}
      <div style={{
        position: 'absolute', top: '-15%', left: '-10%',
        width: 700, height: 700, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(67,97,248,0.18) 0%, transparent 70%)',
        animation: 'float-blob 14s ease-in-out infinite',
        filter: 'blur(40px)',
      }} />
      {/* Purple blob — bottom right */}
      <div style={{
        position: 'absolute', bottom: '-20%', right: '-10%',
        width: 800, height: 800, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(139,92,246,0.15) 0%, transparent 70%)',
        animation: 'float-blob 18s ease-in-out infinite reverse',
        filter: 'blur(40px)',
      }} />
      {/* Subtle teal accent — mid right */}
      <div style={{
        position: 'absolute', top: '35%', right: '20%',
        width: 400, height: 400, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(34,211,161,0.07) 0%, transparent 70%)',
        animation: 'float-blob 22s ease-in-out infinite 4s',
        filter: 'blur(60px)',
      }} />
      {/* Very subtle grid */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
                          linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)`,
        backgroundSize: '48px 48px',
      }} />
    </div>
  )
}

// ── Feature pill ─────────────────────────────────────────────
function Pill({ icon, text }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      padding: '7px 14px', borderRadius: 99,
      background: 'rgba(255,255,255,0.05)',
      border: '1px solid rgba(255,255,255,0.1)',
      fontSize: 13, color: C.textSecond,
    }}>
      <span>{icon}</span>
      <span>{text}</span>
    </div>
  )
}

// ── Left branding panel ───────────────────────────────────────
function BrandPanel() {
  return (
    <motion.div
      initial={{ opacity: 0, x: -40 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        justifyContent: 'center', padding: '60px 64px',
        maxWidth: 560,
      }}
    >
      {/* Logo mark */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.5 }}
        style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 56 }}
      >
        <div style={{
          width: 38, height: 38, borderRadius: 10,
          background: 'linear-gradient(135deg, #4f46e5, #8b5cf6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 24px rgba(99,102,241,0.5)',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
        </div>
        <span style={{ fontSize: 18, fontWeight: 700, color: C.textPrimary, letterSpacing: '-0.02em' }}>
          V-Nav
        </span>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
          background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)',
          color: '#818cf8', letterSpacing: '0.05em', textTransform: 'uppercase', marginLeft: 4,
        }}>
          Beta
        </span>
      </motion.div>

      {/* Heading */}
      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        style={{
          fontSize: 'clamp(36px, 4vw, 52px)', fontWeight: 800,
          lineHeight: 1.1, letterSpacing: '-0.03em',
          margin: '0 0 20px',
          background: 'linear-gradient(135deg, #f0f2ff 0%, rgba(255,255,255,0.65) 100%)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}
      >
        Navigate your<br />campus. Live.
      </motion.h1>

      {/* Sub-heading */}
      <motion.p
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.6 }}
        style={{
          fontSize: 17, color: C.textSecond, lineHeight: 1.65,
          margin: '0 0 44px', maxWidth: 380,
        }}
      >
        Find friends, discover events, and explore your
        campus smarter — powered by real-time maps.
      </motion.p>

      {/* Feature pills */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.6 }}
        style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}
      >
        <Pill icon="📍" text="Real-time location" />
        <Pill icon="👥" text="Friend network" />
        <Pill icon="📅" text="Campus events" />
        <Pill icon="🗺️" text="Interactive map" />
      </motion.div>

      {/* Divider + social proof */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6, duration: 0.6 }}
        style={{
          marginTop: 52, paddingTop: 28,
          borderTop: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', alignItems: 'center', gap: 14,
        }}
      >
        {/* Stacked avatars */}
        <div style={{ display: 'flex' }}>
          {['#6366f1','#8b5cf6','#ec4899','#14b8a6'].map((c, i) => (
            <div key={i} style={{
              width: 30, height: 30, borderRadius: '50%',
              background: c, border: '2px solid #0a0a0a',
              marginLeft: i === 0 ? 0 : -10,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, color: 'white',
            }}>
              {['A','R','S','M'][i]}
            </div>
          ))}
        </div>
        <div>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: C.textPrimary }}>
            VIT Chennai students
          </p>
          <p style={{ margin: 0, fontSize: 12, color: C.textMuted }}>
            Navigating together every day
          </p>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ── Input field ───────────────────────────────────────────────
function Field({ label, id, name, type = 'text', value, onChange, placeholder, autoComplete }) {
  const [focused, setFocused] = useState(false)
  return (
    <div>
      <label style={{
        display: 'block', fontSize: 12.5, fontWeight: 600,
        color: focused ? '#a5b4fc' : C.textSecond,
        marginBottom: 8, letterSpacing: '0.02em',
        transition: 'color 0.2s',
      }}>
        {label}
      </label>
      <div style={{
        borderRadius: 12, padding: 1,
        background: focused
          ? 'linear-gradient(135deg, #4f46e5, #8b5cf6)'
          : 'rgba(255,255,255,0.1)',
        transition: 'background 0.25s',
        boxShadow: focused ? `0 0 0 4px ${C.inputGlow}` : 'none',
      }}>
        <input
          id={id} type={type} name={name}
          value={value} onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            display: 'block', width: '100%', boxSizing: 'border-box',
            padding: '12px 16px', borderRadius: 11,
            background: focused ? 'rgba(15,13,35,0.95)' : C.inputBg,
            border: 'none', outline: 'none',
            fontSize: 14, color: C.textPrimary,
            fontFamily: 'Inter, sans-serif',
            transition: 'background 0.25s',
          }}
          onMouseOver={(e) => !focused && (e.target.style.background = 'rgba(255,255,255,0.075)')}
          onMouseOut={(e) => !focused && (e.target.style.background = C.inputBg)}
        />
      </div>
    </div>
  )
}

// ── Primary button ────────────────────────────────────────────
function PrimaryButton({ children, onClick, disabled, loading }) {
  const [hovered, setHovered] = useState(false)
  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      whileTap={!disabled ? { scale: 0.97 } : {}}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: '100%', padding: '13px', borderRadius: 12, border: 'none',
        fontSize: 14, fontWeight: 700, color: 'white', cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'Inter, sans-serif', letterSpacing: '0.02em',
        background: disabled
          ? 'rgba(99,102,241,0.3)'
          : 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #4f46e5 100%)',
        backgroundSize: '200% auto',
        backgroundPosition: hovered ? 'right center' : 'left center',
        boxShadow: disabled ? 'none' : hovered
          ? '0 8px 30px rgba(99,102,241,0.55), 0 0 0 1px rgba(99,102,241,0.3)'
          : '0 4px 16px rgba(99,102,241,0.35)',
        transform: hovered && !disabled ? 'translateY(-2px)' : 'translateY(0)',
        transition: 'all 0.25s cubic-bezier(0.22, 1, 0.36, 1)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      }}
    >
      {loading && (
        <svg style={{ width: 16, height: 16, animation: 'spin 0.8s linear infinite' }} viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.25)" strokeWidth="3"/>
          <path d="M12 2a10 10 0 0 1 10 10" stroke="white" strokeWidth="3" strokeLinecap="round"/>
        </svg>
      )}
      {children}
    </motion.button>
  )
}

// ── Right auth card ───────────────────────────────────────────
function AuthCard() {
  const setAuth = useStore((s) => s.setAuth)
  const [mode, setMode]     = useState('login')
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState('')
  const [form, setForm]     = useState({ studentId: '', name: '', password: '' })

  function handleChange(e) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }))
    setError('')
  }

  async function handleSubmit(e) {
    e?.preventDefault()
    setLoading(true)
    setError('')
    try {
      const endpoint = mode === 'login' ? '/auth/login' : '/auth/register'
      const payload  = mode === 'login'
        ? { studentId: form.studentId, password: form.password }
        : { studentId: form.studentId, name: form.name, password: form.password }
      const { data } = await api.post(endpoint, payload)
      setAuth(data.user, data.token)
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const isEmpty = !form.studentId.trim() || !form.password.trim() ||
    (mode === 'register' && !form.name.trim())

  return (
    <div style={{
      width: '100%', maxWidth: 440,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '40px 32px',
    }}>
      <motion.div
        initial={{ opacity: 0, x: 40, scale: 0.96 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        style={{
          width: '100%',
          background: C.card,
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: `1px solid ${C.cardBorder}`,
          borderRadius: 24,
          padding: '36px 32px',
          boxShadow: '0 24px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)',
        }}
      >
        {/* Card header */}
        <div style={{ marginBottom: 32 }}>
          <h2 style={{
            fontSize: 22, fontWeight: 800, color: C.textPrimary,
            margin: '0 0 6px', letterSpacing: '-0.025em',
            fontFamily: 'Inter, sans-serif',
          }}>
            {mode === 'login' ? 'Welcome back' : 'Get started'}
          </h2>
          <p style={{ fontSize: 14, color: C.textSecond, margin: 0, fontFamily: 'Inter, sans-serif' }}>
            {mode === 'login'
              ? 'Sign in to get on the map'
              : 'Create your V-Nav account'}
          </p>
        </div>

        {/* Tab switcher */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          background: 'rgba(255,255,255,0.05)', borderRadius: 10,
          padding: 4, marginBottom: 28,
          border: '1px solid rgba(255,255,255,0.07)',
        }}>
          {['login', 'register'].map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setError('') }}
              style={{
                flex: 1, padding: '9px', borderRadius: 7, border: 'none',
                fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
                fontFamily: 'Inter, sans-serif',
                background: mode === m
                  ? 'rgba(255,255,255,0.1)'
                  : 'transparent',
                color: mode === m ? C.textPrimary : C.textSecond,
                boxShadow: mode === m ? '0 1px 4px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08)' : 'none',
                transition: 'all 0.2s',
              }}
            >
              {m === 'login' ? 'Sign In' : 'Register'}
            </button>
          ))}
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
        >
          <AnimatePresence mode="wait">
            {mode === 'register' && (
              <motion.div
                key="name-field"
                initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                animate={{ opacity: 1, height: 'auto', marginBottom: 0 }}
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                transition={{ duration: 0.25 }}
                style={{ overflow: 'hidden' }}
              >
                <Field
                  label="FULL NAME" id="name" name="name" type="text"
                  value={form.name} onChange={handleChange}
                  placeholder="Your display name"
                />
              </motion.div>
            )}
          </AnimatePresence>

          <Field
            label="STUDENT ID" id="studentId" name="studentId" type="text"
            value={form.studentId} onChange={handleChange}
            placeholder="e.g. 22BCE1234"
            autoComplete="username"
          />

          <Field
            label="PASSWORD" id="password" name="password" type="password"
            value={form.password} onChange={handleChange}
            placeholder={mode === 'register' ? 'Min 6 characters' : 'Your password'}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                style={{
                  background: C.errorBg, border: `1px solid ${C.errorBorder}`,
                  borderRadius: 10, padding: '10px 14px',
                  fontSize: 13, color: C.errorText,
                  display: 'flex', alignItems: 'flex-start', gap: 8,
                  fontFamily: 'Inter, sans-serif',
                }}
              >
                <svg width="14" height="14" style={{ marginTop: 1, flexShrink: 0 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          <div style={{ marginTop: 4 }}>
            <PrimaryButton
              onClick={handleSubmit}
              disabled={isEmpty || loading}
              loading={loading}
            >
              {loading
                ? 'Please wait…'
                : mode === 'login' ? 'Sign In →' : 'Create Account →'}
            </PrimaryButton>
          </div>
        </form>

        {/* Switch mode link */}
        <p style={{
          marginTop: 24, marginBottom: 0, textAlign: 'center',
          fontSize: 13.5, color: C.textSecond, fontFamily: 'Inter, sans-serif',
        }}>
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button
            onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}
            style={{
              border: 'none', cursor: 'pointer',
              fontSize: 13.5, fontWeight: 700, fontFamily: 'Inter, sans-serif',
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              padding: 0,
            }}
          >
            {mode === 'login' ? 'Register here' : 'Sign in'}
          </button>
        </p>

        {/* Footer */}
        <div style={{
          marginTop: 24, paddingTop: 20,
          borderTop: '1px solid rgba(255,255,255,0.07)',
          textAlign: 'center',
        }}>
          <span style={{ fontSize: 11.5, color: C.textMuted, fontFamily: 'Inter, sans-serif', letterSpacing: '0.02em' }}>
            VIT Chennai · Campus Social Navigation
          </span>
        </div>
      </motion.div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────
export default function Auth() {
  return (
    <div style={{
      minHeight: '100vh', background: C.bg,
      display: 'flex', alignItems: 'stretch',
      position: 'relative', overflow: 'hidden',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      <Blobs />

      {/* Left — branding (hidden on mobile) */}
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center',
        position: 'relative', zIndex: 1,
      }}
        className="auth-brand-panel"
      >
        <BrandPanel />
      </div>

      {/* Vertical divider */}
      <div style={{
        width: 1,
        background: 'linear-gradient(to bottom, transparent, rgba(255,255,255,0.07) 30%, rgba(255,255,255,0.07) 70%, transparent)',
        alignSelf: 'stretch', position: 'relative', zIndex: 1,
        flexShrink: 0,
      }}
        className="auth-divider"
      />

      {/* Right — auth card */}
      <div style={{
        width: '100%', maxWidth: 520,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative', zIndex: 1, flexShrink: 0,
      }}>
        <AuthCard />
      </div>

      {/* Responsive: hide left on small screens */}
      <style>{`
        @media (max-width: 768px) {
          .auth-brand-panel { display: none !important; }
          .auth-divider      { display: none !important; }
        }
      `}</style>
    </div>
  )
}
