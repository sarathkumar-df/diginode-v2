import { useNavigate } from 'react-router-dom'
import { useMsal } from '@azure/msal-react'
import { useCurrentUser } from '@/auth/AuthProvider'
import { Layers, Users, LogOut, Map as MapIcon, ArrowLeft } from 'lucide-react'

// Teams page — Phase 3 implementation
// This is a scaffold showing the correct layout; full functionality added in Phase 3

export function TeamsPage() {
  const { instance } = useMsal()
  const user = useCurrentUser()
  const navigate = useNavigate()

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--canvas-bg)' }}>
      {/* Top nav */}
      <header
        className="h-14 border-b flex items-center justify-between px-6 flex-shrink-0"
        style={{ background: 'var(--panel-bg)', borderColor: 'var(--panel-border)' }}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-indigo-500 flex items-center justify-center">
            <Layers size={14} color="white" />
          </div>
          <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
            DigoNode
          </span>
        </div>
        <nav className="flex items-center gap-1">
          <NavLink icon={MapIcon} label="My Maps" onClick={() => navigate('/dashboard')} />
          <NavLink icon={Users} label="Teams" onClick={() => navigate('/teams')} active />
        </nav>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-semibold">
            {user?.name?.charAt(0).toUpperCase() ?? '?'}
          </div>
          <button
            onClick={() => instance.logoutPopup()}
            title="Sign out"
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
            style={{ color: 'var(--text-muted)' }}
          >
            <LogOut size={14} />
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8">
        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-1.5 text-sm mb-6 transition-colors hover:opacity-80"
          style={{ color: 'var(--text-secondary)' }}
        >
          <ArrowLeft size={14} />
          Back to maps
        </button>

        <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Teams</h1>
        <p className="text-sm mb-8" style={{ color: 'var(--text-muted)' }}>
          Teams and sharing features are coming in Phase 3.
        </p>

        <div
          className="rounded-2xl border p-10 flex flex-col items-center gap-4 text-center"
          style={{ background: 'var(--panel-bg)', borderColor: 'var(--panel-border)' }}
        >
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ background: 'var(--brand-light)' }}
          >
            <Users size={24} style={{ color: 'var(--brand)' }} />
          </div>
          <div>
            <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>
              Teams are coming soon
            </p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
              Create teams, invite members, and share mind maps with your colleagues.
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}

function NavLink({ icon: Icon, label, onClick, active }: {
  icon: React.ElementType
  label: string
  onClick: () => void
  active?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
      style={{
        background: active ? 'var(--brand-light)' : 'transparent',
        color: active ? 'var(--brand)' : 'var(--text-secondary)',
      }}
    >
      <Icon size={13} />
      {label}
    </button>
  )
}
