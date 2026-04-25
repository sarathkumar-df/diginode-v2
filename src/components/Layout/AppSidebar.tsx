/**
 * AppSidebar — shared sidebar used by Dashboard and TeamsPage.
 * Fixed 240px width, always visible.
 */
import { useNavigate } from 'react-router-dom'
import { Layers, Map as MapIcon, Users } from 'lucide-react'
import { UserMenu } from '@/components/Layout/UserMenu'

type ActiveTab = 'maps' | 'teams'

interface Props {
  activeTab: ActiveTab
}

export function AppSidebar({ activeTab }: Props) {
  const navigate = useNavigate()

  return (
    <aside
      className="flex flex-col flex-shrink-0 border-r h-full"
      style={{ width: 240, background: 'var(--panel-bg)', borderColor: 'var(--panel-border)' }}
    >
      {/* Brand — clicking takes the user back to the dashboard */}
      <button
        onClick={() => navigate('/dashboard')}
        title="Go to dashboard"
        className="flex items-center gap-2.5 px-5 h-14 flex-shrink-0 border-b w-full text-left transition-colors"
        style={{ borderColor: 'var(--panel-border)', background: 'transparent' }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--canvas-bg)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
      >
        <div className="w-7 h-7 rounded-lg bg-indigo-500 flex items-center justify-center shadow-sm flex-shrink-0">
          <Layers size={14} color="white" />
        </div>
        <span className="font-bold text-sm tracking-tight" style={{ color: 'var(--text-primary)' }}>DigiNode</span>
      </button>

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

      {/* User menu — click the card to open Sign out */}
      <div className="px-3 pb-4 flex-shrink-0">
        <UserMenu variant="card" />
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
