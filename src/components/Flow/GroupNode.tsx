import { memo } from 'react'
import { Handle, Position, NodeProps, NodeResizer } from 'reactflow'
import { FlowNodeData } from '@/types'

function GroupNodeComponent({ data, selected }: NodeProps<FlowNodeData>) {
  const borderColor = data.color || '#475569'

  return (
    <div
      className={`
        rounded-xl w-full h-full transition-shadow duration-150
        ${selected ? 'ring-2 ring-blue-400 shadow-lg' : 'shadow-sm'}
      `}
      style={{
        background: `${borderColor}06`,
        border: `1.5px solid ${borderColor}30`,
      }}
    >
      <NodeResizer
        minWidth={200}
        minHeight={100}
        isVisible={selected}
        lineClassName="!border-blue-400"
        handleClassName="!w-2 !h-2 !bg-blue-400 !border-blue-400"
      />
      <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-gray-400" />

      {/* Group header badge */}
      <div
        className="text-[10px] font-semibold px-2.5 py-1 rounded-md inline-block ml-3 mt-2.5"
        style={{ background: `${borderColor}18`, color: borderColor, border: `1px solid ${borderColor}25` }}
      >
        {data.label}
      </div>

      {data.subtitle && (
        <div className="text-[10px] px-3 opacity-50 mt-0.5" style={{ color: 'var(--text-secondary)' }}>
          {data.subtitle}
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-gray-400" />
    </div>
  )
}

export const GroupNode = memo(GroupNodeComponent)
