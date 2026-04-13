import { useCallback } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { Tag, StickyNote, Trash2, AlertTriangle, TrendingUp, Link2, Palette } from 'lucide-react'
import { useFlowStore } from '@/store/flowStore'
import { FlowTagPreset } from '@/types'

const TAG_PRESETS: Array<{ preset: FlowTagPreset; label: string; color: string; icon: typeof Tag }> = [
  { preset: 'risk', label: 'Risk', color: '#EF4444', icon: AlertTriangle },
  { preset: 'improvement', label: 'Improvement', color: '#10B981', icon: TrendingUp },
  { preset: 'dependency', label: 'Dependency', color: '#F59E0B', icon: Link2 },
  { preset: 'custom', label: 'Custom Tag', color: '#8B5CF6', icon: Palette },
]

interface NodeContextMenuProps {
  nodeId: string
  x: number
  y: number
  onClose: () => void
}

export function NodeContextMenu({ nodeId, x, y, onClose }: NodeContextMenuProps) {
  const { addTag, deleteNode, setNodeNote, nodes } = useFlowStore()
  const node = nodes.find((n) => n.id === nodeId)

  const handleAddTag = useCallback((preset: FlowTagPreset, label: string, color: string) => {
    addTag(nodeId, {
      id: uuidv4(),
      label,
      color,
      preset,
    })
    onClose()
  }, [nodeId, addTag, onClose])

  const handleAddNote = useCallback(() => {
    // Set empty note to trigger the notes UI to appear
    if (!node?.data.notes) {
      setNodeNote(nodeId, ' ')
    }
    onClose()
  }, [nodeId, node, setNodeNote, onClose])

  const handleDelete = useCallback(() => {
    deleteNode(nodeId)
    onClose()
  }, [nodeId, deleteNode, onClose])

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[80]" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose() }} />

      {/* Menu */}
      <div
        className="fixed z-[81] w-48 rounded-xl border shadow-xl py-1.5 overflow-hidden"
        style={{
          left: x,
          top: y,
          background: 'var(--panel-bg)',
          borderColor: 'var(--panel-border)',
        }}
      >
        {/* Tag section header */}
        <div
          className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: 'var(--text-muted)' }}
        >
          Add Tag
        </div>

        {TAG_PRESETS.map(({ preset, label, color, icon: Icon }) => (
          <button
            key={preset}
            onClick={() => handleAddTag(preset, label, color)}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors hover:bg-black/5 dark:hover:bg-white/5"
            style={{ color: 'var(--text-primary)' }}
          >
            <Icon size={12} style={{ color }} />
            <span>{label}</span>
            <span
              className="ml-auto text-[9px] px-1.5 py-[1px] rounded-full"
              style={{ background: `${color}20`, color }}
            >
              tag
            </span>
          </button>
        ))}

        {/* Divider */}
        <div className="my-1.5 border-t" style={{ borderColor: 'var(--panel-border)' }} />

        {/* Note */}
        <button
          onClick={handleAddNote}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors hover:bg-black/5 dark:hover:bg-white/5"
          style={{ color: 'var(--text-primary)' }}
        >
          <StickyNote size={12} style={{ color: '#f59e0b' }} />
          <span>{node?.data.notes?.trim() ? 'Edit Note' : 'Add Note'}</span>
        </button>

        {/* Divider */}
        <div className="my-1.5 border-t" style={{ borderColor: 'var(--panel-border)' }} />

        {/* Delete */}
        <button
          onClick={handleDelete}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors hover:bg-red-50 dark:hover:bg-red-900/20"
          style={{ color: '#EF4444' }}
        >
          <Trash2 size={12} />
          <span>Delete Node</span>
        </button>
      </div>
    </>
  )
}
