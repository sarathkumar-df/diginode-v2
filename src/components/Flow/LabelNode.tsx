import { memo } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import { FlowNodeData } from '@/types'

function LabelNodeComponent({ data, selected }: NodeProps<FlowNodeData>) {
  const bgColor = data.color || '#6366f1'

  return (
    <div
      className={`
        px-5 py-2 rounded-md min-w-[160px] text-center
        transition-shadow duration-150
        ${selected ? 'ring-2 ring-blue-400 shadow-md' : 'shadow-sm'}
      `}
      style={{
        background: bgColor,
        color: '#ffffff',
      }}
    >
      <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-white/50" />
      <div className="text-xs font-semibold uppercase tracking-wider">{data.label}</div>
      {data.subtitle && (
        <div className="text-[10px] mt-0.5 opacity-80">{data.subtitle}</div>
      )}
      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-white/50" />
    </div>
  )
}

export const LabelNode = memo(LabelNodeComponent)
