import { memo, useRef, useEffect } from 'react'
import { EdgeProps } from 'reactflow'

// Draws a cubic bezier that exits horizontally from the source
// and arrives horizontally at the target — organic tree branch feel.
function organicBezier(
  sx: number, sy: number,
  tx: number, ty: number,
): string {
  const dx = Math.abs(tx - sx)
  const cp = Math.max(dx * 0.55, 80)
  return `M${sx},${sy} C${sx + cp},${sy} ${tx - cp},${ty} ${tx},${ty}`
}

function CustomEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style,
  markerEnd,
  selected,
}: EdgeProps) {
  const path = organicBezier(sourceX, sourceY, targetX, targetY)
  const pathRef = useRef<SVGPathElement>(null)
  const animated = useRef(false)

  // Draw-in animation on first mount only
  useEffect(() => {
    const el = pathRef.current
    if (!el || animated.current) return
    animated.current = true

    const length = el.getTotalLength()
    el.style.strokeDasharray = `${length}`
    el.style.strokeDashoffset = `${length}`
    el.style.opacity = '0'

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.transition =
          'stroke-dashoffset 400ms cubic-bezier(0.4,0,0.2,1), opacity 200ms ease'
        el.style.strokeDashoffset = '0'
        el.style.opacity = '1'
        setTimeout(() => {
          if (el) {
            el.style.strokeDasharray = ''
            el.style.strokeDashoffset = ''
            el.style.transition = ''
            el.style.opacity = ''
          }
        }, 450)
      })
    })
  }, [])

  const strokeColor = (style?.stroke as string) ?? '#6366f1'
  const strokeWidth = (style?.strokeWidth as number) ?? 2.5

  return (
    <g>
      {/* Invisible wide path — gives a generous hit area so the edge is easy to click */}
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        strokeLinecap="round"
        style={{ cursor: 'pointer' }}
      />

      {/* Selection halo — soft glow behind the line so selection is obvious at a glance */}
      {selected && (
        <path
          d={path}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth + 10}
          strokeLinecap="round"
          strokeOpacity={0.22}
          style={{ pointerEvents: 'none' }}
        />
      )}

      {/* Visible edge */}
      <path
        id={id}
        ref={pathRef}
        d={path}
        fill="none"
        stroke={strokeColor}
        strokeWidth={selected ? strokeWidth + 2 : strokeWidth}
        strokeLinecap="round"
        strokeOpacity={selected ? 1 : 0.85}
        markerEnd={markerEnd}
        style={{ pointerEvents: 'none', ...style, stroke: strokeColor }}
      />
    </g>
  )
}

export const CustomEdge = memo(CustomEdgeComponent)
