import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCurrentUser } from '@/auth/AuthProvider'
import { useMindMapStore, createDefaultMapData } from '@/store/mindmapStore'
import { upsertUser, listMaps, createMap, deleteMap, duplicateMap } from '@/services/mapService'
import { listSharedMaps } from '@/services/shareService'
import { generateMapFromTopic } from '@/services/aiService'
import { buildAIMap } from '@/utils/buildAIMap'
import { AppSidebar } from '@/components/Layout/AppSidebar'
import { ImportModal } from '@/components/UI/ImportModal'
import { useConfirm } from '@/components/UI/ConfirmModal'
import { LoadingShell } from '@/components/UI/LoadingShell'
import { AdvisorSuggestionModal } from '@/components/UI/AdvisorSuggestionModal'
import { AdvisorPicker } from '@/components/UI/AdvisorPicker'
import { MapMeta, SharedMapMeta, MindMapNode, MindMapEdge, MapAdvisor } from '@/types'
import {
  Plus, Map as MapIcon,
  Trash2, Loader2, Share2, Search,
  MoreHorizontal, Clock, ChevronRight, Upload, Copy,
  Sparkles, ArrowRight, ChevronDown,
} from 'lucide-react'

// Default title used by createDefaultMapData — render as "(Untitled)" so a
// page full of unrenamed maps doesn't feel like noise.
const DEFAULT_TITLE = 'New Mind Map'

type SortMode = 'recent' | 'name' | 'created'

const SORT_LABELS: Record<SortMode, string> = {
  recent: 'Recently edited',
  name: 'Name',
  created: 'Date created',
}

// ── Mini map thumbnail SVG ────────────────────────────────────────────────────
// Deterministic mind-map preview SVG for cards without a captured thumbnail.
// Uses rootColor + map id as the seed so the same map always renders the
// same shape — gives the eye something to recognise even before real
// thumbnails finish capturing.

function MapThumbnail({ id, color }: { id: string; color: string }) {
  const hash = id.split('').reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) >>> 0, 0)
  const r = (n: number) => ((hash >> n) & 0xff) / 255

  const cx = 80
  const cy = 56
  const branches = 3 + (hash % 3) // 3–5 branches
  const nodes: { x: number; y: number; r: number; parent: number | null }[] = []

  for (let i = 0; i < branches; i++) {
    const angle = (i / branches) * Math.PI * 2 - Math.PI / 2 + (r(i * 4) - 0.5) * 0.4
    const dist = 30 + r(i * 7) * 14
    const x = cx + Math.cos(angle) * dist
    const y = cy + Math.sin(angle) * dist
    nodes.push({ x, y, r: 3.5 + r(i * 3) * 2, parent: null })

    if (r(i * 11) > 0.4) {
      const a2 = angle + (r(i * 13) - 0.5) * 0.7
      const d2 = 14 + r(i * 9) * 8
      nodes.push({
        x: x + Math.cos(a2) * d2,
        y: y + Math.sin(a2) * d2,
        r: 2.5,
        parent: nodes.length - 1,
      })
    }
  }

  return (
    <svg viewBox="0 0 160 112" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
      {/* Edges — thinner stroke, lower opacity for refinement */}
      {nodes.map((n, i) => {
        const start = n.parent === null ? { x: cx, y: cy } : nodes[n.parent]
        return (
          <line
            key={`e-${i}`}
            x1={start.x} y1={start.y} x2={n.x} y2={n.y}
            stroke={color}
            strokeWidth="1"
            strokeLinecap="round"
            opacity={n.parent === null ? 0.45 : 0.28}
          />
        )
      })}
      {/* Leaf nodes — soft white core gives a subtle "node" feel */}
      {nodes.map((n, i) => (
        <g key={`n-${i}`}>
          <circle cx={n.x} cy={n.y} r={n.r} fill={color} opacity={n.parent === null ? 0.85 : 0.65} />
          <circle cx={n.x} cy={n.y} r={Math.max(n.r - 1.5, 0.8)} fill="white" opacity={0.85} />
        </g>
      ))}
      {/* Root node — solid + soft inner highlight */}
      <circle cx={cx} cy={cy} r={8.5} fill={color} />
      <circle cx={cx} cy={cy} r={4.5} fill="white" opacity={0.4} />
    </svg>
  )
}

// ── Ambient mind-map background (hero only) ─────────────────────────────────
// Static, decorative SVG that lives behind the HeroPrompt input. Very low
// opacity — exists to anchor the surface in the product's visual language
// (the mind-map is the brand) without competing with the form.

function HeroAmbientMap() {
  return (
    <svg
      viewBox="0 0 600 200"
      className="absolute inset-0 w-full h-full pointer-events-none"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id="hero-edge" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#4F46E5" stopOpacity="0.20" />
          <stop offset="100%" stopColor="#7C3AED" stopOpacity="0.05" />
        </linearGradient>
      </defs>
      {/* Edges fanning out from a notional root just outside the right edge */}
      <g stroke="url(#hero-edge)" strokeWidth="1" fill="none" opacity={0.5}>
        <path d="M 600 100 Q 480 60 360 40" />
        <path d="M 600 100 Q 480 100 360 90" />
        <path d="M 600 100 Q 480 140 360 160" />
        <path d="M 600 100 Q 520 80 440 40" />
        <path d="M 600 100 Q 520 120 440 160" />
      </g>
      {/* Sparse nodes — opacity tuned to feel ambient, not decorative */}
      <g fill="#4F46E5" opacity={0.10}>
        <circle cx={360} cy={40} r={3} />
        <circle cx={360} cy={90} r={3} />
        <circle cx={360} cy={160} r={3} />
        <circle cx={440} cy={40} r={2.5} />
        <circle cx={440} cy={160} r={2.5} />
      </g>
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
      className="group relative flex flex-col rounded-2xl border overflow-hidden cursor-pointer transition-all duration-150 ease-out hover:-translate-y-0.5"
      style={{
        background: 'var(--panel-bg)',
        borderColor: 'var(--panel-border)',
        boxShadow: 'var(--shadow-sm)',
      }}
      onClick={() => !deleting && !duplicating && navigate(`/map/${map.id}`)}
      onMouseLeave={() => setMenuOpen(false)}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = 'var(--shadow-md)' }}
      onMouseOut={(e) => { e.currentTarget.style.boxShadow = 'var(--shadow-sm)' }}
    >
      {/* Thumbnail — neutral well so the rootColor lives in the SVG, not the surface */}
      <div
        className="relative w-full overflow-hidden flex-shrink-0 border-b"
        style={{
          height: 140,
          background: 'var(--surface-well)',
          borderColor: 'var(--panel-border)',
        }}
      >
        {map.thumbnail ? (
          <img
            src={map.thumbnail}
            alt={map.title}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            draggable={false}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center transition-transform duration-300 group-hover:scale-[1.02]">
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

      {/* Card footer — root-color dot + title, refined typography */}
      <div className="flex items-center justify-between px-4 py-3 gap-2">
        <div className="min-w-0 flex items-center gap-2">
          <span
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ background: color }}
          />
          <div className="min-w-0">
            <p
              className="text-sm font-semibold truncate tracking-tight"
              style={{ color: map.title === DEFAULT_TITLE ? 'var(--text-muted)' : 'var(--text-primary)' }}
            >
              {map.title === DEFAULT_TITLE ? '(Untitled)' : map.title}
            </p>
            <p className="text-[11px] flex items-center gap-1 mt-0.5" style={{ color: 'var(--text-muted)' }}>
              <Clock size={10} />{relativeTime(map.updatedAt)}
            </p>
          </div>
        </div>
        <ChevronRight
          size={14}
          className="flex-shrink-0 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all"
          style={{ color: 'var(--brand)' }}
        />
      </div>
    </div>
  )
}

// ── Big map card (used in "Continue where you left off") ─────────────────────

function BigMapCard({ map }: { map: MapMeta }) {
  const navigate = useNavigate()
  const color = map.rootColor ?? '#4F46E5'
  const untitled = map.title === DEFAULT_TITLE

  return (
    <div
      className="group relative flex flex-col rounded-2xl border overflow-hidden cursor-pointer transition-all duration-150 ease-out hover:-translate-y-0.5"
      style={{
        background: 'var(--panel-bg)',
        borderColor: 'var(--panel-border)',
        boxShadow: 'var(--shadow-sm)',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = 'var(--shadow-md)' }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'var(--shadow-sm)' }}
      onClick={() => navigate(`/map/${map.id}`)}
    >
      <div
        className="relative w-full overflow-hidden flex-shrink-0 border-b"
        style={{
          height: 200,
          background: 'var(--surface-well)',
          borderColor: 'var(--panel-border)',
        }}
      >
        {map.thumbnail ? (
          <img
            src={map.thumbnail}
            alt={map.title}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            draggable={false}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center transition-transform duration-300 group-hover:scale-[1.02]">
            <MapThumbnail id={map.id} color={color} />
          </div>
        )}
      </div>

      {/* Footer — root-color dot acts as map identity, hover-reveal arrow
          replaces the always-on "Continue" chip (cleaner, less marketing). */}
      <div className="flex items-center justify-between px-5 py-4 gap-3">
        <div className="min-w-0 flex-1 flex items-center gap-2.5">
          <span
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ background: color }}
          />
          <div className="min-w-0">
            <p
              className="text-[15px] font-semibold truncate tracking-tight"
              style={{ color: untitled ? 'var(--text-muted)' : 'var(--text-primary)' }}
            >
              {untitled ? '(Untitled)' : map.title}
            </p>
            <p className="text-xs flex items-center gap-1 mt-0.5" style={{ color: 'var(--text-muted)' }}>
              <Clock size={11} /> Edited {relativeTime(map.updatedAt)}
            </p>
          </div>
        </div>
        <ArrowRight
          size={16}
          className="flex-shrink-0 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all"
          style={{ color: 'var(--brand)' }}
        />
      </div>
    </div>
  )
}

// ── Shared map card ───────────────────────────────────────────────────────────

function SharedMapCard({ map }: { map: SharedMapMeta }) {
  const navigate = useNavigate()
  const color = map.rootColor ?? '#4F46E5'

  return (
    <div
      className="group relative flex flex-col rounded-2xl border overflow-hidden cursor-pointer transition-all duration-150 ease-out hover:-translate-y-0.5"
      style={{
        background: 'var(--panel-bg)',
        borderColor: 'var(--panel-border)',
        boxShadow: 'var(--shadow-sm)',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = 'var(--shadow-md)' }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'var(--shadow-sm)' }}
      onClick={() => navigate(`/map/${map.id}`)}
    >
      <div
        className="relative w-full overflow-hidden flex-shrink-0 border-b"
        style={{
          height: 140,
          background: 'var(--surface-well)',
          borderColor: 'var(--panel-border)',
        }}
      >
        {map.thumbnail ? (
          <img
            src={map.thumbnail}
            alt={map.title}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            draggable={false}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center transition-transform duration-300 group-hover:scale-[1.02]">
            <MapThumbnail id={map.id} color={color} />
          </div>
        )}
        <div
          className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md text-[10px] font-semibold"
          style={{
            background: 'var(--panel-bg)',
            color: map.permission === 'edit' ? 'var(--brand)' : 'var(--text-secondary)',
            border: '1px solid var(--panel-border)',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          {map.permission === 'edit' ? 'Can edit' : 'View only'}
        </div>
      </div>
      <div className="flex items-center justify-between px-4 py-3 gap-2">
        <div className="min-w-0 flex items-center gap-2">
          <span
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ background: color }}
          />
          <div className="min-w-0">
            <p
              className="text-sm font-semibold truncate tracking-tight"
              style={{ color: map.title === DEFAULT_TITLE ? 'var(--text-muted)' : 'var(--text-primary)' }}
            >
              {map.title === DEFAULT_TITLE ? '(Untitled)' : map.title}
            </p>
            <p className="text-[11px] flex items-center gap-1 mt-0.5" style={{ color: 'var(--text-muted)' }}>
              <Share2 size={10} /> {map.ownerName} · {relativeTime(map.updatedAt)}
            </p>
          </div>
        </div>
        <ChevronRight
          size={14}
          className="flex-shrink-0 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all"
          style={{ color: 'var(--brand)' }}
        />
      </div>
    </div>
  )
}

// ── Hero prompt — primary "create" surface on the dashboard ──────────────────

interface HeroPromptProps {
  onSubmit: (prompt: string) => Promise<void>
  generating: boolean
  error: string | null
  /** Externally-owned textarea ref so global keyboard shortcuts can focus it. */
  inputRef?: React.RefObject<HTMLTextAreaElement>
}

function HeroPrompt({ onSubmit, generating, error, inputRef: externalRef }: HeroPromptProps) {
  const [value, setValue] = useState('')
  const [focused, setFocused] = useState(false)
  const localRef = useRef<HTMLTextAreaElement>(null)
  const inputRef = externalRef ?? localRef

  const submit = (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || generating) return
    void onSubmit(trimmed)
  }

  // Auto-grow up to a sensible cap. Reset to 'auto' first so the textarea
  // can shrink when the user deletes lines.
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [value, inputRef])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit(value)
    }
  }

  return (
    <section className="mb-10">
      <div
        className="relative rounded-2xl border overflow-hidden"
        style={{
          background: 'var(--panel-bg)',
          borderColor: 'var(--panel-border)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        {/* Mind-map = brand. Sits behind the form at low opacity. */}
        <HeroAmbientMap />

        <div className="relative px-6 py-5">
          <div className="flex items-center gap-2 mb-3.5">
            <Sparkles size={13} style={{ color: 'var(--brand)' }} />
            <span
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: 'var(--text-secondary)' }}
            >
              Generate with AI
            </span>
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); submit(value) }}
            className="flex items-end gap-2 rounded-xl border pl-3.5 pr-1.5 py-1.5 transition-all"
            style={{
              background: 'var(--surface-well)',
              borderColor: focused ? 'var(--brand)' : 'transparent',
              boxShadow: focused ? '0 0 0 3px rgba(79,70,229,0.10)' : 'none',
            }}
          >
            <textarea
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="Describe a topic, paste a plan, or drop in a PRD…"
              disabled={generating}
              rows={1}
              className="flex-1 bg-transparent outline-none text-[15px] py-1.5 resize-none font-sans"
              style={{ color: 'var(--text-primary)', maxHeight: 200, lineHeight: '1.5' }}
            />
            <button
              type="submit"
              disabled={!value.trim() || generating}
              className="flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold transition-all hover:opacity-95 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: 'var(--brand-gradient)',
                color: 'white',
                boxShadow: '0 1px 2px rgba(79,70,229,0.25)',
              }}
            >
              {generating ? (
                <><Loader2 size={14} className="animate-spin" /> Generating…</>
              ) : (
                <>Generate <ArrowRight size={14} /></>
              )}
            </button>
          </form>

          <p className="text-[11px] mt-2.5 ml-1 flex items-center gap-1.5 flex-wrap" style={{ color: 'var(--text-muted)' }}>
            <kbd
              className="font-mono px-1.5 py-0.5 rounded text-[10px] border"
              style={{ background: 'var(--panel-bg)', borderColor: 'var(--panel-border)', color: 'var(--text-secondary)' }}
            >
              Enter
            </kbd>
            to generate
            <span className="opacity-50">·</span>
            <kbd
              className="font-mono px-1.5 py-0.5 rounded text-[10px] border"
              style={{ background: 'var(--panel-bg)', borderColor: 'var(--panel-border)', color: 'var(--text-secondary)' }}
            >
              Shift+Enter
            </kbd>
            for new line
            <span className="opacity-50">·</span>
            paste up to ~4,000 words
          </p>

          {error && (
            <p className="text-xs mt-2" style={{ color: '#ef4444' }}>{error}</p>
          )}
        </div>
      </div>
    </section>
  )
}

// ── Sort dropdown ─────────────────────────────────────────────────────────────

function SortDropdown({ value, onChange }: { value: SortMode; onChange: (m: SortMode) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors"
        style={{ background: 'var(--panel-bg)', borderColor: 'var(--panel-border)', color: 'var(--text-secondary)' }}
      >
        {SORT_LABELS[value]}
        <ChevronDown size={12} />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1 rounded-xl border overflow-hidden z-30 shadow-lg"
          style={{ background: 'var(--panel-bg)', borderColor: 'var(--panel-border)', minWidth: 160 }}
        >
          {(Object.keys(SORT_LABELS) as SortMode[]).map((m) => (
            <button
              key={m}
              onClick={() => { onChange(m); setOpen(false) }}
              className="w-full text-left px-3 py-2 text-xs transition-colors hover:bg-gray-50 dark:hover:bg-gray-700"
              style={{ color: m === value ? 'var(--brand)' : 'var(--text-primary)' }}
            >
              {SORT_LABELS[m]}
            </button>
          ))}
        </div>
      )}
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

// ── Placeholder data for shadow-render skeleton ──────────────────────────────
// During loading we render the *real* MapCard grid using these placeholder
// MapMeta entries — LoadingShell then masks every text/icon into a pulse
// block. Future UI changes to MapCard automatically flow into the skeleton.

const SKELETON_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#8b5cf6']

function makeSkeletonMaps(n: number): MapMeta[] {
  const now = new Date().toISOString()
  return Array.from({ length: n }, (_, i) => ({
    id: `skel-${i}`,
    title: 'Loading map title',
    createdAt: now,
    updatedAt: now,
    rootColor: SKELETON_COLORS[i % SKELETON_COLORS.length],
  }))
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
  const [sort, setSort] = useState<SortMode>('recent')

  // Hero prompt state
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)

  // Pending generation: AI has returned a map but the user hasn't picked an
  // advisor yet. We hold the built map in memory and finalize via createMap +
  // navigate only after the suggestion modal closes.
  const [pendingMap, setPendingMap] = useState<{
    id: string
    title: string
    rootColor: string
    nodes: MindMapNode[]
    edges: MindMapEdge[]
    prompt: string
  } | null>(null)
  const [showAdvisorPicker, setShowAdvisorPicker] = useState(false)
  // Guard so AdvisorSuggestionModal's chained `onPick` + `onClose` only
  // finalize the pending map once. Reset every time a new pendingMap appears.
  const decidedRef = useRef(false)

  // Refs for global keyboard shortcuts (N / G / /)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const generateInputRef = useRef<HTMLTextAreaElement>(null)

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

  // Global keyboard shortcuts. Suppressed while typing in another input so the
  // user can still type "n" or "g" anywhere normally. The handler is kept in a
  // ref so the bare `[]` deps don't capture a stale handleNewMap.
  const handleNewMapRef = useRef(handleNewMap)
  handleNewMapRef.current = handleNewMap

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return
      const k = e.key.toLowerCase()
      if (k === 'n') { e.preventDefault(); void handleNewMapRef.current() }
      else if (k === '/') { e.preventDefault(); searchInputRef.current?.focus() }
      else if (k === 'g') { e.preventDefault(); generateInputRef.current?.focus() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

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

  // Hero: generate a map from a topic prompt. Holds the built map in
  // `pendingMap` and shows the advisor suggestion modal; the actual createMap
  // + navigate only happens once the user picks (or skips) an advisor.
  const handleGenerate = async (prompt: string) => {
    if (generating) return
    setGenerating(true)
    setGenerateError(null)
    try {
      const parsed = await generateMapFromTopic(prompt)
      const built = buildAIMap(parsed, prompt)
      decidedRef.current = false
      setPendingMap({
        id: built.id,
        title: built.title,
        rootColor: built.rootColor,
        nodes: built.nodes,
        edges: built.edges,
        prompt,
      })
    } catch (err: any) {
      setGenerateError(err?.message ?? 'Failed to generate. Please try again.')
      setGenerating(false)
    }
  }

  // Finalize the pending generation with (or without) an advisor.
  const finalizePendingMap = async (advisor: MapAdvisor | null) => {
    if (!pendingMap) return
    const map = pendingMap
    setPendingMap(null)
    try {
      await createMap(map.id, map.title, map.nodes, map.edges, advisor)
      const meta: MapMeta = {
        id: map.id,
        title: map.title,
        rootColor: map.rootColor,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      addMapToList(meta)
      setMaps((prev) => [meta, ...prev])
      navigate(`/map/${map.id}`)
    } catch (err: any) {
      setGenerateError(err?.message ?? 'Failed to save. Please try again.')
      setGenerating(false)
    }
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

  // The "Continue where you left off" row always uses recency, regardless of
  // the sort applied to the main grid below.
  const recentMaps = useMemo(
    () => [...maps].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [maps]
  )

  const sortedMaps = useMemo(() => {
    const arr = [...maps]
    switch (sort) {
      case 'name':
        return arr.sort((a, b) => a.title.localeCompare(b.title))
      case 'created':
        return arr.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      case 'recent':
      default:
        return arr.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    }
  }, [maps, sort])

  const filteredMaps = useMemo(
    () => query.trim() ? sortedMaps.filter((m) => m.title.toLowerCase().includes(query.toLowerCase())) : sortedMaps,
    [sortedMaps, query]
  )

  // Top 3 most recently edited go in the Continue row. We hide the row entirely
  // for first-time users (< 1 map) so EmptyState handles onboarding cleanly.
  const continueMaps = useMemo(
    () => (query.trim() ? [] : recentMaps.slice(0, 3)),
    [recentMaps, query]
  )

  const filteredShared = useMemo(
    () => query.trim() ? sharedMaps.filter((m) => m.title.toLowerCase().includes(query.toLowerCase())) : sharedMaps,
    [sharedMaps, query]
  )

  // While loading, feed the real MapCard grid placeholder data so LoadingShell
  // can shadow-render. The placeholder count + colors give the eye something
  // to anchor on without requiring a separate skeleton component.
  const skeletonMaps = useMemo(() => makeSkeletonMaps(10), [])
  const visibleMaps = loading ? skeletonMaps : filteredMaps

  // Contextual greeting — replaces "Welcome back 👋" with a one-liner that
  // reflects the user's actual state. Clicking the heading jumps straight to
  // the most recently edited map. This is the kind of small power-user touch
  // that makes the dashboard feel like a tool, not a marketing page.
  const headingState = useMemo(() => {
    if (loading) return null
    if (maps.length === 0) {
      return {
        title: 'Start your first map',
        sub: user ? `Welcome, ${user.name.split(' ')[0]}` : 'Create one below to get started',
        href: null as string | null,
      }
    }
    const sorted = [...maps].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )
    const last = sorted[0]
    const lastTitle = last.title === DEFAULT_TITLE ? '(Untitled)' : last.title
    const weekMs = 7 * 24 * 60 * 60 * 1000
    const editedThisWeek = maps.filter(
      (m) => Date.now() - new Date(m.updatedAt).getTime() < weekMs
    ).length
    const sub =
      `${maps.length} map${maps.length !== 1 ? 's' : ''}` +
      (editedThisWeek > 0 ? ` · ${editedThisWeek} edited this week` : '') +
      (sharedMaps.length > 0 ? ` · ${sharedMaps.length} shared` : '')
    return {
      title: `Last edited: ${lastTitle}`,
      sub,
      href: `/map/${last.id}`,
    }
  }, [loading, maps, sharedMaps, user])

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--canvas-bg)' }}>
      <AppSidebar activeTab="maps" loading={loading} />

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div
          className="flex items-center justify-between px-8 py-5 flex-shrink-0 border-b"
          style={{ borderColor: 'var(--panel-border)', background: 'var(--panel-bg)' }}
        >
          <div className="min-w-0">
            {loading || !headingState ? (
              <LoadingShell loading>
                <h1 className="text-[15px] font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                  Loading your workspace
                </h1>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  Fetching maps and recent activity…
                </p>
              </LoadingShell>
            ) : headingState.href ? (
              <button
                onClick={() => navigate(headingState.href!)}
                className="group text-left flex flex-col"
                title="Open this map"
              >
                <h1
                  className="text-[15px] font-semibold tracking-tight flex items-center gap-1.5 truncate"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <span className="truncate">{headingState.title}</span>
                  {/* Permanent chevron at low opacity — primary affordance signal.
                      Intensifies + slides on hover. */}
                  <ArrowRight
                    size={13}
                    className="flex-shrink-0 opacity-40 transition-all group-hover:opacity-100 group-hover:translate-x-0.5"
                    style={{ color: 'var(--brand)' }}
                  />
                </h1>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {headingState.sub}
                </p>
              </button>
            ) : (
              <>
                <h1 className="text-[15px] font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                  {headingState.title}
                </h1>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {headingState.sub}
                </p>
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
            {/* Search — inset well surface, no border (cleaner). Kbd hint
                makes the `/` shortcut discoverable. */}
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm"
              style={{ background: 'var(--surface-well)', width: 280 }}
            >
              <Search size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              <input
                ref={searchInputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search maps…"
                className="bg-transparent outline-none flex-1 text-xs"
                style={{ color: 'var(--text-primary)' }}
              />
              {!query && (
                <kbd
                  className="text-[10px] font-mono px-1.5 py-0.5 rounded border"
                  style={{
                    background: 'var(--panel-bg)',
                    borderColor: 'var(--panel-border)',
                    color: 'var(--text-muted)',
                  }}
                >
                  /
                </kbd>
              )}
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
              className="flex items-center gap-2 pl-4 pr-2.5 py-2 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-60 shadow-sm"
              style={{ background: 'var(--brand)', color: 'white' }}
            >
              {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              New Map
              <kbd
                className="text-[10px] font-mono px-1.5 py-0.5 rounded ml-1"
                style={{ background: 'rgba(255,255,255,0.18)', color: 'rgba(255,255,255,0.9)' }}
              >
                N
              </kbd>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-8 py-8">
          {error && <p className="text-sm text-red-500 mb-6">{error}</p>}

          {/* Hero prompt — primary "create" surface. Rendered during loading
              too (wrapped in LoadingShell) so it doesn't pop in afterward. */}
          <LoadingShell loading={loading}>
            <HeroPrompt
              onSubmit={handleGenerate}
              generating={generating}
              error={generateError}
              inputRef={generateInputRef}
            />
          </LoadingShell>

          <LoadingShell loading={loading}>
            {/* Continue where you left off — top 3 most recent maps. During
                load, render 3 skeleton cards so the row holds its space.
                Hidden while searching so results aren't double-counted. */}
            {(loading || continueMaps.length > 0) && (
              <section className="mb-10">
                <SectionHeader
                  label="Continue where you left off"
                  count={loading ? 3 : continueMaps.length}
                />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {(loading ? skeletonMaps.slice(0, 3) : continueMaps).map((map) => (
                    <BigMapCard key={map.id} map={map} />
                  ))}
                </div>
              </section>
            )}

            {/* All maps — during loading we shadow-render the grid with
                placeholder MapMeta entries so the layout doesn't reflow. */}
            {(visibleMaps.length > 0 || loading) && (
              <section className="mb-10">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                      All maps
                    </h2>
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                      style={{ background: 'var(--brand-light)', color: 'var(--brand)' }}
                    >
                      {loading ? visibleMaps.length : filteredMaps.length}
                    </span>
                  </div>
                  {!loading && <SortDropdown value={sort} onChange={setSort} />}
                </div>
                {!loading && filteredMaps.length === 0 ? (
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No maps match your search.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {visibleMaps.map((map) => (
                      <MapCard key={map.id} map={map} onDelete={handleDelete} onDuplicate={handleDuplicate} />
                    ))}
                  </div>
                )}
              </section>
            )}

            {!loading && maps.length === 0 && <EmptyState onNew={handleNewMap} creating={creating} />}

            {/* Shared with me — only render when there's something to show. */}
            {!loading && filteredShared.length > 0 && (
              <section>
                <SectionHeader label="Shared with me" count={filteredShared.length} />
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {filteredShared.map((map) => (
                    <SharedMapCard key={map.id} map={map} />
                  ))}
                </div>
              </section>
            )}
          </LoadingShell>
        </div>
      </div>

      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={handleImport}
      />

      {/* Advisor inference: shown after AI generation; either it picks a suggested
          advisor or routes the user into the full library via Browse all.
          A `decided` ref guards against onPick + onClose firing back-to-back from
          the modal so we only finalize once. Closing via X = skip. */}
      {pendingMap && !showAdvisorPicker && (
        <AdvisorSuggestionModal
          open
          title={pendingMap.title || pendingMap.prompt}
          text={pendingMap.prompt}
          onPick={(advisor) => {
            if (decidedRef.current) return
            decidedRef.current = true
            void finalizePendingMap(advisor)
          }}
          onClose={() => {
            if (decidedRef.current) return
            decidedRef.current = true
            void finalizePendingMap(null)
          }}
          onBrowseAll={() => setShowAdvisorPicker(true)}
        />
      )}
      {pendingMap && showAdvisorPicker && (
        <AdvisorPicker
          open
          current={null}
          onPick={(advisor) => {
            if (decidedRef.current) return
            decidedRef.current = true
            setShowAdvisorPicker(false)
            void finalizePendingMap(advisor)
          }}
          onClose={() => {
            if (decidedRef.current) return
            decidedRef.current = true
            setShowAdvisorPicker(false)
            void finalizePendingMap(null)
          }}
        />
      )}
    </div>
  )
}
