/**
 * AppSidebar — shared sidebar used by Dashboard and TeamsPage.
 * Fixed 240px width, always visible.
 */
import { useNavigate } from 'react-router-dom'
import { useMsal } from '@azure/msal-react'
import { useCurrentUser } from '@/auth/AuthProvider'
import { Layers, Map as MapIcon, Users, LogOut } from 'lucide-react'

type ActiveTab = 'maps' | 'teams'

interface Props {
  activeTab: ActiveTab
}

export function AppSidebar({ activeTab }: Props) {
  const navigate = useNavigate()
  const { instance } = useMsal()
  const user = useCurrentUser()

  return (
    <aside
      className="flex flex-col flex-shrink-0 border-r h-full"
      style={{ width: 240, background: 'var(--panel-bg)', borderColor: 'var(--panel-border)' }}
    >
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-5 h-14 flex-shrink-0 border-b" style={{ borderColor: 'var(--panel-border)' }}>
        <div className="w-7 h-7 rounded-lg bg-indigo-500 flex items-center justify-center shadow-sm flex-shrink-0">
          <Layers size={14} color="white" />
        </div>
        <span className="font-bold text-sm tracking-tight" style={{ color: 'var(--text-primary)' }}>DigiNode</span>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-0.5 px-3 pt-4 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-widest px-3 mb-2" style={{ color: 'var(--text-muted)' }}>
          Workspace
        </p>
        <NavItem
          icon={MapIcon}
          label="My Maps"
          active={activeTab === 'maps'}
          onClick={() => navigate('/dashboard')}
        />
        <NavItem
          icon={Users}
          label="Teams"
          active={activeTab === 'teams'}
          onClick={() => navigate('/teams')}
        />
      </nav>

      {/* User card */}
      <div className="px-3 pb-4 flex-shrink-0">
        <div
          className="flex items-center gap-3 px-3 py-3 rounded-2xl"
          style={{ background: 'var(--canvas-bg)' }}
        >
          <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {user?.name?.charAt(0).toUpperCase() ?? '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
              {user?.name}
            </p>
            <p className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>
              {user?.email}
            </p>
          </div>
          <button
            onClick={() => instance.logoutPopup()}
            title="Sign out"
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-red-50 dark:hover:bg-red-900/20 flex-shrink-0"
            style={{ color: 'var(--text-muted)' }}
          >
            <LogOut size={13} />
          </button>
        </div>
      </div>
    </aside>
  )
}

function NavItem({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: React.ElementType
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-left transition-all duration-150"
      style={{
        background: active ? 'var(--brand-light)' : 'transparent',
        color: active ? 'var(--brand)' : 'var(--text-secondary)',
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--canvas-bg)' }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent' }}
    >
      <Icon size={15} style={{ flexShrink: 0 }} />
      {label}
    </button>
  )
}
