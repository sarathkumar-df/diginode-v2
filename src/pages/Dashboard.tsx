import { useNavigate } from 'react-router-dom'
import { useMsal } from '@azure/msal-react'
import { useCurrentUser } from '@/auth/AuthProvider'
import { useMindMapStore } from '@/store/mindmapStore'
import {
  Plus, Layers, Map as MapIcon, LogOut, Settings,
  Clock, Users, ChevronRight,
} from 'lucide-react'

// ── Top nav ───────────────────────────────────────────────────────────────────

function TopNav() {
  const { instance } = useMsal()
  const user = useCurrentUser()
  const navigate = useNavigate()

  const handleSignOut = () => {
    instance.logoutPopup()
  }

  return (
    <header
      className="h-14 border-b flex items-center justify-between px-6 flex-shrink-0"
      style={{ background: 'var(--panel-bg)', borderColor: 'var(--panel-border)' }}
    >
      {/* Brand */}
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-lg bg-indigo-500 flex items-center justify-center">
          <Layers size={14} color="white" />
        </div>
        <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
          DigoNode
        </span>
      </div>

      {/* Nav links */}
      <nav className="flex items-center gap-1">
        <NavLink icon={MapIcon} label="My Maps" onClick={() => navigate('/dashboard')} active />
        <NavLink icon={Users} label="Teams" onClick={() => navigate('/teams')} />
      </nav>

      {/* User menu */}
      <div className="flex items-center gap-3">
        <div className="text-right hidden sm:block">
          <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{user?.name}</p>
          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{user?.email}</p>
        </div>
        <div
          className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0"
        >
          {user?.name?.charAt(0).toUpperCase() ?? '?'}
        </div>
        <button
          onClick={handleSignOut}
          title="Sign out"
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
          style={{ color: 'var(--text-muted)' }}
        >
          <LogOut size={14} />
        </button>
      </div>
    </header>
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

// ── Map card ──────────────────────────────────────────────────────────────────

function MapCard({ id, title, updatedAt }: { id: string; title: string; updatedAt: string }) {
  const navigate = useNavigate()

  const relativeTime = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  }

  return (
    <button
      onClick={() => navigate(`/map/${id}`)}
      className="group relative flex flex-col gap-3 p-4 rounded-2xl border text-left transition-all duration-150 hover:shadow-md"
      style={{
        background: 'var(--panel-bg)',
        borderColor: 'var(--panel-border)',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--brand)' }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--panel-border)' }}
    >
      {/* Preview placeholder */}
      <div
        className="w-full h-28 rounded-xl flex items-center justify-center"
        style={{ background: 'var(--canvas-bg)' }}
      >
        <MapIcon size={28} style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
      </div>

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
            {title}
          </p>
          <p className="text-[11px] flex items-center gap-1 mt-0.5" style={{ color: 'var(--text-muted)' }}>
            <Clock size={10} />
            {relativeTime(updatedAt)}
          </p>
        </div>
        <ChevronRight
          size={14}
          className="flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ color: 'var(--brand)' }}
        />
      </div>
    </button>
  )
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────

export function Dashboard() {
  const navigate = useNavigate()
  const { maps, createMap } = useMindMapStore()
  const user = useCurrentUser()

  const handleNewMap = () => {
    // Phase 2: will call POST /api/maps and navigate to the new ID
    // For now, create locally and navigate to the new map's ID
    createMap()
    const newId = useMindMapStore.getState().activeMapId
    if (newId) navigate(`/map/${newId}`)
  }

  const sortedMaps = [...maps].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--canvas-bg)' }}>
      <TopNav />

      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8">
        {/* Header row */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
              {user ? `Welcome back, ${user.name.split(' ')[0]}` : 'My Maps'}
            </h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {sortedMaps.length} map{sortedMaps.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={handleNewMap}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-150 hover:opacity-90"
            style={{ background: 'var(--brand)', color: 'white' }}
          >
            <Plus size={15} />
            New Map
          </button>
        </div>

        {/* Map grid */}
        {sortedMaps.length === 0 ? (
          <EmptyState onNew={handleNewMap} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {sortedMaps.map((map) => (
              <MapCard key={map.id} id={map.id} title={map.title} updatedAt={map.updatedAt} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-5">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{ background: 'var(--brand-light)' }}
      >
        <MapIcon size={28} style={{ color: 'var(--brand)' }} />
      </div>
      <div className="text-center">
        <p className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>
          No maps yet
        </p>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          Create your first mind map to get started
        </p>
      </div>
      <button
        onClick={onNew}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity"
        style={{ background: 'var(--brand)', color: 'white' }}
      >
        <Plus size={14} />
        Create your first map
      </button>
    </div>
  )
}
