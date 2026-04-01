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
import { PresentationMode } from '@/components/UI/PresentationMode'
import { useUIStore } from '@/store/uiStore'
import { useMindMapStore } from '@/store/mindmapStore'
import { saveMap } from '@/services/mapService'
import { fetchSharedMap } from '@/services/shareService'
import { RoomProvider, presenceColor } from '@/liveblocks.config'
import { useCurrentUser } from '@/auth/AuthProvider'
import { MapPermission } from '@/types'
import { Loader2, Eye } from 'lucide-react'

// Auto-save debounce in ms — saves 2s after the last change
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [permission, setPermission] = useState<MapPermission>('edit')

  // Track whether changes have been made since last save to avoid saving on load
  const isDirtyRef = useRef(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>()

  // Sync theme class
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  // Load map from API on mount
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

  // Auto-save: debounce writes after node/edge changes
  useEffect(() => {
    // Skip the initial render before the map is loaded
    if (!isDirtyRef.current) {
      isDirtyRef.current = true
      return
    }
    if (!activeMapId) return

    if (permission !== 'edit') return
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveMap(activeMapId, nodes, edges)
    }, SAVE_DEBOUNCE)

    return () => clearTimeout(saveTimerRef.current)
  }, [nodes, edges])

  if (loading) {
    return (
      <div
        className="w-screen h-screen flex items-center justify-center"
        style={{ background: 'var(--canvas-bg)' }}
      >
        <Loader2 size={28} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
      </div>
    )
  }

  if (error) {
    return (
      <div
        className="w-screen h-screen flex items-center justify-center"
        style={{ background: 'var(--canvas-bg)' }}
      >
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
      <div className="w-screen h-screen overflow-hidden relative" style={{ background: 'var(--canvas-bg)' }}>
        <MindMapCanvas readOnly={isViewOnly} />
        {/* Sync bridge: keeps Zustand ↔ Liveblocks in sync */}
        {activeMapId && <LiveblocksSync mapId={activeMapId} />}
        <TopToolbar
          onOpenGenerateModal={() => setGenerateModalOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenShare={() => setShareOpen(true)}
          readOnly={isViewOnly}
        />
        {isViewOnly && (
          <div
            className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium shadow-lg"
            style={{ background: 'var(--panel-bg)', borderColor: 'var(--panel-border)', border: '1px solid', color: 'var(--text-secondary)' }}
          >
            <Eye size={13} />
            View only — you can explore but not edit this map
          </div>
        )}
        <FloatingToolbar />
        <LeftSidebar />
        <RightSidebar />
        <SearchPanel />
        <FocusModeBar />
        <GenerateMapModal open={generateModalOpen} onClose={() => setGenerateModalOpen(false)} />
        <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
        <ShareModal
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          mapId={activeMapId ?? ''}
          mapTitle={activeMap()?.title ?? ''}
        />
        <PresentationMode />
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
