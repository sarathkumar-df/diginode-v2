import { useCallback, useState } from 'react'
import { Trash2, Plus, GitBranch, CheckSquare, Sparkles, UserCircle, GripVertical } from 'lucide-react'
import { motion, AnimatePresence, useDragControls, useMotionValue } from 'framer-motion'
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
  const { selectedNodeIds, floatingToolbarOffset, setFloatingToolbarOffset, setSelectedNodes, setInspectorNode } = useUIStore()
  const { addNode, addSiblingNode, deleteNode, updateNodeColor, updateNodeAdvisor } = useMindMapStore()
  const { toggleRightPanel } = useUIStore()
  const [advisorPickerOpen, setAdvisorPickerOpen] = useState(false)
  const dragControls = useDragControls()
  const x = useMotionValue(floatingToolbarOffset.x)
  const y = useMotionValue(floatingToolbarOffset.y)

  const nodeId = selectedNodeIds[0]
  // Re-read on every render so the chip reflects updates immediately after
  // the user picks an advisor for this node.
  const nodeAdvisor = useMindMapStore((s) => s.nodes.find((n) => n.id === nodeId)?.data.advisor)

  // After adding a child/sibling, move selection to the new node so the AI
  // popover follows it (and stays hidden while it's still in edit mode).
  // Otherwise the parent stays selected and its popover overlaps the new node.
  const handleAddChild = useCallback(() => {
    if (!nodeId) return
    const newId = addNode(nodeId)
    setSelectedNodes([newId])
    setInspectorNode(newId)
  }, [nodeId, addNode, setSelectedNodes, setInspectorNode])
  const handleAddSibling = useCallback(() => {
    if (!nodeId) return
    const newId = addSiblingNode(nodeId)
    setSelectedNodes([newId])
    setInspectorNode(newId)
  }, [nodeId, addSiblingNode, setSelectedNodes, setInspectorNode])
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
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        drag
        dragListener={false}
        dragControls={dragControls}
        dragMomentum={false}
        onDragEnd={() => setFloatingToolbarOffset({ x: x.get(), y: y.get() })}
        style={{
          x,
          y,
          background: 'var(--panel-bg)',
          borderColor: 'var(--panel-border)',
          boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
        }}
        className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 px-2 py-1.5 rounded-2xl border"
      >
        <button
          title="Drag to move"
          onPointerDown={(e) => dragControls.start(e)}
          className="w-5 h-8 flex items-center justify-center cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 touch-none"
          aria-label="Drag toolbar"
        >
          <GripVertical size={14} />
        </button>

        <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1" />

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
