import { useState } from 'react'
import { useAuthStore } from '../../stores/authStore.js'

function messageFor(err) {
  switch (err.code) {
    case 'INVALID_CREDENTIALS':
      return 'That email or password is not right.'
    case 'ACCOUNT_LOCKED': {
      const minutes = err.retryAfter ? Math.ceil(err.retryAfter / 60) : null
      return minutes ? `Too many attempts. Try again in about ${minutes} min.` : 'Too many attempts. Try again later.'
    }
    case 'EMAIL_NOT_VERIFIED':
      return 'Verify your email before signing in.'
    case 'ACCOUNT_SUSPENDED':
      return 'This account is suspended.'
    case 'RATE_LIMITED':
      return 'Too many requests. Wait a moment and try again.'
    case 'VALIDATION_ERROR':
      return 'Enter your VIT email and password.'
    default:
      return err.message || 'Could not sign in. Try again.'
  }
}

/** Sign-in. Registration, email verification and password reset screens arrive in Phase 7. */
export default function Login() {
  const login = useAuthStore((s) => s.login)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await login(email.trim(), password)
    } catch (err) {
      setError(messageFor(err))
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow-lg ring-1 ring-slate-200" noValidate>
        <div>
          <h1 className="text-xl font-bold text-brand-700">V-Nav</h1>
          <p className="text-sm text-slate-500">Sign in with your VIT student email.</p>
        </div>

        <label className="block text-sm font-medium text-slate-700">
          Email
          <input
            type="email"
            name="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        <label className="block text-sm font-medium text-slate-700">
          Password
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || !email || !password}
          className="w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
