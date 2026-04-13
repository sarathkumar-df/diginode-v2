import { memo } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import { FlowNodeData } from '@/types'
import { TagList } from './TagBadge'
import { NotesIndicator } from './NotesIndicator'
import { useFlowStore } from '@/store/flowStore'

function ProcessNodeComponent({ id, data, selected }: NodeProps<FlowNodeData>) {
  const borderColor = data.color || '#6366f1'
  const { removeTag, setNodeNote } = useFlowStore()

  return (
    <div
      className={`
        px-5 py-3 rounded-xl min-w-[140px] max-w-[220px] text-center
        transition-all duration-150
        ${selected ? 'ring-2 ring-blue-400 shadow-lg scale-[1.02]' : 'shadow-md hover:shadow-lg'}
      `}
      style={{
        background: 'var(--panel-bg)',
        border: `2px solid ${borderColor}`,
        color: 'var(--text-primary)',
      }}
    >
      <Handle type="target" position={Position.Top} className="!w-2.5 !h-2.5 !bg-gray-300 !border-gray-400" />
      <div className="flex items-center justify-center gap-1">
        <div className="text-[13px] font-medium leading-snug">{data.label}</div>
        <NotesIndicator notes={data.notes} nodeId={id} onNotesChange={setNodeNote} />
      </div>
      {data.subtitle && (
        <div className="text-[10px] mt-1 opacity-50 italic">{data.subtitle}</div>
      )}
      <TagList tags={data.tags} onRemove={(tagId) => removeTag(id, tagId)} compact />
      <Handle type="source" position={Position.Bottom} className="!w-2.5 !h-2.5 !bg-gray-300 !border-gray-400" />
    </div>
  )
}

export const ProcessNode = memo(ProcessNodeComponent)
