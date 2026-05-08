import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useIsAuthenticated } from '@azure/msal-react'
import { Layers, Users, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { loginRequest } from '@/auth/msalConfig'
import { msalInstance } from '@/auth/AuthProvider'
import { fetchInvite, acceptInvite } from '@/services/teamService'
import { InviteInfo } from '@/types'
import { toast } from '@/store/toastStore'

type InviteStatus = 'loading' | 'valid' | 'invalid' | 'accepting' | 'accepted'

export function InvitePage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const isAuthenticated = useIsAuthenticated()
  const [status, setStatus] = useState<InviteStatus>('loading')
  const [invite, setInvite] = useState<InviteInfo | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) { setStatus('invalid'); return }

    fetchInvite(token)
      .then((data) => { setInvite(data); setStatus('valid') })
      .catch(() => setStatus('invalid'))
  }, [token])

  const handleAccept = async () => {
    if (!token) return

    if (!isAuthenticated) {
      try {
        await msalInstance.loginRedirect({ ...loginRequest, redirectStartPage: window.location.href })
      } catch {
        setError('Sign in was cancelled. Please try again.')
      }
      return
    }

    setStatus('accepting')
    setError('')
    try {
      await acceptInvite(token)
      setStatus('accepted')
      toast.success({ title: 'Joined team', description: invite ? `You're in ${invite.teamName}.` : undefined })
    } catch {
      setError('Failed to accept invite. It may have expired.')
      setStatus('valid')
      toast.error({ title: 'Couldn’t accept invite', description: 'It may have expired.' })
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-8 px-4"
      style={{ background: 'var(--canvas-bg)' }}
    >
      {/* Brand */}
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center">
          <Layers size={16} color="white" />
        </div>
        <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>DigiNode</span>
      </div>

      <div
        className="w-full max-w-sm rounded-2xl border p-8 flex flex-col items-center gap-5 text-center"
        style={{
          background: 'var(--panel-bg)',
          borderColor: 'var(--panel-border)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.10)',
        }}
      >
        {status === 'loading' && (
          <>
            <Loader2 size={32} className="animate-spin" style={{ color: 'var(--brand)' }} />
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Validating invite…</p>
          </>
        )}

        {status === 'invalid' && (
          <>
            <AlertCircle size={32} style={{ color: '#ef4444' }} />
            <div>
              <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>Invalid invite</p>
              <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                This invite link is invalid or has expired. Ask your team owner for a new one.
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

        {(status === 'valid' || status === 'accepting') && invite && (
          <>
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ background: 'var(--brand-light)' }}
            >
              <Users size={24} style={{ color: 'var(--brand)' }} />
            </div>
            <div>
              <p className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>
                You've been invited
              </p>
              <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                Join <strong style={{ color: 'var(--text-primary)' }}>{invite.teamName}</strong> on DigiNode
              </p>
              <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
                {invite.memberCount} member{invite.memberCount !== 1 ? 's' : ''} already inside
              </p>
            </div>
            {error && <p className="text-xs text-red-500">{error}</p>}
            <button
              onClick={handleAccept}
              disabled={status === 'accepting'}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-90 disabled:opacity-60"
              style={{ background: 'var(--brand)', color: 'white' }}
            >
              {status === 'accepting' && <Loader2 size={14} className="animate-spin" />}
              {isAuthenticated ? 'Accept & join team' : 'Sign in to accept'}
            </button>
          </>
        )}

        {status === 'accepted' && invite && (
          <>
            <CheckCircle size={36} style={{ color: '#22c55e' }} />
            <div>
              <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>You're in!</p>
              <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                You've joined <strong style={{ color: 'var(--text-primary)' }}>{invite.teamName}</strong>.
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
