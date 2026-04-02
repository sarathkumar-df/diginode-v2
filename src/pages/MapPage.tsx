import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ReactFlowProvider } from 'reactflow'
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
import { useUIStore } from '@/store/uiStore'
import { useMindMapStore } from '@/store/mindmapStore'
import { saveMap } from '@/services/mapService'
import { fetchSharedMap } from '@/services/shareService'
import { RoomProvider, presenceColor } from '@/liveblocks.config'
import { useCurrentUser } from '@/auth/AuthProvider'
import { MapPermission } from '@/types'
import { Loader2, Eye } from 'lucide-react'

const SAVE_DEBOUNCE = 2000

function MapPageInner() {
  const { mapId } = useParams<{ mapId: string }>()
  const navigate = useNavigate()
  const { theme } = useUIStore()
  const { nodes, edges, activeMapId, activeMap, loadMap, setMapList, maps } = useMindMapStore()
  const currentUser = useCurrentUser()

  const [generateModalOpen, setGenerateModalOpen] = useState(false)
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
    saveTimerRef.current = setTimeout(() => saveMap(activeMapId, nodes, edges), SAVE_DEBOUNCE)
    return () => clearTimeout(saveTimerRef.current)
  }, [nodes, edges])

  if (loading) {
    return (
      <div className="w-screen h-screen flex items-center justify-center" style={{ background: 'var(--canvas-bg)' }}>
        <Loader2 size={28} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
      </div>
    )
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
