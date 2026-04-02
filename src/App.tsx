import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useIsAuthenticated, useMsal } from '@azure/msal-react'
import { InteractionStatus } from '@azure/msal-browser'
import { MapPage } from '@/pages/MapPage'
import { Dashboard } from '@/pages/Dashboard'
import { TeamsPage } from '@/pages/TeamsPage'
import { InvitePage } from '@/pages/InvitePage'
import { SignInPage } from '@/pages/SignInPage'

// ── Protected route wrapper ───────────────────────────────────────────────────
// Waits for MSAL to finish its startup interaction before deciding to redirect,
// preventing a false-unauthenticated flicker on page refresh that would lose
// the current URL. Passes the intended URL as state so SignInPage can restore it.

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useIsAuthenticated()
  const { inProgress } = useMsal()
  const location = useLocation()

  // MSAL is still initializing — don't redirect yet or we'll lose the URL
  if (inProgress !== InteractionStatus.None) return null

  if (!isAuthenticated) {
    return <Navigate to="/sign-in" state={{ from: location.pathname }} replace />
  }
  return <>{children}</>
}

// ── App router ────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/sign-in" element={<SignInPage />} />
      <Route path="/invite/:token" element={<InvitePage />} />

      {/* Protected */}
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/map/:mapId" element={<ProtectedRoute><MapPage /></ProtectedRoute>} />
      <Route path="/teams" element={<ProtectedRoute><TeamsPage /></ProtectedRoute>} />

      {/* Default: authenticated → dashboard, unauthenticated → sign-in */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
