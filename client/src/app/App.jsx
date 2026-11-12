import { lazy, Suspense, useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore.js'
import './app.css'

// The map shell (and Mapbox with it) loads only after sign-in.
const AppShell = lazy(() => import('../layouts/AppShell.jsx'))
const MapHome = lazy(() => import('../pages/MapHome.jsx'))
const Login = lazy(() => import('../pages/auth/Login.jsx'))

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true } },
})

function FullScreenMessage({ children }) {
  return (
    <div role="status" className="flex h-full items-center justify-center text-sm text-slate-500">
      {children}
    </div>
  )
}

/** Providers and routes only. */
export default function App() {
  const status = useAuthStore((s) => s.status)
  const bootstrap = useAuthStore((s) => s.bootstrap)

  useEffect(() => {
    bootstrap()
  }, [bootstrap])

  if (status === 'unknown') return <FullScreenMessage>Loading V-Nav…</FullScreenMessage>

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Suspense fallback={<FullScreenMessage>Loading…</FullScreenMessage>}>
          <Routes>
            {status === 'signed_in' ? (
              <>
                <Route element={<AppShell />}>
                  <Route index element={<MapHome />} />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </>
            ) : (
              <>
                <Route path="/login" element={<Login />} />
                <Route path="*" element={<Navigate to="/login" replace />} />
              </>
            )}
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
