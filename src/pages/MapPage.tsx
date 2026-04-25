import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ReactFlowProvider, useReactFlow } from 'reactflow'
import { LiveList, LiveObject } from '@liveblocks/client'
import { MindMapCanvas } from '@/components/Canvas/MindMapCanvas'
import { LiveblocksSync } from '@/components/Canvas/LiveblocksSync'
import { TopToolbar } from '@/components/Toolbar/TopToolbar'
import { FloatingToolbar } from '@/components/Toolbar/FloatingToolbar'
import { LeftSidebar } from '@/components/Sidebar/LeftSidebar'
import { RightSidebar } from '@/components/Sidebar/RightSidebar'
import { SearchPanel } from '@/components/UI/SearchPanel'
import { FocusModeBar } from '@/components/UI/FocusMode'
import { GenerateMapModal } from '@/components/UI/GenerateMapModal'
import { SettingsModal } from '@/components/UI/SettingsModal'
import { ShareModal } from '@/components/UI/ShareModal'
import { VersionHistoryPanel } from '@/components/UI/VersionHistoryPanel'
import { PresentationMode } from '@/components/UI/PresentationMode'
import { FlowPreviewModal } from '@/components/Flow/FlowPreviewModal'
import { useUIStore } from '@/store/uiStore'
import { useMindMapStore } from '@/store/mindmapStore'
import { saveMap } from '@/services/mapService'
import { captureThumb } from '@/utils/captureThumb'
import { fetchSharedMap } from '@/services/shareService'
import { RoomProvider, presenceColor } from '@/liveblocks.config'
import { useCurrentUser } from '@/auth/AuthProvider'
import { LoadingShell } from '@/components/UI/LoadingShell'
import { MapPermission } from '@/types'
import {
  Eye, Layers, Map as MapIcon, ArrowLeft, Plus, Wand2, GitBranch, Workflow,
  Search, Sparkles, MonitorPlay, Sun, History, Share2, Settings, Download,
} from 'lucide-react'

const SAVE_DEBOUNCE = 2000

function MapPageInner() {
  const { mapId } = useParams<{ mapId: string }>()
  const navigate = useNavigate()
  const { theme } = useUIStore()
  const { nodes, edges, activeMapId, activeMap, loadMap, setMapList, maps } = useMindMapStore()
  const currentUser = useCurrentUser()
  const { fitView, getViewport, setViewport } = useReactFlow()

  const [generateModalOpen, setGenerateModalOpen] = useState(false)
  const [flowGenerateOpen, setFlowGenerateOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [permission, setPermission] = useState<MapPermission>('edit')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const isDirtyRef = useRef(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  useEffect(() => {
    if (!mapId) { navigate('/dashboard', { replace: true }); return }
    let cancelled = false

    async function load() {
      setLoading(true)
      setError('')
      isDirtyRef.current = false
      try {
        const data = await fetchSharedMap(mapId!)
        if (!cancelled) {
          loadMap({ id: data.id, nodes: data.nodes, edges: data.edges })
          setPermission(data.permission)
          setMapList(
            maps.some((m) => m.id === data.id)
              ? maps
              : [{ id: data.id, title: data.title, createdAt: data.createdAt, updatedAt: data.updatedAt }, ...maps]
          )
          // Fresh placeholder map: drop the user straight into editing the root
          // with the text selected, so typing replaces "Central Topic".
          if (
            data.permission === 'edit' &&
            data.nodes.length === 1 &&
            data.nodes[0].data?.label === 'Central Topic'
          ) {
            useMindMapStore.getState().setNodeEditing(data.nodes[0].id, true)
            useUIStore.getState().setSelectedNodes([data.nodes[0].id])
          }
        }
      } catch {
        if (!cancelled) {
          setError('Map not found or you do not have access.')
          setTimeout(() => navigate('/dashboard', { replace: true }), 2000)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [mapId])

  useEffect(() => {
    if (!isDirtyRef.current) { isDirtyRef.current = true; return }
    if (!activeMapId || permission !== 'edit') return
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      // Zoom to fit all nodes, capture thumbnail, then restore viewport
      const prevViewport = getViewport()
      fitView({ duration: 0, padding: 0.15 })
      // Wait two frames for React Flow to apply the new viewport
      await new Promise<void>((r) => { requestAnimationFrame(() => { requestAnimationFrame(() => r()) }) })
      const thumb = await captureThumb()
      setViewport(prevViewport, { duration: 0 })
      saveMap(activeMapId, nodes, edges, thumb)
    }, SAVE_DEBOUNCE)
    return () => clearTimeout(saveTimerRef.current)
  }, [nodes, edges])

  if (loading) {
    return <MapPageSkeleton />
  }

  if (error) {
    return (
      <div className="w-screen h-screen flex items-center justify-center" style={{ background: 'var(--canvas-bg)' }}>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{error}</p>
      </div>
    )
  }

  const isViewOnly = permission === 'view'

  return (
    <RoomProvider
      id={`map-${activeMapId}`}
      initialPresence={{
        cursor: null,
        name: currentUser?.name ?? 'Anonymous',
        color: presenceColor(currentUser?.id ?? 'anon'),
      }}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      initialStorage={{
        nodes: new LiveList(nodes.map((n) => new LiveObject({ ...n } as any))),
        edges: new LiveList(edges.map((e) => new LiveObject({ ...e } as any))),
      } as any}
    >
      {/* Root: full screen flex row */}
      <div className="flex w-screen h-screen overflow-hidden" style={{ background: 'var(--canvas-bg)' }}>

        {/* ── Left sidebar ── */}
        <LeftSidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((c) => !c)}
        />

        {/* ── Main column: header + canvas ── */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

          {/* Header toolbar */}
          <TopToolbar
            onOpenGenerateModal={() => setGenerateModalOpen(true)}
            onOpenFlowGenerate={() => setFlowGenerateOpen(true)}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenShare={() => setShareOpen(true)}
            onOpenHistory={() => setHistoryOpen(true)}
            readOnly={isViewOnly}
          />

          {/* Canvas area — relative so overlays position correctly inside it */}
          <div className="flex-1 relative overflow-hidden">
            <MindMapCanvas readOnly={isViewOnly} />
            {activeMapId && <LiveblocksSync mapId={activeMapId} />}

            {/* View-only badge */}
            {isViewOnly && (
              <div
                className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium shadow-lg pointer-events-none"
                style={{ background: 'var(--panel-bg)', border: '1px solid var(--panel-border)', color: 'var(--text-secondary)' }}
              >
                <Eye size={13} />
                View only — you can explore but not edit this map
              </div>
            )}

            {/* Overlays that live inside the canvas area */}
            <FloatingToolbar />
            <RightSidebar />
            <SearchPanel />
            <FocusModeBar />
            <PresentationMode />

            {/* Modals / panels */}
            <GenerateMapModal open={generateModalOpen} onClose={() => setGenerateModalOpen(false)} />
            <FlowPreviewModal
              open={flowGenerateOpen}
              onClose={() => setFlowGenerateOpen(false)}
              mapId={activeMapId ?? ''}
            />
            <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
            <ShareModal
              open={shareOpen}
              onClose={() => setShareOpen(false)}
              mapId={activeMapId ?? ''}
              mapTitle={activeMap()?.title ?? ''}
            />
            {historyOpen && activeMapId && (
              <VersionHistoryPanel
                mapId={activeMapId}
                permission={permission}
                onClose={() => setHistoryOpen(false)}
              />
            )}
          </div>
        </div>
      </div>
    </RoomProvider>
  )
}

export function MapPage() {
  return (
    <ReactFlowProvider>
      <MapPageInner />
    </ReactFlowProvider>
  )
}

// ── Loading skeleton ─────────────────────────────────────────────────────────
// Shadow-render: we render real-looking JSX (real icons, real text labels,
// real classNames) and let LoadingShell's CSS mask everything into pulsing
// grey blocks. Future UI changes to the toolbar or sidebar layout flow into
// the skeleton automatically — only button counts need to be kept in sync.

const TOOLBAR_ICONS = [
  Wand2, GitBranch, Workflow, Plus, Search, MapIcon, Layers, Download,
  Sparkles, MonitorPlay, Sun, History, Share2, Settings,
]

function MapPageSkeleton() {
  return (
    <LoadingShell loading>
      <div
        className="flex w-screen h-screen overflow-hidden"
        style={{ background: 'var(--canvas-bg)' }}
      >
        {/* Left sidebar — same shape as the real LeftSidebar */}
        <aside
          data-skeleton-frame
          className="flex flex-col border-r flex-shrink-0"
          style={{ width: 220, background: 'var(--panel-bg)', borderColor: 'var(--panel-border)' }}
        >
          <div
            className="flex items-center h-14 flex-shrink-0 border-b px-3.5 gap-2.5"
            style={{ borderColor: 'var(--panel-border)' }}
          >
            <div className="w-7 h-7 rounded-lg bg-indigo-500 flex items-center justify-center">
              <Layers size={14} color="white" />
            </div>
            <span className="font-bold text-sm tracking-tight">DigiNode</span>
          </div>

          <div className="flex items-center h-10 px-3.5 gap-2">
            <MapIcon size={14} />
            <span className="text-xs font-semibold uppercase tracking-widest flex-1">My Maps</span>
            <button className="w-6 h-6 rounded-md bg-indigo-500 text-white">
              <Plus size={12} />
            </button>
          </div>

          <div className="flex-1 py-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="mx-2 mb-0.5 rounded-xl flex items-center gap-2 px-2.5 py-2"
              >
                <div className="w-2 h-2 rounded-full flex-shrink-0 bg-indigo-500" />
                <span className="text-sm font-medium truncate">Loading map title</span>
              </div>
            ))}
          </div>
        </aside>

        {/* Main column */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          {/* Top toolbar */}
          <div
            data-skeleton-frame
            className="flex items-center h-14 border-b flex-shrink-0 px-3 gap-1"
            style={{ background: 'var(--panel-bg)', borderColor: 'var(--panel-border)' }}
          >
            <button className="w-7 h-7 rounded-lg flex items-center justify-center">
              <ArrowLeft size={14} />
            </button>
            <span className="text-sm font-semibold ml-2">Loading map title</span>
            <div className="w-px self-stretch my-2 mx-2" style={{ background: 'var(--panel-border)' }} />

            {TOOLBAR_ICONS.map((Icon, i) => (
              <button
                key={i}
                className="flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg min-w-[44px]"
              >
                <Icon size={15} />
                <span className="text-[9px] font-medium leading-none">Label</span>
              </button>
            ))}

            <div className="flex-1" />
            <div className="w-8 h-8 rounded-full bg-indigo-500" />
          </div>

          {/* Canvas — faint mind-map silhouette. data-skeleton-keep opts out
              of the global SVG visibility:hidden rule applied by LoadingShell. */}
          <div className="flex-1 relative overflow-hidden flex items-center justify-center">
            <svg
              data-skeleton-keep
              viewBox="0 0 600 360"
              className="w-3/4 max-w-2xl"
              fill="none"
              aria-hidden
            >
              {[
                'M 300 180 Q 230 130 140 90',
                'M 300 180 Q 230 230 140 280',
                'M 300 180 Q 380 130 470 80',
                'M 300 180 Q 400 180 470 180',
                'M 300 180 Q 380 230 470 280',
              ].map((d, i) => (
                <path key={i} d={d} stroke="var(--panel-border)" strokeWidth="2" strokeLinecap="round" />
              ))}
              <circle cx={300} cy={180} r={28} fill="var(--panel-border)" />
              {[[140, 90], [140, 280], [470, 80], [470, 180], [470, 280]].map(([x, y], i) => (
                <circle key={i} cx={x} cy={y} r={16} fill="var(--panel-border)" />
              ))}
            </svg>
          </div>
        </div>
      </div>
    </LoadingShell>
  )
}
