import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ReactFlowProvider } from 'reactflow'
import { MindMapCanvas } from '@/components/Canvas/MindMapCanvas'
import { TopToolbar } from '@/components/Toolbar/TopToolbar'
import { FloatingToolbar } from '@/components/Toolbar/FloatingToolbar'
import { LeftSidebar } from '@/components/Sidebar/LeftSidebar'
import { RightSidebar } from '@/components/Sidebar/RightSidebar'
import { SearchPanel } from '@/components/UI/SearchPanel'
import { FocusModeBar } from '@/components/UI/FocusMode'
import { GenerateMapModal } from '@/components/UI/GenerateMapModal'
import { SettingsModal } from '@/components/UI/SettingsModal'
import { PresentationMode } from '@/components/UI/PresentationMode'
import { useUIStore } from '@/store/uiStore'
import { useMindMapStore } from '@/store/mindmapStore'

function MapPageInner() {
  const { mapId } = useParams<{ mapId: string }>()
  const navigate = useNavigate()
  const { theme } = useUIStore()
  const { maps, switchMap } = useMindMapStore()
  const [generateModalOpen, setGenerateModalOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Sync theme class
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  // Phase 1: load map from local store by ID
  // Phase 2: this will call GET /api/maps/:mapId from the database
  useEffect(() => {
    if (!mapId) { navigate('/dashboard', { replace: true }); return }

    if (mapId === 'local') {
      // Newly created map — use whatever is active in the store
      return
    }

    const map = maps.find((m) => m.id === mapId)
    if (map) {
      switchMap(mapId)
    } else if (mapId !== 'local') {
      // Map not found in local store — redirect to dashboard
      // Phase 2: will fetch from API before redirecting
      navigate('/dashboard', { replace: true })
    }
  }, [mapId, maps, switchMap, navigate])

  return (
    <div className="w-screen h-screen overflow-hidden relative" style={{ background: 'var(--canvas-bg)' }}>
      <MindMapCanvas />
      <TopToolbar
        onOpenGenerateModal={() => setGenerateModalOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <FloatingToolbar />
      <LeftSidebar />
      <RightSidebar />
      <SearchPanel />
      <FocusModeBar />
      <GenerateMapModal open={generateModalOpen} onClose={() => setGenerateModalOpen(false)} />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <PresentationMode />
    </div>
  )
}

export function MapPage() {
  return (
    <ReactFlowProvider>
      <MapPageInner />
    </ReactFlowProvider>
  )
}
