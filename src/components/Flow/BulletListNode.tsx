import { memo } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import { FlowNodeData } from '@/types'
import { TagList } from './TagBadge'
import { NotesIndicator } from './NotesIndicator'
import { useFlowStore } from '@/store/flowStore'

function BulletListNodeComponent({ id, data, selected }: NodeProps<FlowNodeData>) {
  const borderColor = data.color || '#EF4444'
  const items = data.items || []
  const { removeTag, setNodeNote } = useFlowStore()

  return (
    <div
      className={`
        rounded-lg min-w-[180px] max-w-[300px] transition-shadow duration-150
        ${selected ? 'ring-2 ring-blue-400 shadow-lg' : 'shadow-md'}
      `}
      style={{
        background: 'var(--panel-bg)',
        border: `2px solid ${borderColor}`,
        color: 'var(--text-primary)',
      }}
    >
      <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-gray-400" />

      {/* Header */}
      <div
        className="text-xs font-semibold px-3 py-2 border-b flex items-center gap-1"
        style={{ borderColor: `${borderColor}30` }}
      >
        <span>{data.label}</span>
        <NotesIndicator notes={data.notes} nodeId={id} onNotesChange={setNodeNote} />
      </div>

      {/* Bullet list */}
      {items.length > 0 && (
        <ul className="px-3 py-2 space-y-1">
          {items.map((item, i) => (
            <li key={i} className="text-[11px] flex items-start gap-1.5 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              <span className="mt-1.5 w-1 h-1 rounded-full flex-shrink-0" style={{ background: borderColor }} />
              {item}
            </li>
          ))}
        </ul>
      )}

      {data.subtitle && (
        <div className="text-[10px] px-3 pb-2 opacity-60 italic">{data.subtitle}</div>
      )}

      <TagList tags={data.tags} onRemove={(tagId) => removeTag(id, tagId)} compact />

      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-gray-400" />
    </div>
  )
}

export const BulletListNode = memo(BulletListNodeComponent)
