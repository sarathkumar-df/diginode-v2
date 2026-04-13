import { useCallback, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Download, Search, Sun, Moon, Image,
  Sparkles, Layers, Map as MapIcon, Wand2, Settings, Workflow, GitBranch,
  MonitorPlay, FileJson, FileText, ArrowLeft, Check, Share2, History,
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
          style={{ background: '#1f2937', color: 'white', boxShadow: '0 4px 12px rgba(0,0,0,0.25)' }}
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

// ── Icon button ───────────────────────────────────────────────────────────────

function IconBtn({
  icon: Icon,
  label,
  shortcut,
  onClick,
  active,
  accent,
  disabled,
}: {
  icon: React.ElementType
  label: string
  shortcut?: string
  onClick: () => void
  active?: boolean
  accent?: boolean
  disabled?: boolean
}) {
  return (
    <Tooltip label={label} shortcut={shortcut}>
      <button
        onClick={onClick}
        disabled={disabled}
        className="flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg transition-all duration-150 disabled:opacity-40 min-w-[44px]"
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
        <span className="text-[9px] font-medium leading-none">{label}</span>
      </button>
    </Tooltip>
  )
}

function Divider() {
  return <div className="w-px self-stretch my-2 rounded-full flex-shrink-0" style={{ background: 'var(--panel-border)' }} />
}

// ── Export dropdown ───────────────────────────────────────────────────────────

function ExportMenu({ title, nodes, edges }: { title: string; nodes: any; edges: any }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const items = [
    { icon: Image, label: 'PNG image', action: () => { exportToPng(title); setOpen(false) } },
    { icon: FileJson, label: 'JSON file', action: () => { exportToJSON(nodes, edges, title); setOpen(false) } },
    { icon: FileText, label: 'Markdown', action: () => { exportToMarkdown(nodes, edges, title); setOpen(false) } },
  ]

  return (
    <Tooltip label="Export">
      <div ref={ref} className="relative flex flex-col items-center">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg transition-all duration-150 min-w-[44px]"
          style={{
            background: open ? 'var(--canvas-bg)' : 'transparent',
            color: open ? 'var(--text-primary)' : 'var(--text-secondary)',
          }}
          onMouseEnter={(e) => { if (!open) e.currentTarget.style.background = 'var(--canvas-bg)' }}
          onMouseLeave={(e) => { if (!open) e.currentTarget.style.background = 'transparent' }}
        >
          <Download size={15} />
          <span className="text-[9px] font-medium leading-none">Export</span>
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div
              className="absolute top-full mt-2 left-1/2 -translate-x-1/2 rounded-xl border overflow-hidden z-50 shadow-xl"
              style={{ background: 'var(--panel-bg)', borderColor: 'var(--panel-border)', minWidth: 160 }}
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
          </>
        )}
      </div>
    </Tooltip>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  onOpenGenerateModal: () => void
  onOpenFlowGenerate: () => void
  onOpenSettings: () => void
  onOpenShare: () => void
  onOpenHistory: () => void
  readOnly?: boolean
}

// ── Main toolbar ──────────────────────────────────────────────────────────────

export function TopToolbar({ onOpenGenerateModal, onOpenFlowGenerate, onOpenSettings, onOpenShare, onOpenHistory, readOnly = false }: Props) {
  const { activeMap, nodes, edges, addMapToList, activeMapId, updateMapMeta } = useMindMapStore()
  const navigate = useNavigate()
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const titleInputRef = useRef<HTMLInputElement>(null)
  const {
    theme, toggleTheme,
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
    function dfs(id: string) { order.push(id); childrenOf.get(id)?.forEach(dfs) }
    dfs(root.id)
    useUIStore.getState().enterPresentationMode(order)
  }, [])

  return (
    <div
      className="flex items-center h-14 border-b flex-shrink-0 px-3 gap-1"
      style={{ background: 'var(--panel-bg)', borderColor: 'var(--panel-border)' }}
    >
      {/* Back + title */}
      <div className="flex items-center gap-2 mr-2 min-w-0 flex-shrink-0">
        <Tooltip label="Back to dashboard">
          <button
            onClick={() => navigate('/dashboard')}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 flex-shrink-0"
            style={{ color: 'var(--text-muted)' }}
          >
            <ArrowLeft size={14} />
          </button>
        </Tooltip>

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
              className="text-sm font-semibold bg-transparent outline-none border-b w-[140px]"
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
              className="text-sm font-semibold max-w-[160px] truncate text-left hover:opacity-70 transition-opacity"
              style={{ color: 'var(--text-primary)' }}
            >
              {title}
            </button>
          </Tooltip>
        )}
      </div>

      {/* Presence avatars */}
      <PresenceAvatars />

      <Divider />

      {/* Create */}
      <IconBtn
        icon={Wand2}
        label="Generate"
        onClick={onOpenGenerateModal}
        accent
        disabled={readOnly}
      />
      <IconBtn
        icon={GitBranch}
        label="Generate Flow"
        onClick={onOpenFlowGenerate}
        accent
        disabled={readOnly}
      />
      <IconBtn
        icon={Workflow}
        label="Layout"
        onClick={() => useMindMapStore.getState().autoLayout()}
        disabled={readOnly}
      />

      <Divider />

      {/* New map */}
      <IconBtn
        icon={Plus}
        label="New"
        onClick={async () => {
          const { id, title, nodes: n, edges: e } = createDefaultMapData()
          await createMapApi(id, title, n, e)
          const meta: MapMeta = { id, title, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), rootColor: '#6366f1' }
          addMapToList(meta)
          navigate(`/map/${id}`)
        }}
      />

      <Divider />

      {/* View */}
      <IconBtn icon={Search} label="Search" shortcut="⌘F" onClick={toggleSearch} />
      <IconBtn icon={MapIcon} label="Fit" shortcut="⌘0" onClick={() => fitView({ duration: 400 })} />
      <IconBtn icon={Layers} label="Minimap" onClick={toggleMinimap} active={minimapVisible} />

      <Divider />

      {/* Export */}
      <ExportMenu title={title} nodes={nodes} edges={edges} />

      <Divider />

      {/* AI + Present */}
      <IconBtn
        icon={Sparkles}
        label="AI Tools"
        onClick={toggleRightPanel}
        active={rightPanelOpen}
        accent
      />
      <IconBtn icon={MonitorPlay} label="Present" onClick={handlePresentationMode} />

      <Divider />

      {/* Prefs */}
      <IconBtn icon={theme === 'light' ? Moon : Sun} label="Theme" onClick={toggleTheme} />
      <IconBtn icon={History} label="History" onClick={onOpenHistory} />
      <IconBtn icon={Share2} label="Share" onClick={onOpenShare} />
      <IconBtn icon={Settings} label="Settings" onClick={onOpenSettings} />
    </div>
  )
}
