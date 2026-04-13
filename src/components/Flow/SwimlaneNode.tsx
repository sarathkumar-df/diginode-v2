import { memo } from 'react'
import { Handle, Position, NodeProps, NodeResizer } from 'reactflow'
import { FlowNodeData } from '@/types'

function SwimlaneNodeComponent({ data, selected }: NodeProps<FlowNodeData>) {
  const bgColor = data.color || '#6366f1'

  return (
    <div
      className={`
        rounded-2xl w-full h-full transition-shadow duration-150
        ${selected ? 'ring-2 ring-blue-400' : ''}
      `}
      style={{
        background: `${bgColor}08`,
        border: `1.5px solid ${bgColor}20`,
      }}
    >
      <NodeResizer
        minWidth={600}
        minHeight={80}
        isVisible={selected}
        lineClassName="!border-blue-400"
        handleClassName="!w-2 !h-2 !bg-blue-400 !border-blue-400"
      />
      <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-transparent !border-transparent" />

      {/* Lane label — top left */}
      <div
        className="text-[11px] font-bold uppercase tracking-[0.15em] px-4 pt-3"
        style={{ color: bgColor, opacity: 0.55 }}
      >
        {data.label}
      </div>

      {data.subtitle && (
        <div className="text-[10px] px-4 mt-0.5 opacity-40" style={{ color: 'var(--text-muted)' }}>
          {data.subtitle}
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-transparent !border-transparent" />
    </div>
  )
}

export const SwimlaneNode = memo(SwimlaneNodeComponent)
