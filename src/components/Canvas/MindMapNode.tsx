import { memo, useCallback, useRef, useEffect, useState } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import { motion } from 'framer-motion'
import { ChevronRight, ChevronDown, CheckSquare, Square, Sparkles } from 'lucide-react'
import { useMindMapStore } from '@/store/mindmapStore'
import { useUIStore } from '@/store/uiStore'
import { MindMapNodeData, NodeShape } from '@/types'
import { findAdvisor } from '@/data/advisors'

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

  // While true, any blur on the textarea is treated as a stray focus-shift
  // (React Flow auto-focuses the node wrapper after a connect/select) and
  // re-focused. Cleared on first keypress or when the user blurs intentionally
  // after the grace window.
  const justEnteredEditingRef = useRef(false)

  useEffect(() => {
    if (!data.isEditing || !inputRef.current) return
    justEnteredEditingRef.current = true

    // React Flow's selection change programmatically focuses the node wrapper
    // <div tabindex="0">, which lands AFTER one rAF and steals focus from our
    // textarea. To win, focus the textarea on a short polling chain that runs
    // for ~250ms — re-focus whenever the textarea isn't the active element.
    let cancelled = false
    let pollTimer: ReturnType<typeof setTimeout> | undefined
    const start = Date.now()

    const focusInput = () => {
      const el = inputRef.current
      if (!el) return
      el.focus()
      if (data.editCursorAtEnd) {
        const end = el.value.length
        el.setSelectionRange(end, end)
      } else {
        el.select()
      }
    }

    const poll = () => {
      if (cancelled) return
      const el = inputRef.current
      if (!el) return
      if (document.activeElement !== el) {
        focusInput()
      }
      if (Date.now() - start < 250) {
        pollTimer = setTimeout(poll, 16)
      }
    }

    // First focus on the next frame, then keep reclaiming for 250ms
    const raf = requestAnimationFrame(() => {
      focusInput()
      pollTimer = setTimeout(poll, 16)
    })

    const clearTimer = setTimeout(() => {
      justEnteredEditingRef.current = false
    }, 400)

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      if (pollTimer) clearTimeout(pollTimer)
      clearTimeout(clearTimer)
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
    // Stray blur right after entering edit mode — React Flow auto-focuses the
    // node wrapper div on selection change, which blurs our textarea. Reclaim
    // focus and stay in edit mode instead of committing.
    if (justEnteredEditingRef.current) {
      requestAnimationFrame(() => {
        const el = inputRef.current
        if (!el) return
        el.focus()
        el.select()
      })
      return
    }
    const trimmed = localLabel.trim()
    if (trimmed) updateNodeLabel(id, trimmed)
    else setLocalLabel(data.label)
    setNodeEditing(id, false)
  }, [id, localLabel, data.label, updateNodeLabel, setNodeEditing])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // The user is engaging with the textarea — stop the blur-reclaim guard
      // so a deliberate Enter/blur commits the edit normally.
      justEnteredEditingRef.current = false
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
  const { focusMode, selectedNodeIds, setInspectorNode, setAIPopoverNode, aiPopoverNodeId, presentationMode, presentationOrder, presentationIndex, dropTargetId } = useUIStore()
  const isSelected = selected || selectedNodeIds.includes(id)
  const isRoot = data.level === 0
  const shapeClass = SHAPE_CLASSES[data.shape ?? 'rounded']

  const isFocusedOut = focusMode && !isSelected
  const isPresentationDimmed = presentationMode && presentationOrder[presentationIndex] !== id
  const isDropTarget = dropTargetId === id

  const [hovered, setHovered] = useState(false)
  // The sparkle button is visible while the user hovers the node — and stays
  // visible while the popover for this node is open, so the affordance reads
  // as "this node has the AI panel attached."
  const showAIButton = !data.isEditing && !presentationMode && (hovered || aiPopoverNodeId === id)

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      setInspectorNode(id)
      useUIStore.getState().setSelectedNodes([id])
    },
    [id, setInspectorNode]
  )

  const handleOpenAI = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      setAIPopoverNode(aiPopoverNodeId === id ? null : id)
    },
    [id, aiPopoverNodeId, setAIPopoverNode]
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
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
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

      {/* Hover-revealed AI launcher. The button sits above the node, with an
          invisible "bridge" filling the visual gap between the two. Both live
          inside the node's motion.div, so moving the cursor up to click the
          button never leaves the node's hover scope (the gap would otherwise
          fire onMouseLeave and dismiss the button before it could be clicked). */}
      {showAIButton && (
        <div
          aria-hidden
          className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center"
          style={{ top: -36 }}
        >
          <button
            onClick={handleOpenAI}
            onMouseDown={(e) => e.stopPropagation()}
            title="Ask AI about this node"
            aria-label="Open AI prompt for this node"
            className="w-6 h-6 rounded-full flex items-center justify-center text-white shadow-md transition-transform hover:scale-110"
            style={{
              background: 'var(--brand)',
              boxShadow: '0 2px 8px rgba(99, 102, 241, 0.35)',
            }}
          >
            <Sparkles size={11} />
          </button>
          {/* Transparent 12px bridge between the button and the node body. */}
          <div className="w-10 h-3" />
        </div>
      )}

      {/* Content */}
      <NodeContent id={id} data={data} />

      {/* Advisor override chip — visible at all times when this node has its
          own advisor lens. Click bubbles up so the floating toolbar's picker
          handles editing; we only need to make the user aware it's overridden. */}
      {data.advisor && (() => {
        const curated = findAdvisor(data.advisor.id)
        const emoji = curated?.emoji ?? '🧠'
        return (
          <div
            title={`Advising as ${data.advisor.label}`}
            className="advisor-chip absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center text-xs select-none pointer-events-none"
            style={{
              background: 'var(--panel-bg)',
              border: `2px solid ${data.color}`,
              boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
            }}
            aria-hidden
          >
            {emoji}
          </div>
        )
      })()}

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
