/**
 * LiveCursors — renders other connected users' cursors on the React Flow canvas.
 *
 * Each cursor is stored in Liveblocks Presence as a flow-space {x, y} position.
 * We use React Flow's viewport transform to convert flow coords → screen coords
 * and render a labelled cursor pointer at that position.
 */
import { useOthers } from '@/liveblocks.config'
import { useViewport } from 'reactflow'

function CursorSVG({ color }: { color: string }) {
  return (
    <svg
      width="16"
      height="20"
      viewBox="0 0 16 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }}
    >
      <path
        d="M0 0L0 14L4 10L7 18L9 17L6 9L11 9L0 0Z"
        fill={color}
        stroke="white"
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function LiveCursors() {
  const others = useOthers()
  const { x: vpX, y: vpY, zoom } = useViewport()

  return (
    <>
      {others.map(({ connectionId, presence }) => {
        if (!presence.cursor) return null

        // Convert flow coords to screen (canvas-relative) coords
        const screenX = presence.cursor.x * zoom + vpX
        const screenY = presence.cursor.y * zoom + vpY

        return (
          <div
            key={connectionId}
            className="absolute pointer-events-none z-40"
            style={{ left: screenX, top: screenY }}
          >
            <CursorSVG color={presence.color} />
            {presence.name && (
              <div
                className="absolute top-4 left-3 px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap"
                style={{
                  background: presence.color,
                  color: 'white',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                }}
              >
                {presence.name.split(' ')[0]}
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}
