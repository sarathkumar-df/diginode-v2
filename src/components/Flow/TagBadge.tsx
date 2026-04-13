import { FlowTag } from '@/types'
import { X } from 'lucide-react'

interface TagBadgeProps {
  tag: FlowTag
  onRemove?: (tagId: string) => void
  onClick?: (tag: FlowTag) => void
  compact?: boolean
}

export function TagBadge({ tag, onRemove, onClick, compact }: TagBadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center gap-0.5 rounded-full font-medium leading-none
        ${compact ? 'text-[8px] px-1.5 py-[2px]' : 'text-[10px] px-2 py-[3px]'}
        ${onClick ? 'cursor-pointer hover:opacity-80' : ''}
      `}
      style={{ background: `${tag.color}20`, color: tag.color, border: `1px solid ${tag.color}40` }}
      onClick={(e) => {
        e.stopPropagation()
        onClick?.(tag)
      }}
    >
      {tag.label}
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onRemove(tag.id)
          }}
          className="ml-0.5 hover:opacity-100 opacity-60"
        >
          <X size={compact ? 7 : 8} />
        </button>
      )}
    </span>
  )
}

interface TagListProps {
  tags?: FlowTag[]
  onRemove?: (tagId: string) => void
  onClick?: (tag: FlowTag) => void
  compact?: boolean
}

export function TagList({ tags, onRemove, onClick, compact }: TagListProps) {
  if (!tags || tags.length === 0) return null
  return (
    <div className="flex flex-wrap gap-0.5 mt-1">
      {tags.map((tag) => (
        <TagBadge
          key={tag.id}
          tag={tag}
          onRemove={onRemove}
          onClick={onClick}
          compact={compact}
        />
      ))}
    </div>
  )
}
