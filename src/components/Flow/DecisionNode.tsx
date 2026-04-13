import { memo } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import { FlowNodeData } from '@/types'
import { TagList } from './TagBadge'
import { useFlowStore } from '@/store/flowStore'

function DecisionNodeComponent({ id, data, selected }: NodeProps<FlowNodeData>) {
  const borderColor = data.color || '#f59e0b'
  const { removeTag } = useFlowStore()

  return (
    <div
      className={`
        relative w-[120px] h-[120px] flex items-center justify-center
        transition-shadow duration-150
        ${selected ? 'drop-shadow-lg' : 'drop-shadow-md'}
      `}
    >
      {/* Diamond shape via rotated square */}
      <div
        className="absolute inset-[12px] rotate-45 rounded-md"
        style={{
          background: 'var(--panel-bg)',
          border: `2px solid ${borderColor}`,
        }}
      />
      {/* Label (not rotated) */}
      <div
        className="relative z-10 text-xs font-medium text-center px-2 leading-tight max-w-[90px]"
        style={{ color: 'var(--text-primary)' }}
      >
        {data.label}
      </div>
      {/* Tags below diamond */}
      {data.tags && data.tags.length > 0 && (
        <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 z-10">
          <TagList tags={data.tags} onRemove={(tagId) => removeTag(id, tagId)} compact />
        </div>
      )}
      <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-gray-400" />
      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-gray-400" />
      <Handle type="source" position={Position.Right} id="right" className="!w-2 !h-2 !bg-gray-400" />
      <Handle type="source" position={Position.Left} id="left" className="!w-2 !h-2 !bg-gray-400" />
    </div>
  )
}

export const DecisionNode = memo(DecisionNodeComponent)
