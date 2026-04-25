import { memo, useCallback, useRef, useEffect, useState } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import { motion } from 'framer-motion'
import { ChevronRight, ChevronDown, CheckSquare, Square } from 'lucide-react'
import { useMindMapStore } from '@/store/mindmapStore'
import { useUIStore } from '@/store/uiStore'
import { MindMapNodeData, NodeShape } from '@/types'

const SHAPE_CLASSES: Record<NodeShape, string> = {
  rounded: 'rounded-xl',
  rectangle: 'rounded-md',
  ellipse: 'rounded-[50%]',
  pill: 'rounded-full',
}

function NodeContent({ id, data }: { id: string; data: MindMapNodeData }) {
  const { updateNodeLabel, setNodeEditing, toggleNodeChecked } = useMindMapStore()
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [localLabel, setLocalLabel] = useState(data.label)

  useEffect(() => {
    // Don't clobber the user's in-progress text if a remote/live sync delivers
    // a stale label while they're typing — keep localLabel as the source of truth
    // until they explicitly blur or escape.
    if (data.isEditing) return
    setLocalLabel(data.label)
  }, [data.label, data.isEditing])

  useEffect(() => {
    if (data.isEditing && inputRef.current) {
      inputRef.current.focus()
      if (data.editCursorAtEnd) {
        const end = inputRef.current.value.length
        inputRef.current.setSelectionRange(end, end)
      } else {
        inputRef.current.select()
      }
    }
  }, [data.isEditing, data.editCursorAtEnd])

  // Grow the textarea to fit its content so the node keeps the same height
  // when toggling between view and edit mode (otherwise rows={1} would collapse it).
  useEffect(() => {
    if (!data.isEditing) return
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [data.isEditing, localLabel])

  const handleBlur = useCallback(() => {
    const trimmed = localLabel.trim()
    if (trimmed) updateNodeLabel(id, trimmed)
    else setLocalLabel(data.label)
    setNodeEditing(id, false)
  }, [id, localLabel, data.label, updateNodeLabel, setNodeEditing])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        inputRef.current?.blur()
      }
      if (e.key === 'Escape') {
        setLocalLabel(data.label)
        setNodeEditing(id, false)
      }
      e.stopPropagation()
    },
    [id, data.label, setNodeEditing]
  )

  const isRoot = data.level === 0

  return (
    <div className="flex items-center gap-2 w-full">
      {/* Checklist toggle */}
      {data.checked !== undefined && (
        <button
          onClick={(e) => { e.stopPropagation(); toggleNodeChecked(id) }}
          className="flex-shrink-0 text-current opacity-70 hover:opacity-100 transition-opacity"
        >
          {data.checked
            ? <CheckSquare size={14} />
            : <Square size={14} />
          }
        </button>
      )}

      {/* Icon */}
      {data.icon && (
        <span className="flex-shrink-0 text-base leading-none">{data.icon}</span>
      )}

      {/* Label */}
      {data.isEditing ? (
        <textarea
          ref={inputRef}
          value={localLabel}
          onChange={(e) => setLocalLabel(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          rows={1}
          className="node-label-input"
          style={{
            fontSize: isRoot ? 16 : 13,
            fontWeight: isRoot ? 700 : 500,
            color: isRoot ? data.color : 'var(--text-primary)',
          }}
        />
      ) : (
        <span
          className={`leading-snug text-center ${isRoot ? 'font-bold' : 'font-medium'} ${data.checked ? 'line-through opacity-60' : ''}`}
          style={{
            fontSize: isRoot ? 16 : 13,
            color: isRoot ? data.color : 'var(--text-primary)',
          }}
          onDoubleClick={(e) => {
            e.stopPropagation()
            setNodeEditing(id, true)
          }}
        >
          {data.label}
        </span>
      )}
    </div>
  )
}

function MindMapNodeComponent({ id, data, selected }: NodeProps<MindMapNodeData>) {
  const { toggleNodeCollapsed } = useMindMapStore()
  const { focusMode, selectedNodeIds, setInspectorNode, presentationMode, presentationOrder, presentationIndex, dropTargetId } = useUIStore()
  const isSelected = selected || selectedNodeIds.includes(id)
  const isRoot = data.level === 0
  const shapeClass = SHAPE_CLASSES[data.shape ?? 'rounded']

  const isFocusedOut = focusMode && !isSelected
  const isPresentationDimmed = presentationMode && presentationOrder[presentationIndex] !== id
  const isDropTarget = dropTargetId === id

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      setInspectorNode(id)
      useUIStore.getState().setSelectedNodes([id])
    },
    [id, setInspectorNode]
  )

  return (
    <motion.div
      initial={{ scale: 0.6, opacity: 0, y: 6 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      exit={{ scale: 0.7, opacity: 0, y: -4 }}
      transition={{
        type: 'spring',
        stiffness: 420,
        damping: 28,
        opacity: { duration: 0.18 },
      }}
      className={`mindmap-node ${shapeClass} ${isSelected ? 'selected' : ''} ${(isFocusedOut || isPresentationDimmed) ? 'focused-out' : ''} ${isDropTarget ? 'drop-target' : ''}`}
      style={{
        minWidth: isRoot ? 120 : 90,
        maxWidth: isRoot ? 200 : 160,
        padding: isRoot ? '14px 20px' : '8px 14px',
        borderLeft: isRoot ? 'none' : `3px solid ${data.color}`,
        borderTop: isRoot ? `3px solid ${data.color}` : 'none',
        position: 'relative',
      }}
      onClick={handleClick}
    >
      {/* Target handles — accept connections from any direction */}
      <Handle type="target" position={Position.Left} id="left" />
      <Handle type="target" position={Position.Top} id="top" />
      <Handle type="target" position={Position.Bottom} id="bottom" />

      {/* Source handle — drag from here to create a new child node */}
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        title="Drag to create a connected node"
      />

      {/* Content */}
      <NodeContent id={id} data={data} />

      {/* Collapse toggle (show only if has children) */}
      {data.collapsed !== undefined && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            toggleNodeCollapsed(id)
          }}
          className="absolute -right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full flex items-center justify-center"
          style={{
            background: data.color,
            color: 'white',
            fontSize: 10,
          }}
        >
          {data.collapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
        </button>
      )}
    </motion.div>
  )
}

export const MindMapNode = memo(MindMapNodeComponent)
