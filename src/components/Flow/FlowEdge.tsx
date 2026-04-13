import { memo } from 'react'
import {
  BaseEdge,
  EdgeProps,
  EdgeLabelRenderer,
  getBezierPath,
  MarkerType,
} from 'reactflow'

interface FlowEdgeData {
  label?: string
  color?: string
  edgeStyle?: 'solid' | 'dashed' | 'dependency'
  bidirectional?: boolean
}

function FlowEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps<FlowEdgeData>) {
  const isDependency = data?.edgeStyle === 'dependency'
  const color = isDependency ? '#F59E0B' : (data?.color || '#94a3b8')
  const isDashed = data?.edgeStyle === 'dashed'

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  })

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: color,
          strokeWidth: isDependency ? 2.5 : (selected ? 2.5 : 1.5),
          strokeDasharray: isDashed ? '6 3' : isDependency ? '8 4 2 4' : undefined,
        }}
        markerEnd={`url(#flow-arrow-${id})`}
        markerStart={data?.bidirectional ? `url(#flow-arrow-start-${id})` : undefined}
      />
      {/* Custom marker definitions */}
      <svg style={{ position: 'absolute', width: 0, height: 0 }}>
        <defs>
          <marker
            id={`flow-arrow-${id}`}
            markerWidth="12"
            markerHeight="12"
            refX="10"
            refY="6"
            orient="auto"
          >
            <path d="M2,2 L10,6 L2,10" fill="none" stroke={color} strokeWidth="1.5" />
          </marker>
          {data?.bidirectional && (
            <marker
              id={`flow-arrow-start-${id}`}
              markerWidth="12"
              markerHeight="12"
              refX="2"
              refY="6"
              orient="auto-start-reverse"
            >
              <path d="M10,2 L2,6 L10,10" fill="none" stroke={color} strokeWidth="1.5" />
            </marker>
          )}
        </defs>
      </svg>
      {/* Edge label */}
      {data?.label && (
        <EdgeLabelRenderer>
          <div
            className="absolute text-[10px] px-1.5 py-0.5 rounded pointer-events-none"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              background: 'var(--panel-bg)',
              border: '1px solid var(--panel-border)',
              color: 'var(--text-secondary)',
            }}
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

export const FlowCustomEdge = memo(FlowEdgeComponent)
