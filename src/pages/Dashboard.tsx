import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCurrentUser } from '@/auth/AuthProvider'
import { useMindMapStore, createDefaultMapData } from '@/store/mindmapStore'
import { upsertUser, listMaps, createMap, deleteMap, duplicateMap } from '@/services/mapService'
import { listSharedMaps } from '@/services/shareService'
import { AppSidebar } from '@/components/Layout/AppSidebar'
import { ImportModal } from '@/components/UI/ImportModal'
import { useConfirm } from '@/components/UI/ConfirmModal'
import { MapMeta, SharedMapMeta, MindMapNode, MindMapEdge } from '@/types'
import {
  Plus, Map as MapIcon,
  Trash2, Loader2, Share2, Search,
  MoreHorizontal, Clock, ChevronRight, Upload, Copy,
} from 'lucide-react'

// ── Mini map thumbnail SVG ────────────────────────────────────────────────────
// Generates a deterministic mind-map-like SVG from the map id + rootColor.

function MapThumbnail({ id, color }: { id: string; color: string }) {
  // Deterministic pseudo-random from id string
  const hash = id.split('').reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) >>> 0, 0)
  const r = (n: number) => ((hash >> n) & 0xff) / 255

  const cx = 80
  const cy = 56
  const branches = 3 + (hash % 3) // 3–5 branches
  const nodes: { x: number; y: number; r: number }[] = []

  for (let i = 0; i < branches; i++) {
    const angle = (i / branches) * Math.PI * 2 - Math.PI / 2 + r(i * 4) * 0.5
    const dist = 28 + r(i * 7) * 16
    const x = cx + Math.cos(angle) * dist
    const y = cy + Math.sin(angle) * dist
    nodes.push({ x, y, r: 4 + r(i * 3) * 3 })

    // Optional second-level child
    if (r(i * 11) > 0.45) {
      const a2 = angle + (r(i * 13) - 0.5) * 0.9
      const d2 = 16 + r(i * 9) * 10
      nodes.push({ x: x + Math.cos(a2) * d2, y: y + Math.sin(a2) * d2, r: 3 })
    }
  }

  const alpha = 'cc'

  return (
    <svg viewBox="0 0 160 112" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
      {/* Edges to primary children */}
      {nodes.slice(0, branches).map((n, i) => (
        <line
          key={`e-${i}`}
          x1={cx} y1={cy} x2={n.x} y2={n.y}
          stroke={color + '55'} strokeWidth="1.5" strokeLinecap="round"
        />
      ))}
      {/* Edges to secondary children */}
      {nodes.slice(branches).map((n, i) => {
        const parentIdx = Math.floor(i * branches / (nodes.length - branches))
        const parent = nodes[parentIdx] ?? nodes[0]
        return (
          <line
            key={`e2-${i}`}
            x1={parent.x} y1={parent.y} x2={n.x} y2={n.y}
            stroke={color + '44'} strokeWidth="1" strokeLinecap="round"
          />
        )
      })}
      {/* Leaf nodes */}
      {nodes.map((n, i) => (
        <circle key={`n-${i}`} cx={n.x} cy={n.y} r={n.r} fill={color + alpha} />
      ))}
      {/* Root node */}
      <circle cx={cx} cy={cy} r={9} fill={color} />
      <circle cx={cx} cy={cy} r={5} fill="white" opacity={0.6} />
    </svg>
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
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

// ── Map card ──────────────────────────────────────────────────────────────────

function MapCard({ map, onDelete, onDuplicate }: { map: MapMeta; onDelete: (id: string) => void; onDuplicate: (id: string) => void }) {
  const navigate = useNavigate()
  const confirm = useConfirm()
  const [deleting, setDeleting] = useState(false)
  const [duplicating, setDuplicating] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const color = map.rootColor ?? '#6366f1'

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setMenuOpen(false)
    const ok = await confirm({
      title: `Delete "${map.title}"?`,
      description: 'This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    setDeleting(true)
    try {
      await deleteMap(map.id)
      onDelete(map.id)
    } catch {
      setDeleting(false)
    }
  }

  const handleDuplicate = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setMenuOpen(false)
    setDuplicating(true)
    try {
      await duplicateMap(map.id)
      onDuplicate(map.id)
    } catch {
      setDuplicating(false)
    }
  }

  return (
    <div
      className="group relative flex flex-col rounded-2xl border overflow-hidden cursor-pointer transition-all duration-200 hover:shadow-lg"
      style={{ background: 'var(--panel-bg)', borderColor: 'var(--panel-border)' }}
      onClick={() => !deleting && !duplicating && navigate(`/map/${map.id}`)}
      onMouseLeave={() => setMenuOpen(false)}
    >
      {/* Thumbnail */}
      <div
        className="relative w-full overflow-hidden flex-shrink-0"
        style={{ height: 140, background: `linear-gradient(135deg, ${color}18 0%, ${color}08 100%)` }}
      >
        {map.thumbnail ? (
          <img
            src={map.thumbnail}
            alt={map.title}
            className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            draggable={false}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center opacity-90 group-hover:scale-105 transition-transform duration-300">
            <MapThumbnail id={map.id} color={color} />
          </div>
        )}
        {/* Menu button */}
        <div className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o) }}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors backdrop-blur-sm"
            style={{ background: 'rgba(255,255,255,0.85)', color: 'var(--text-secondary)' }}
          >
            <MoreHorizontal size={14} />
          </button>
          {menuOpen && (
            <div
              className="absolute top-full right-0 mt-1 w-40 rounded-xl border overflow-hidden z-20 shadow-xl"
              style={{ background: 'var(--panel-bg)', borderColor: 'var(--panel-border)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={handleDuplicate}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-medium transition-colors"
                style={{ color: 'var(--text-primary)' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--canvas-bg)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                <Copy size={12} /> Duplicate
              </button>
              <div style={{ height: 1, background: 'var(--panel-border)' }} />
              <button
                onClick={handleDelete}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-medium transition-colors hover:bg-red-50 dark:hover:bg-red-900/20"
                style={{ color: '#ef4444' }}
              >
                <Trash2 size={12} /> Delete map
              </button>
            </div>
          )}
        </div>
        {(deleting || duplicating) && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.7)' }}>
            <Loader2 size={20} className="animate-spin" style={{ color: 'var(--brand)' }} />
          </div>
        )}
      </div>

      {/* Card footer */}
      <div className="flex items-center justify-between px-4 py-3 gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{map.title}</p>
          <p className="text-[11px] flex items-center gap-1 mt-0.5" style={{ color: 'var(--text-muted)' }}>
            <Clock size={10} />{relativeTime(map.updatedAt)}
          </p>
        </div>
        <ChevronRight
          size={14}
          className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ color: 'var(--brand)' }}
        />
      </div>
    </div>
  )
}

// ── Shared map card ───────────────────────────────────────────────────────────

function SharedMapCard({ map }: { map: SharedMapMeta }) {
  const navigate = useNavigate()
  const color = map.rootColor ?? '#6366f1'

  return (
    <div
      className="group relative flex flex-col rounded-2xl border overflow-hidden cursor-pointer transition-all duration-200 hover:shadow-lg"
      style={{ background: 'var(--panel-bg)', borderColor: 'var(--panel-border)' }}
      onClick={() => navigate(`/map/${map.id}`)}
    >
      <div
        className="relative w-full overflow-hidden flex-shrink-0"
        style={{ height: 140, background: `linear-gradient(135deg, ${color}18 0%, ${color}08 100%)` }}
      >
        {map.thumbnail ? (
          <img
            src={map.thumbnail}
            alt={map.title}
            className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            draggable={false}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center opacity-90 group-hover:scale-105 transition-transform duration-300">
            <MapThumbnail id={map.id} color={color} />
          </div>
        )}
        <div
          className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-full text-[10px] font-semibold"
          style={{ background: 'rgba(255,255,255,0.88)', color: map.permission === 'edit' ? '#6366f1' : '#6B7280', backdropFilter: 'blur(4px)' }}
        >
          {map.permission === 'edit' ? 'Can edit' : 'View only'}
        </div>
      </div>
      <div className="flex items-center justify-between px-4 py-3 gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{map.title}</p>
          <p className="text-[11px] flex items-center gap-1 mt-0.5" style={{ color: 'var(--text-muted)' }}>
            <Share2 size={10} /> {map.ownerName} · {relativeTime(map.updatedAt)}
          </p>
        </div>
        <ChevronRight
          size={14}
          className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ color: 'var(--brand)' }}
        />
      </div>
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ onNew, creating }: { onNew: () => void; creating: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-6 col-span-full">
      <div
        className="w-20 h-20 rounded-3xl flex items-center justify-center shadow-inner"
        style={{ background: 'var(--brand-light)' }}
      >
        <MapIcon size={32} style={{ color: 'var(--brand)' }} />
      </div>
      <div className="text-center">
        <p className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>
          No maps yet
        </p>
        <p className="text-sm mt-1.5 max-w-xs" style={{ color: 'var(--text-muted)' }}>
          Create your first mind map to capture ideas, plan projects, and think visually.
        </p>
      </div>
      <button
        onClick={onNew}
        disabled={creating}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60 shadow-sm"
        style={{ background: 'var(--brand)', color: 'white' }}
      >
        {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
        Create your first map
      </button>
    </div>
  )
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-2.5 mb-5">
      <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
        {label}
      </h2>
      <span
        className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
        style={{ background: 'var(--brand-light)', color: 'var(--brand)' }}
      >
        {count}
      </span>
    </div>
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
  const [importOpen, setImportOpen] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')

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

  const handleDuplicate = async (_id: string) => {
    // Refresh the map list so the duplicate appears
    try {
      const myMaps = await listMaps()
      setMaps(myMaps)
      setMapList(myMaps)
    } catch { /* non-fatal */ }
  }

  const handleImport = async ({ title, nodes, edges }: { title: string; nodes: MindMapNode[]; edges: MindMapEdge[] }) => {
    const { v4: uuidv4 } = await import('uuid')
    const id = uuidv4()
    await createMap(id, title, nodes, edges)
    const meta: MapMeta = {
      id, title,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      rootColor: (nodes[0]?.data?.color) ?? '#6366f1',
    }
    addMapToList(meta)
    setMaps((prev) => [meta, ...prev])
    navigate(`/map/${id}`)
  }

  const sortedMaps = useMemo(
    () => [...maps].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [maps]
  )

  const filteredMaps = useMemo(
    () => query.trim() ? sortedMaps.filter((m) => m.title.toLowerCase().includes(query.toLowerCase())) : sortedMaps,
    [sortedMaps, query]
  )

  const filteredShared = useMemo(
    () => query.trim() ? sharedMaps.filter((m) => m.title.toLowerCase().includes(query.toLowerCase())) : sharedMaps,
    [sharedMaps, query]
  )

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--canvas-bg)' }}>
      <AppSidebar activeTab="maps" />

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div
          className="flex items-center justify-between px-8 py-5 flex-shrink-0 border-b"
          style={{ borderColor: 'var(--panel-border)', background: 'var(--panel-bg)' }}
        >
          <div>
            <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
              {user ? `Welcome back, ${user.name.split(' ')[0]} 👋` : 'My Maps'}
            </h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {loading ? 'Loading…' : `${sortedMaps.length} map${sortedMaps.length !== 1 ? 's' : ''} · ${sharedMaps.length} shared with you`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Search */}
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-xl border text-sm"
              style={{ background: 'var(--canvas-bg)', borderColor: 'var(--panel-border)', width: 220 }}
            >
              <Search size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search maps…"
                className="bg-transparent outline-none flex-1 text-xs"
                style={{ color: 'var(--text-primary)' }}
              />
            </div>
            <button
              onClick={() => setImportOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors border"
              style={{ borderColor: 'var(--panel-border)', color: 'var(--text-secondary)', background: 'var(--panel-bg)' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--canvas-bg)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--panel-bg)' }}
            >
              <Upload size={14} /> Import
            </button>
            <button
              onClick={handleNewMap}
              disabled={creating}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-60 shadow-sm"
              style={{ background: 'var(--brand)', color: 'white' }}
            >
              {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              New Map
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-8 py-8">
          {error && <p className="text-sm text-red-500 mb-6">{error}</p>}

          {loading ? (
            <div className="flex items-center justify-center py-32">
              <Loader2 size={24} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
            </div>
          ) : (
            <>
              {/* My maps */}
              {sortedMaps.length > 0 && (
                <section className="mb-10">
                  <SectionHeader label="My Maps" count={filteredMaps.length} />
                  {filteredMaps.length === 0 ? (
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No maps match your search.</p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                      {filteredMaps.map((map) => (
                        <MapCard key={map.id} map={map} onDelete={handleDelete} onDuplicate={handleDuplicate} />
                      ))}
                    </div>
                  )}
                </section>
              )}

              {sortedMaps.length === 0 && <EmptyState onNew={handleNewMap} creating={creating} />}

              {/* Shared with me */}
              {filteredShared.length > 0 && (
                <section>
                  <SectionHeader label="Shared with me" count={filteredShared.length} />
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {filteredShared.map((map) => (
                      <SharedMapCard key={map.id} map={map} />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>

      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={handleImport}
      />
    </div>
  )
}
