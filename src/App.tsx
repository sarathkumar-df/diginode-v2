import { useState, useEffect } from 'react'
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

function AppInner() {
  const { theme } = useUIStore()
  const [generateModalOpen, setGenerateModalOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Sync theme class on mount
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  return (
    <div className="w-screen h-screen overflow-hidden relative" style={{ background: 'var(--canvas-bg)' }}>
      {/* Canvas fills the whole screen */}
      <MindMapCanvas />

      {/* Overlaid UI */}
      <TopToolbar onOpenGenerateModal={() => setGenerateModalOpen(true)} onOpenSettings={() => setSettingsOpen(true)} />
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

export default function App() {
  return (
    <ReactFlowProvider>
      <AppInner />
    </ReactFlowProvider>
  )
}
