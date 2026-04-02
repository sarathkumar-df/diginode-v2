import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useIsAuthenticated } from '@azure/msal-react'
import { Layers, Loader2 } from 'lucide-react'
import { loginRequest } from '@/auth/msalConfig'
import { msalInstance } from '@/auth/AuthProvider'

export function SignInPage() {
  const isAuthenticated = useIsAuthenticated()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // If already signed in, send to dashboard
  useEffect(() => {
    if (isAuthenticated) navigate('/dashboard', { replace: true })
  }, [isAuthenticated, navigate])

  const handleSignIn = async () => {
    if (loading) return
    setLoading(true)
    setError('')
    try {
      // Redirect flow: navigates away to Microsoft login, returns to redirectUri
      // More reliable than popup (can't be blocked by browser)
      await msalInstance.loginRedirect(loginRequest)
    } catch (err: any) {
      console.error('Sign in failed', err)
      setError('Sign in failed. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-10 px-4"
      style={{ background: 'var(--canvas-bg)' }}
    >
      <div className="flex flex-col items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-indigo-500 flex items-center justify-center shadow-lg">
          <Layers size={28} color="white" />
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            DigiNode
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            AI-powered mind mapping
          </p>
        </div>
      </div>

      <div
        className="w-full max-w-sm rounded-2xl border p-8 flex flex-col gap-6"
        style={{
          background: 'var(--panel-bg)',
          borderColor: 'var(--panel-border)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.10)',
        }}
      >
        <div>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            Sign in to your account
          </h2>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Use your Microsoft work or school account
          </p>
        </div>

        <button
          onClick={handleSignIn}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium transition-all duration-150 disabled:opacity-60"
          style={{
            background: 'var(--canvas-bg)',
            borderColor: 'var(--panel-border)',
            color: 'var(--text-primary)',
          }}
          onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = 'var(--brand-light)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--canvas-bg)' }}
        >
          {loading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <svg width="16" height="16" viewBox="0 0 21 21" fill="none">
              <rect x="1" y="1" width="9" height="9" fill="#F25022" />
              <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
              <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
              <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
            </svg>
          )}
          {loading ? 'Redirecting to Microsoft…' : 'Continue with Microsoft'}
        </button>

        {error && <p className="text-xs text-red-500 text-center">{error}</p>}

        <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
          By signing in, you agree to our terms of service and privacy policy.
        </p>
      </div>
    </div>
  )
}
