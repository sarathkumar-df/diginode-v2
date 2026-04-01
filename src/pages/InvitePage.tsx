import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useIsAuthenticated } from '@azure/msal-react'
import { Layers, Users, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { loginRequest } from '@/auth/msalConfig'
import { msalInstance } from '@/auth/AuthProvider'

// Invite acceptance page — Phase 3 full implementation
// Phase 1: validates token exists, handles auth redirect, shows UI scaffold

type InviteStatus = 'loading' | 'valid' | 'invalid' | 'accepting' | 'accepted'

export function InvitePage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const isAuthenticated = useIsAuthenticated()
  const [status, setStatus] = useState<InviteStatus>('loading')
  const [teamName, setTeamName] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) { setStatus('invalid'); return }

    // Phase 3: validate token against POST /api/invites/:token
    // For now, simulate a valid invite
    const timer = setTimeout(() => {
      setTeamName('Your Team')
      setStatus('valid')
    }, 800)
    return () => clearTimeout(timer)
  }, [token])

  const handleAccept = async () => {
    if (!isAuthenticated) {
      // Sign in first, then come back to this URL
      try {
        await msalInstance.loginPopup({
          ...loginRequest,
          // After login, the page re-renders with isAuthenticated=true and the effect re-runs
        })
      } catch {
        setError('Sign in was cancelled. Please try again.')
      }
      return
    }

    setStatus('accepting')
    // Phase 3: call POST /api/invites/:token/accept
    setTimeout(() => setStatus('accepted'), 1000)
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-8 px-4"
      style={{ background: 'var(--canvas-bg)' }}
    >
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center">
          <Layers size={16} color="white" />
        </div>
        <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>DigoNode</span>
      </div>

      <div
        className="w-full max-w-sm rounded-2xl border p-8 flex flex-col items-center gap-5 text-center"
        style={{ background: 'var(--panel-bg)', borderColor: 'var(--panel-border)', boxShadow: '0 8px 32px rgba(0,0,0,0.10)' }}
      >
        {status === 'loading' && (
          <>
            <Loader2 size={32} className="animate-spin" style={{ color: 'var(--brand)' }} />
            <p style={{ color: 'var(--text-secondary)' }}>Validating invite…</p>
          </>
        )}

        {status === 'invalid' && (
          <>
            <AlertCircle size={32} style={{ color: '#ef4444' }} />
            <div>
              <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>Invalid invite</p>
              <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                This invite link is invalid or has expired. Ask your team admin for a new one.
              </p>
            </div>
            <button
              onClick={() => navigate('/dashboard')}
              className="text-sm font-medium"
              style={{ color: 'var(--brand)' }}
            >
              Go to dashboard
            </button>
          </>
        )}

        {(status === 'valid' || status === 'accepting') && (
          <>
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'var(--brand-light)' }}>
              <Users size={24} style={{ color: 'var(--brand)' }} />
            </div>
            <div>
              <p className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>
                You've been invited
              </p>
              <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                Join <strong style={{ color: 'var(--text-primary)' }}>{teamName}</strong> on DigoNode
              </p>
            </div>
            {error && <p className="text-xs text-red-500">{error}</p>}
            <button
              onClick={handleAccept}
              disabled={status === 'accepting'}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-90 disabled:opacity-60"
              style={{ background: 'var(--brand)', color: 'white' }}
            >
              {status === 'accepting' ? <Loader2 size={14} className="animate-spin" /> : null}
              {isAuthenticated ? 'Accept & join team' : 'Sign in to accept'}
            </button>
          </>
        )}

        {status === 'accepted' && (
          <>
            <CheckCircle size={36} style={{ color: '#22c55e' }} />
            <div>
              <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>You're in!</p>
              <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                You've joined <strong>{teamName}</strong>.
              </p>
            </div>
            <button
              onClick={() => navigate('/teams')}
              className="text-sm font-medium"
              style={{ color: 'var(--brand)' }}
            >
              Go to Teams →
            </button>
          </>
        )}
      </div>
    </div>
  )
}
