import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMsal } from '@azure/msal-react'
import { useCurrentUser } from '@/auth/AuthProvider'
import { useMindMapStore, createDefaultMapData } from '@/store/mindmapStore'
import { upsertUser, listMaps, createMap, deleteMap } from '@/services/mapService'
import { listSharedMaps } from '@/services/shareService'
import { MapMeta, SharedMapMeta } from '@/types'
import {
  Plus, Layers, Map as MapIcon, LogOut,
  Clock, Users, ChevronRight, Trash2, Loader2, Share2,
} from 'lucide-react'

// ── Top nav ───────────────────────────────────────────────────────────────────

function TopNav() {
  const { instance } = useMsal()
  const user = useCurrentUser()
  const navigate = useNavigate()

  return (
    <header
      className="h-14 border-b flex items-center justify-between px-6 flex-shrink-0"
      style={{ background: 'var(--panel-bg)', borderColor: 'var(--panel-border)' }}
    >
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-lg bg-indigo-500 flex items-center justify-center">
          <Layers size={14} color="white" />
        </div>
        <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
          DigiNode
        </span>
      </div>

      <nav className="flex items-center gap-1">
        <NavLink icon={MapIcon} label="My Maps" onClick={() => navigate('/dashboard')} active />
        <NavLink icon={Users} label="Teams" onClick={() => navigate('/teams')} />
      </nav>

      <div className="flex items-center gap-3">
        <div className="text-right hidden sm:block">
          <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{user?.name}</p>
          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{user?.email}</p>
        </div>
        <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ── Map card ──────────────────────────────────────────────────────────────────

function MapCard({ map, onDelete }: { map: MapMeta; onDelete: (id: string) => void }) {
  const navigate = useNavigate()
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm(`Delete "${map.title}"? This cannot be undone.`)) return
    setDeleting(true)
    try {
      await deleteMap(map.id)
      onDelete(map.id)
    } catch {
      setDeleting(false)
    }
  }

  return (
    <button
      onClick={() => navigate(`/map/${map.id}`)}
      disabled={deleting}
      className="group relative flex flex-col gap-3 p-4 rounded-2xl border text-left transition-all duration-150 hover:shadow-md disabled:opacity-50"
      style={{ background: 'var(--panel-bg)', borderColor: 'var(--panel-border)' }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--brand)' }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--panel-border)' }}
    >
      <div className="w-full h-28 rounded-xl flex items-center justify-center relative" style={{ background: 'var(--canvas-bg)' }}>
        <div className="w-3 h-3 rounded-full" style={{ background: map.rootColor ?? '#6366f1', boxShadow: `0 0 12px ${map.rootColor ?? '#6366f1'}44` }} />
        <button
          onClick={handleDelete}
          className="absolute top-2 right-2 w-6 h-6 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50 dark:hover:bg-red-900/30"
          style={{ color: 'var(--text-muted)' }}
          title="Delete map"
        >
          <Trash2 size={11} className="text-red-400" />
        </button>
      </div>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{map.title}</p>
          <p className="text-[11px] flex items-center gap-1 mt-0.5" style={{ color: 'var(--text-muted)' }}>
            <Clock size={10} />{relativeTime(map.updatedAt)}
          </p>
        </div>
        <ChevronRight size={14} className="flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--brand)' }} />
      </div>
    </button>
  )
}

// ── Shared map card ───────────────────────────────────────────────────────────

function SharedMapCard({ map }: { map: SharedMapMeta }) {
  const navigate = useNavigate()
  return (
    <button
      onClick={() => navigate(`/map/${map.id}`)}
      className="group flex flex-col gap-3 p-4 rounded-2xl border text-left transition-all duration-150 hover:shadow-md"
      style={{ background: 'var(--panel-bg)', borderColor: 'var(--panel-border)' }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--brand)' }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--panel-border)' }}
    >
      <div className="w-full h-28 rounded-xl flex items-center justify-center relative" style={{ background: 'var(--canvas-bg)' }}>
        <div className="w-3 h-3 rounded-full" style={{ background: map.rootColor ?? '#6366f1', boxShadow: `0 0 12px ${map.rootColor ?? '#6366f1'}44` }} />
        <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md text-[10px] font-medium" style={{ background: 'var(--brand-light)', color: 'var(--brand)' }}>
          {map.permission === 'edit' ? 'Can edit' : 'View only'}
        </div>
      </div>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{map.title}</p>
          <p className="text-[11px] flex items-center gap-1 mt-0.5" style={{ color: 'var(--text-muted)' }}>
            <Share2 size={10} />by {map.ownerName} · {relativeTime(map.updatedAt)}
          </p>
        </div>
        <ChevronRight size={14} className="flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--brand)' }} />
      </div>
    </button>
  )
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export function Dashboard() {
  const navigate = useNavigate()
  const user = useCurrentUser()
  const { setMapList, addMapToList, removeMap } = useMindMapStore()
  const [maps, setMaps] = useState<MapMeta[]>([])
  const [sharedMaps, setSharedMaps] = useState<SharedMapMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  // On mount: register user in DB, then load their maps + shared maps
  useEffect(() => {
    let cancelled = false
    async function init() {
      try {
        await upsertUser()
        const [myMaps, shared] = await Promise.all([listMaps(), listSharedMaps()])
        if (!cancelled) {
          setMaps(myMaps)
          setMapList(myMaps)
          setSharedMaps(shared)
        }
      } catch {
        if (!cancelled) setError('Failed to load maps. Please refresh.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    init()
    return () => { cancelled = true }
  }, [])

  const handleNewMap = async () => {
    if (creating) return
    setCreating(true)
    try {
      const { id, title, nodes, edges } = createDefaultMapData()
      await createMap(id, title, nodes, edges)
      const meta: MapMeta = {
        id,
        title,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        rootColor: '#6366f1',
      }
      addMapToList(meta)
      navigate(`/map/${id}`)
    } catch {
      setCreating(false)
    }
  }

  const handleDelete = (id: string) => {
    setMaps((prev) => prev.filter((m) => m.id !== id))
    removeMap(id)
  }

  const sortedMaps = [...maps].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--canvas-bg)' }}>
      <TopNav />

      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
              {user ? `Welcome back, ${user.name.split(' ')[0]}` : 'My Maps'}
            </h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {loading ? 'Loading…' : `${sortedMaps.length} map${sortedMaps.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <button
            onClick={handleNewMap}
            disabled={creating}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-150 hover:opacity-90 disabled:opacity-60"
            style={{ background: 'var(--brand)', color: 'white' }}
          >
            {creating ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
            New Map
          </button>
        </div>

        {error && (
          <p className="text-sm text-red-500 mb-6">{error}</p>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 size={24} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
          </div>
        ) : (
          <>
            {/* My maps */}
            {sortedMaps.length === 0 ? (
              <EmptyState onNew={handleNewMap} creating={creating} />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {sortedMaps.map((map) => (
                  <MapCard key={map.id} map={map} onDelete={handleDelete} />
                ))}
              </div>
            )}

            {/* Shared with me */}
            {sharedMaps.length > 0 && (
              <div className="mt-10">
                <div className="flex items-center gap-2 mb-4">
                  <Share2 size={15} style={{ color: 'var(--text-muted)' }} />
                  <h2 className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
                    Shared with me
                  </h2>
                  <span
                    className="text-[11px] px-1.5 py-0.5 rounded-full font-medium"
                    style={{ background: 'var(--brand-light)', color: 'var(--brand)' }}
                  >
                    {sharedMaps.length}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {sharedMaps.map((map) => (
                    <SharedMapCard key={map.id} map={map} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}

function EmptyState({ onNew, creating }: { onNew: () => void; creating: boolean }) {
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
        disabled={creating}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-60"
        style={{ background: 'var(--brand)', color: 'white' }}
      >
        {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
        Create your first map
      </button>
    </div>
  )
}
