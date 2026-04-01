import { useCallback, useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Download, Search, Sun, Moon, Image,
  Sparkles, Layers, Map as MapIcon, Wand2, Settings, Workflow,
  MonitorPlay, FileJson, FileText, ArrowLeft, Check, Share2,
} from 'lucide-react'
import { useMindMapStore, createDefaultMapData } from '@/store/mindmapStore'
import { useUIStore } from '@/store/uiStore'
import { exportToJSON, exportToMarkdown, exportToPng } from '@/utils/exportUtils'
import { useReactFlow } from 'reactflow'
import { createMap as createMapApi, renameMap } from '@/services/mapService'
import { PresenceAvatars } from '@/components/UI/PresenceAvatars'
import { MapMeta } from '@/types'

// ── Tooltip ───────────────────────────────────────────────────────────────────

function Tooltip({ label, shortcut, children }: {
  label: string
  shortcut?: string
  children: React.ReactNode
}) {
  const [visible, setVisible] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>()

  const show = () => { timer.current = setTimeout(() => setVisible(true), 400) }
  const hide = () => { clearTimeout(timer.current); setVisible(false) }

  return (
    <div className="relative flex flex-col items-center" onMouseEnter={show} onMouseLeave={hide}>
      {children}
      {visible && (
        <div
          className="absolute top-full mt-2 z-[999] whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs pointer-events-none flex items-center gap-2"
          style={{
            background: '#1f2937',
            color: 'white',
            boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
          }}
        >
          <span>{label}</span>
          {shortcut && (
            <kbd
              className="px-1.5 py-0.5 rounded text-[10px] font-mono"
              style={{ background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.8)' }}
            >
              {shortcut}
            </kbd>
          )}
        </div>
      )}
    </div>
  )
}

// ── ToolButton: icon + label ──────────────────────────────────────────────────

function ToolBtn({
  icon: Icon,
  label,
  tooltip,
  shortcut,
  onClick,
  active,
  accent,
  disabled,
}: {
  icon: React.ElementType
  label: string
  tooltip?: string
  shortcut?: string
  onClick: () => void
  active?: boolean
  accent?: boolean
  disabled?: boolean
}) {
  return (
    <Tooltip label={tooltip ?? label} shortcut={shortcut}>
      <button
        onClick={onClick}
        disabled={disabled}
        className="flex flex-col items-center gap-1 px-2.5 py-1.5 rounded-xl transition-all duration-150 group disabled:opacity-40"
        style={{
          background: active ? 'var(--brand-light)' : 'transparent',
          color: active ? 'var(--brand)' : accent ? 'var(--brand)' : 'var(--text-secondary)',
        }}
        onMouseEnter={(e) => {
          if (!active) e.currentTarget.style.background = 'var(--canvas-bg)'
        }}
        onMouseLeave={(e) => {
          if (!active) e.currentTarget.style.background = 'transparent'
        }}
      >
        <Icon size={15} />
        <span className="text-[10px] font-medium leading-none">{label}</span>
      </button>
    </Tooltip>
  )
}

function Divider() {
  return <div className="w-px self-stretch my-1 rounded-full" style={{ background: 'var(--panel-border)' }} />
}

// ── Export dropdown ───────────────────────────────────────────────────────────

function ExportMenu({ title, nodes, edges }: { title: string; nodes: any; edges: any }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const items = [
    { icon: Image, label: 'Export as PNG', action: () => { exportToPng(title); setOpen(false) } },
    { icon: FileJson, label: 'Export as JSON', action: () => { exportToJSON(nodes, edges, title); setOpen(false) } },
    { icon: FileText, label: 'Export as Markdown', action: () => { exportToMarkdown(nodes, edges, title); setOpen(false) } },
  ]

  return (
    <div ref={ref} className="relative flex flex-col items-center">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex flex-col items-center gap-1 px-2.5 py-1.5 rounded-xl transition-all duration-150"
        style={{
          background: open ? 'var(--canvas-bg)' : 'transparent',
          color: open ? 'var(--text-primary)' : 'var(--text-secondary)',
        }}
        onMouseEnter={(e) => { if (!open) e.currentTarget.style.background = 'var(--canvas-bg)' }}
        onMouseLeave={(e) => { if (!open) e.currentTarget.style.background = 'transparent' }}
      >
        <Download size={15} />
        <span className="text-[10px] font-medium leading-none">Export</span>
      </button>

      {open && (
        <div
          className="absolute top-full mt-2 left-1/2 -translate-x-1/2 rounded-xl border overflow-hidden z-50"
          style={{
            background: 'var(--panel-bg)',
            borderColor: 'var(--panel-border)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            minWidth: 180,
          }}
        >
          {items.map(({ icon: Icon, label, action }) => (
            <button
              key={label}
              onClick={action}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs transition-colors hover:bg-gray-50 dark:hover:bg-gray-700"
              style={{ color: 'var(--text-primary)' }}
            >
              <Icon size={13} style={{ color: 'var(--text-muted)' }} />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main toolbar ──────────────────────────────────────────────────────────────

interface Props {
  onOpenGenerateModal: () => void
  onOpenSettings: () => void
  onOpenShare: () => void
  readOnly?: boolean
}

export function TopToolbar({ onOpenGenerateModal, onOpenSettings, onOpenShare, readOnly = false }: Props) {
  const { activeMap, nodes, edges, addMapToList, activeMapId, updateMapMeta } = useMindMapStore()
  const navigate = useNavigate()
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const titleInputRef = useRef<HTMLInputElement>(null)
  const {
    theme, toggleTheme,
    leftPanelOpen, toggleLeftPanel,
    rightPanelOpen, toggleRightPanel,
    toggleSearch,
    minimapVisible, toggleMinimap,
  } = useUIStore()

  const { fitView } = useReactFlow()

  const map = activeMap()
  const title = map?.title ?? 'My Mind Map'

  const startEditTitle = useCallback(() => {
    setTitleDraft(title)
    setEditingTitle(true)
    setTimeout(() => titleInputRef.current?.select(), 0)
  }, [title])

  const commitTitle = useCallback(async () => {
    const trimmed = titleDraft.trim()
    if (trimmed && trimmed !== title && activeMapId) {
      updateMapMeta(activeMapId, trimmed)
      await renameMap(activeMapId, trimmed)
    }
    setEditingTitle(false)
  }, [titleDraft, title, activeMapId, updateMapMeta])

  const handlePresentationMode = useCallback(() => {
    const { nodes: n, edges: e } = useMindMapStore.getState()
    const hasParent = new Set(e.map((ed) => ed.target))
    const root = n.find((nd) => !hasParent.has(nd.id))
    if (!root) return

    const childrenOf = new Map<string, string[]>()
    e.forEach((ed) => {
      if (!childrenOf.has(ed.source)) childrenOf.set(ed.source, [])
      childrenOf.get(ed.source)!.push(ed.target)
    })

    const order: string[] = []
    function dfs(id: string) {
      order.push(id)
      childrenOf.get(id)?.forEach(dfs)
    }
    dfs(root.id)
    useUIStore.getState().enterPresentationMode(order)
  }, [])

  return (
    <div
      className="glass absolute top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-0.5 px-3 py-1.5 rounded-2xl border"
      style={{
        background: 'var(--toolbar-bg)',
        borderColor: 'var(--toolbar-border)',
        boxShadow: '0 2px 20px rgba(0,0,0,0.10)',
      }}
    >
      {/* ── Back + Title ── */}
      <div className="flex items-center gap-1.5 px-1 mr-1">
        <Tooltip label="Back to dashboard">
          <button
            onClick={() => navigate('/dashboard')}
            className="w-6 h-6 rounded-md flex items-center justify-center transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 flex-shrink-0"
            style={{ color: 'var(--text-muted)' }}
          >
            <ArrowLeft size={13} />
          </button>
        </Tooltip>
        <div className="w-6 h-6 rounded-md bg-indigo-500 flex items-center justify-center flex-shrink-0">
          <Layers size={13} color="white" />
        </div>
        {editingTitle ? (
          <div className="flex items-center gap-1">
            <input
              ref={titleInputRef}
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitTitle()
                if (e.key === 'Escape') setEditingTitle(false)
                e.stopPropagation()
              }}
              onBlur={commitTitle}
              className="text-sm font-semibold bg-transparent outline-none border-b w-[110px]"
              style={{ color: 'var(--text-primary)', borderColor: '#6366f1' }}
            />
            <button onClick={commitTitle} style={{ color: '#6366f1' }}>
              <Check size={12} />
            </button>
          </div>
        ) : (
          <Tooltip label="Click to rename">
            <button
              onClick={startEditTitle}
              className="text-sm font-semibold max-w-[110px] truncate text-left hover:opacity-70 transition-opacity"
              style={{ color: 'var(--text-primary)' }}
            >
              {title}
            </button>
          </Tooltip>
        )}
      </div>

      {/* ── Live presence avatars ── */}
      <PresenceAvatars />

      <Divider />

      {/* ── Maps ── */}
      <ToolBtn
        icon={MapIcon}
        label="Maps"
        tooltip="Open your saved maps"
        onClick={toggleLeftPanel}
        active={leftPanelOpen}
      />
      <ToolBtn
        icon={Plus}
        label="New"
        tooltip="Create a new blank map"
        onClick={async () => {
          const { id, title, nodes: n, edges: e } = createDefaultMapData()
          await createMapApi(id, title, n, e)
          const meta: MapMeta = { id, title, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), rootColor: '#6366f1' }
          addMapToList(meta)
          navigate(`/map/${id}`)
        }}
      />

      <Divider />

      {/* ── Create ── */}
      <ToolBtn
        icon={Wand2}
        label="Generate"
        tooltip="Generate a map with AI from a topic or text"
        onClick={onOpenGenerateModal}
        accent
        disabled={readOnly}
      />
      <ToolBtn
        icon={Workflow}
        label="Layout"
        tooltip="Auto-arrange all nodes into a clean tree"
        onClick={() => useMindMapStore.getState().autoLayout()}
        disabled={readOnly}
      />

      <Divider />

      {/* ── View ── */}
      <ToolBtn
        icon={Search}
        label="Search"
        tooltip="Search nodes by label"
        shortcut="⌘F"
        onClick={toggleSearch}
      />
      <ToolBtn
        icon={MapIcon}
        label="Fit"
        tooltip="Fit all nodes into view"
        shortcut="⌘0"
        onClick={() => fitView({ duration: 400 })}
      />
      <ToolBtn
        icon={Layers}
        label="Minimap"
        tooltip="Toggle the minimap overview"
        onClick={toggleMinimap}
        active={minimapVisible}
      />

      <Divider />

      {/* ── Export dropdown ── */}
      <ExportMenu title={title} nodes={nodes} edges={edges} />

      <Divider />

      {/* ── AI ── */}
      <ToolBtn
        icon={Sparkles}
        label="AI Tools"
        tooltip="Open AI assistant — expand nodes, summarize, write"
        onClick={toggleRightPanel}
        active={rightPanelOpen}
        accent
      />

      <Divider />

      {/* ── Present ── */}
      <ToolBtn
        icon={MonitorPlay}
        label="Present"
        tooltip="Presentation mode — step through nodes one by one"
        onClick={handlePresentationMode}
      />

      <Divider />

      {/* ── Prefs ── */}
      <ToolBtn
        icon={theme === 'light' ? Moon : Sun}
        label="Theme"
        tooltip={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        onClick={toggleTheme}
      />
      <ToolBtn
        icon={Share2}
        label="Share"
        tooltip="Share this map with a team"
        onClick={onOpenShare}
      />
      <ToolBtn
        icon={Settings}
        label="Settings"
        tooltip="Configure AI provider and model"
        onClick={onOpenSettings}
      />
    </div>
  )
}
