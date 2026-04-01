/**
 * PresenceAvatars — shows coloured avatar initials for every user
 * currently viewing/editing this map.
 * Presence data (name, color) is broadcast via useUpdateMyPresence in MindMapCanvas.
 */
import { useOthers, useSelf } from '@/liveblocks.config'

function Avatar({ name, color, title }: { name: string; color: string; title: string }) {
  const initial = name ? name.charAt(0).toUpperCase() : '?'
  return (
    <div
      title={title}
      className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold text-white flex-shrink-0 ring-2 ring-white dark:ring-gray-800"
      style={{ background: color }}
    >
      {initial}
    </div>
  )
}

export function PresenceAvatars() {
  const others = useOthers()
  const self = useSelf()

  if (others.length === 0) return null

  // Show at most 4 other avatars + an overflow count
  const visible = others.slice(0, 4)
  const overflow = Math.max(0, others.length - 4)

  return (
    <div className="flex items-center gap-0.5 mr-1">
      {/* Self — dimmed so focus stays on others */}
      {self?.presence && (
        <div className="opacity-50">
          <Avatar
            name={self.presence.name}
            color={self.presence.color}
            title={`You (${self.presence.name})`}
          />
        </div>
      )}

      {visible.map(({ connectionId, presence }) => (
        <Avatar
          key={connectionId}
          name={presence.name}
          color={presence.color}
          title={presence.name}
        />
      ))}

      {overflow > 0 && (
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold ring-2 ring-white dark:ring-gray-800"
          style={{ background: 'var(--panel-border)', color: 'var(--text-secondary)' }}
          title={`+${overflow} more`}
        >
          +{overflow}
        </div>
      )}
    </div>
  )
}
