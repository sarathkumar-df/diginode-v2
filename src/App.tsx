import { Routes, Route, Navigate } from 'react-router-dom'
import { useIsAuthenticated } from '@azure/msal-react'
import { MapPage } from '@/pages/MapPage'
import { Dashboard } from '@/pages/Dashboard'
import { TeamsPage } from '@/pages/TeamsPage'
import { InvitePage } from '@/pages/InvitePage'
import { SignInPage } from '@/pages/SignInPage'

// ── Protected route wrapper ───────────────────────────────────────────────────
// Redirects unauthenticated users to /sign-in, preserving the intended URL

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useIsAuthenticated()
  if (!isAuthenticated) return <Navigate to="/sign-in" replace />
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
