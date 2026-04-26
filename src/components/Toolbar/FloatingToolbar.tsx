import { useCallback, useState } from 'react'
import { Trash2, Plus, GitBranch, CheckSquare, Sparkles, UserCircle } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useMindMapStore } from '@/store/mindmapStore'
import { useUIStore } from '@/store/uiStore'
import { NODE_COLORS, MapAdvisor } from '@/types'
import { AdvisorPicker } from '@/components/UI/AdvisorPicker'

function ToolBtn({
  icon: Icon,
  label,
  onClick,
  danger,
  color,
}: {
  icon: React.ElementType
  label: string
  onClick: () => void
  danger?: boolean
  color?: string
}) {
  return (
    <button
      title={label}
      onClick={onClick}
      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-150 ${
        danger
          ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'
          : 'hover:bg-gray-100 dark:hover:bg-gray-700'
      }`}
      style={color ? { color } : { color: 'var(--text-secondary)' }}
    >
      <Icon size={15} />
    </button>
  )
}

export function FloatingToolbar() {
  const { selectedNodeIds } = useUIStore()
  const { addNode, addSiblingNode, deleteNode, updateNodeColor, updateNodeAdvisor } = useMindMapStore()
  const { toggleRightPanel } = useUIStore()
  const [advisorPickerOpen, setAdvisorPickerOpen] = useState(false)

  const nodeId = selectedNodeIds[0]
  // Re-read on every render so the chip reflects updates immediately after
  // the user picks an advisor for this node.
  const nodeAdvisor = useMindMapStore((s) => s.nodes.find((n) => n.id === nodeId)?.data.advisor)

  const handleAddChild = useCallback(() => nodeId && addNode(nodeId), [nodeId, addNode])
  const handleAddSibling = useCallback(() => nodeId && addSiblingNode(nodeId), [nodeId, addSiblingNode])
  const handleDelete = useCallback(() => nodeId && deleteNode(nodeId), [nodeId, deleteNode])
  const handleChecklist = useCallback(() => {
    if (!nodeId) return
    useMindMapStore.setState((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, checked: n.data.checked === undefined ? false : undefined } }
          : n
      ),
    }))
  }, [nodeId])

  const handlePickAdvisor = useCallback((advisor: MapAdvisor | null) => {
    if (nodeId) updateNodeAdvisor(nodeId, advisor)
  }, [nodeId, updateNodeAdvisor])

  if (!nodeId) return null

  return (
    <AnimatePresence>
      <motion.div
        key="floating-toolbar"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        transition={{ duration: 0.15 }}
        className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 px-3 py-1.5 rounded-2xl border"
        style={{
          background: 'var(--panel-bg)',
          borderColor: 'var(--panel-border)',
          boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
        }}
      >
        <ToolBtn icon={Plus} label="Add Child (Tab)" onClick={handleAddChild} />
        <ToolBtn icon={GitBranch} label="Add Sibling (Enter)" onClick={handleAddSibling} />
        <ToolBtn icon={CheckSquare} label="Toggle Checklist" onClick={handleChecklist} />

        <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1" />

        {NODE_COLORS.slice(0, 6).map((color) => (
          <button
            key={color}
            title={`Color: ${color}`}
            onClick={() => nodeId && updateNodeColor(nodeId, color)}
            className="w-4 h-4 rounded-full border-2 border-white dark:border-gray-800 hover:scale-125 transition-transform flex-shrink-0"
            style={{ background: color }}
          />
        ))}

        <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1" />

        <ToolBtn icon={Sparkles} label="AI Expand" onClick={toggleRightPanel} color="#6366f1" />
        <ToolBtn
          icon={UserCircle}
          label={nodeAdvisor ? `Advising as ${nodeAdvisor.label} — click to change` : 'Ask a different advisor for this node'}
          onClick={() => setAdvisorPickerOpen(true)}
          color={nodeAdvisor ? '#6366f1' : undefined}
        />

        <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1" />

        <ToolBtn icon={Trash2} label="Delete (Backspace)" onClick={handleDelete} danger />
      </motion.div>
      <AdvisorPicker
        open={advisorPickerOpen}
        current={nodeAdvisor ?? null}
        onClose={() => setAdvisorPickerOpen(false)}
        onPick={handlePickAdvisor}
      />
    </AnimatePresence>
  )
}
