import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useStore } from './store/useStore'
import Auth from './pages/Auth'
import Dashboard from './pages/Dashboard'
import Sidebar from './components/ui/Sidebar'
import MapPage from './pages/MapPage'
import HeatmapPage from './pages/HeatmapPage'
import NavigationPage from './pages/NavigationPage'
import ExplorePage from './pages/ExplorePage'
import EventsPage from './pages/EventsPage'

/**
 * MapLayout — fixed dark Sidebar + routed map page.
 * Mounted at /app/* so nested relative routes resolve correctly.
 * Routes: /app/map  /app/heatmap  /app/navigation  /app/explore  /app/events
 */
function MapLayout() {
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-main">
        <Routes>
          <Route index             element={<Navigate to="map" replace />} />
          <Route path="map"        element={<MapPage />} />
          <Route path="heatmap"    element={<HeatmapPage />} />
          <Route path="navigation" element={<NavigationPage />} />
          <Route path="explore"    element={<ExplorePage />} />
          <Route path="events"     element={<EventsPage />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  const token = useStore((s) => s.token)
  const user  = useStore((s) => s.user)

  return (
    <BrowserRouter>
      <Routes>
        {/* Not authenticated → Auth screen on every route */}
        {(!token || !user) ? (
          <Route path="*" element={<Auth />} />
        ) : (
          <>
            {/* Dashboard (social map) — root */}
            <Route path="/" element={<Dashboard />} />
            {/* Map feature pages — mounted at /app/* so child routes resolve */}
            <Route path="/app/*" element={<MapLayout />} />
            {/* Catch-all redirect to dashboard */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        )}
      </Routes>
    </BrowserRouter>
  )
}
