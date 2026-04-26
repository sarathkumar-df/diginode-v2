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
import { AdvisorPicker } from '@/components/UI/AdvisorPicker'
import { VersionHistoryPanel } from '@/components/UI/VersionHistoryPanel'
import { PresentationMode } from '@/components/UI/PresentationMode'
import { FlowPreviewModal } from '@/components/Flow/FlowPreviewModal'
import { useUIStore } from '@/store/uiStore'
import { useMindMapStore } from '@/store/mindmapStore'
import { saveMap, updateMapAdvisor } from '@/services/mapService'
import { MapAdvisor } from '@/types'
import { captureThumb } from '@/utils/captureThumb'
import { fetchSharedMap } from '@/services/shareService'
import { RoomProvider, presenceColor } from '@/liveblocks.config'
import { useCurrentUser } from '@/auth/AuthProvider'
import { LoadingShell } from '@/components/UI/LoadingShell'
import { MapPermission } from '@/types'
import {
  Eye, Layers, Map as MapIcon, ArrowLeft, Plus, Wand2,
  Search, Sparkles, Share2, Download, MoreHorizontal,
} from 'lucide-react'

const SAVE_DEBOUNCE = 2000

function MapPageInner() {
  const { mapId } = useParams<{ mapId: string }>()
  const navigate = useNavigate()
  const { theme } = useUIStore()
  const { nodes, edges, activeMapId, activeMap, loadMap, setMapList, maps, advisor, setAdvisor } = useMindMapStore()
  const currentUser = useCurrentUser()
  const { fitView, getViewport, setViewport } = useReactFlow()

  const [generateModalOpen, setGenerateModalOpen] = useState(false)
  const [flowGenerateOpen, setFlowGenerateOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [advisorOpen, setAdvisorOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [permission, setPermission] = useState<MapPermission>('edit')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const isDirtyRef = useRef(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>()
  // Tracks which slice of state was last persisted, so we can skip the
  // expensive thumbnail capture when only the chat history changed.
  const lastSavedRef = useRef({ nodes, edges })
  // Read chat history reactively so it triggers the auto-save effect without
  // pulling the whole uiStore into this component.
  const aiMessages = useUIStore((s) => s.aiMessages)
  const aiStatus = useUIStore((s) => s.aiStatus)

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
          loadMap({ id: data.id, nodes: data.nodes, edges: data.edges, advisor: data.advisor ?? null })
          // Hydrate the chat panel with this map's saved history. Wipes any
          // chat from a previously-open map so conversations don't leak across.
          useUIStore.getState().setAIMessages(data.chatHistory ?? [])
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
    // While a chat is mid-stream, aiMessages updates ~50x/sec as chunks arrive.
    // Each one resets this debounce, so the save naturally fires only after
    // streaming pauses. Avoids saving partial mid-stream content.
    if (aiStatus === 'streaming') return
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      const nodesOrEdgesChanged =
        lastSavedRef.current.nodes !== nodes || lastSavedRef.current.edges !== edges
      let thumb: string | null = null
      if (nodesOrEdgesChanged) {
        // Zoom to fit all nodes, capture thumbnail, then restore viewport.
        // Skipped when only the chat changed — thumbnails capture the canvas.
        const prevViewport = getViewport()
        fitView({ duration: 0, padding: 0.15 })
        await new Promise<void>((r) => { requestAnimationFrame(() => { requestAnimationFrame(() => r()) }) })
        thumb = await captureThumb()
        setViewport(prevViewport, { duration: 0 })
      }
      saveMap(activeMapId, nodes, edges, thumb, undefined, aiMessages)
      lastSavedRef.current = { nodes, edges }
    }, SAVE_DEBOUNCE)
    return () => clearTimeout(saveTimerRef.current)
  }, [nodes, edges, aiMessages, aiStatus])

  // Apply + persist a new advisor (or null to clear). Updates the store
  // immediately so the next AI call uses the new lens, and writes to the DB
  // independently of the auto-save debounce.
  const handleAdvisorChange = (next: MapAdvisor | null) => {
    setAdvisor(next)
    if (activeMapId) updateMapAdvisor(activeMapId, next)
  }

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
            onOpenAdvisor={() => setAdvisorOpen(true)}
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
            <AdvisorPicker
              open={advisorOpen}
              current={advisor}
              onClose={() => setAdvisorOpen(false)}
              onPick={handleAdvisorChange}
            />
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

// Mirrors the live TopToolbar's primary buttons (the ones that stay inline
// outside the More dropdown). Keep this in sync if the toolbar layout shifts.
const TOOLBAR_ICONS = [
  Wand2, Sparkles, Search, MapIcon, Download, Share2, MoreHorizontal,
]

// Mind-map-shaped canvas placeholder. Rendered while the real map is
// fetched — same grammar as the live canvas (rounded pill nodes, curved
// bezier edges, brand-colored branches) so the load reads as "your map is
// loading" rather than a generic loading spinner. Colors are dimmed so it
// can never be mistaken for real content.
function CanvasSkeletonMap() {
  const branches = [{ y: 60 }, { y: 130 }, { y: 200 }, { y: 270 }, { y: 340 }]
  const rootX = 100
  const rootY = 178
  const rootW = 150
  const rootH = 44
  const childX = 460
  const childW = 140
  const childH = 36

  return (
    <svg
      data-skeleton-keep
      viewBox="0 0 720 420"
      className="w-full max-w-3xl"
      preserveAspectRatio="xMidYMid meet"
      fill="none"
      aria-hidden
    >
      {/* Curved bezier edges — draw in on a staggered loop. pathLength=1
          lets us use unitless dasharray so all paths share the same keyframes
          regardless of length. Animation rules live in index.css. */}
      {branches.map((b, i) => {
        const sx = rootX + rootW
        const sy = rootY + rootH / 2
        const ex = childX
        const ey = b.y + childH / 2
        const mx = (sx + ex) / 2
        return (
          <path
            key={`e-${i}`}
            className="skel-edge"
            d={`M ${sx} ${sy} C ${mx} ${sy}, ${mx} ${ey}, ${ex} ${ey}`}
            stroke="var(--text-muted)"
            strokeWidth={2.5}
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray={1}
            style={{ ['--skel-delay' as string]: `${i * 0.15}s` }}
          />
        )
      })}

      {/* Root node — static "given". The branches grow out from it. */}
      <rect
        x={rootX} y={rootY}
        width={rootW} height={rootH}
        rx={11} ry={11}
        fill="var(--panel-bg)"
        stroke="#6366f1"
        strokeWidth={1.5}
        opacity={0.95}
      />
      <rect
        x={rootX + 18} y={rootY + rootH / 2 - 5}
        width={rootW - 36} height={10}
        rx={5} ry={5}
        fill="#6366f1"
        opacity={0.32}
      />

      {/* Child nodes — pop in just after their edge finishes drawing. The
          group's opacity is animated; inner shapes inherit it. */}
      {branches.map((b, i) => (
        <g
          key={`n-${i}`}
          className="skel-child"
          style={{ ['--skel-delay' as string]: `${i * 0.15}s` }}
        >
          <rect
            x={childX} y={b.y}
            width={childW} height={childH}
            rx={9} ry={9}
            fill="var(--panel-bg)"
            stroke="var(--panel-border)"
            strokeWidth={1}
          />
          <rect
            x={childX} y={b.y}
            width={3.5} height={childH}
            fill="var(--text-muted)"
            opacity={0.45}
          />
          <rect
            x={childX + 16} y={b.y + childH / 2 - 4}
            width={childW - 32} height={8}
            rx={4} ry={4}
            fill="var(--text-muted)"
            opacity={0.22}
          />
        </g>
      ))}
    </svg>
  )
}

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

          {/* Canvas — silhouette of the actual mind-map shape (rounded pills
              + curved colored edges) so the loading state previews what's
              about to render. data-skeleton-keep opts out of LoadingShell's
              SVG-hide rule. */}
          <div className="flex-1 relative overflow-hidden flex items-center justify-center px-12">
            <CanvasSkeletonMap />
          </div>
        </div>
      </div>
    </LoadingShell>
  )
}
