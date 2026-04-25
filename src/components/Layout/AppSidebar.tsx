/**
 * AppSidebar — shared sidebar used by Dashboard and TeamsPage.
 * Fixed 240px width, always visible.
 */
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Layers, Map as MapIcon, Users, Clock } from 'lucide-react'
import { UserMenu } from '@/components/Layout/UserMenu'
import { LoadingShell } from '@/components/UI/LoadingShell'
import { useMindMapStore } from '@/store/mindmapStore'

type ActiveTab = 'maps' | 'teams'

interface Props {
  activeTab: ActiveTab
  /** When true, render shadow-render skeletons in place of the Recent list. */
  loading?: boolean
}

const RECENT_LIMIT = 5

// Stub recent items used to shadow-render the skeleton — same shape as real
// items so LoadingShell's CSS can mask them into pulsing blocks.
const SKELETON_RECENT = Array.from({ length: RECENT_LIMIT }, (_, i) => ({
  id: `skel-recent-${i}`,
  title: 'Loading map title',
  rootColor: '#4F46E5',
}))

export function AppSidebar({ activeTab, loading = false }: Props) {
  const navigate = useNavigate()
  const maps = useMindMapStore((s) => s.maps)

  // Top N most recently edited maps. Pulled from store rather than fetching
  // separately — Dashboard already populates this via setMapList.
  const recentMaps = useMemo(
    () =>
      [...maps]
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, RECENT_LIMIT),
    [maps]
  )

  // Three states:
  //   loading     → render stub items inside LoadingShell (mask into pulse)
  //   has maps    → render real recent list
  //   empty       → hide section entirely (true first-time user)
  const showRecent = loading || recentMaps.length > 0
  const visibleRecent = loading ? SKELETON_RECENT : recentMaps

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

      {/* Workspace nav */}
      <nav className="flex flex-col gap-0.5 px-3 pt-4 flex-shrink-0">
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

      {/* Recent — fills the previously-empty space below Workspace nav.
          Renders during loading too (with stub items + LoadingShell mask)
          so the rail doesn't pop in once the API call resolves. */}
      {showRecent && (
        <div className="flex flex-col flex-1 min-h-0 px-3 pt-5 overflow-hidden">
          <div className="flex items-center justify-between px-3 mb-2 flex-shrink-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
              Recent
            </p>
            <Clock size={10} style={{ color: 'var(--text-muted)' }} />
          </div>
          <LoadingShell loading={loading}>
            <div className="flex flex-col gap-0.5 overflow-y-auto -mr-1 pr-1">
              {visibleRecent.map((m) => (
                <RecentMapItem
                  key={m.id}
                  title={m.title}
                  color={m.rootColor ?? '#4F46E5'}
                  onClick={loading ? () => {} : () => navigate(`/map/${m.id}`)}
                />
              ))}
            </div>
          </LoadingShell>
        </div>
      )}

      {/* Spacer when Recent is hidden — keeps UserMenu pinned to bottom */}
      {!showRecent && <div className="flex-1" />}

      {/* Keyboard shortcuts cheatsheet — quietly teaches power-user habits */}
      <div
        className="mx-3 mb-3 mt-3 px-3 py-2.5 rounded-xl border flex-shrink-0"
        style={{ background: 'var(--surface-well)', borderColor: 'transparent' }}
      >
        <p className="text-[9px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>
          Quick keys
        </p>
        <div className="flex flex-col gap-1">
          <ShortcutRow keyHint="N" label="New map" />
          <ShortcutRow keyHint="/" label="Search" />
          <ShortcutRow keyHint="G" label="Generate" />
        </div>
      </div>

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

const DEFAULT_TITLE = 'New Mind Map'

function RecentMapItem({
  title,
  color,
  onClick,
}: {
  title: string
  color: string
  onClick: () => void
}) {
  const display = title === DEFAULT_TITLE ? '(Untitled)' : title
  const isUntitled = title === DEFAULT_TITLE
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2.5 w-full px-3 py-1.5 rounded-lg text-left transition-colors"
      style={{ background: 'transparent' }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--canvas-bg)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ background: color }}
      />
      <span
        className="text-[13px] truncate"
        style={{ color: isUntitled ? 'var(--text-muted)' : 'var(--text-secondary)' }}
        title={display}
      >
        {display}
      </span>
    </button>
  )
}

function ShortcutRow({ keyHint, label }: { keyHint: string; label: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <kbd
        className="text-[10px] font-mono px-1.5 py-0.5 rounded border min-w-[20px] text-center"
        style={{
          background: 'var(--panel-bg)',
          borderColor: 'var(--panel-border)',
          color: 'var(--text-secondary)',
        }}
      >
        {keyHint}
      </kbd>
    </div>
  )
}
