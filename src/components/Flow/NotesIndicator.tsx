import { useState } from 'react'
import { StickyNote } from 'lucide-react'

interface NotesIndicatorProps {
  notes?: string
  nodeId: string
  onNotesChange?: (nodeId: string, notes: string) => void
}

export function NotesIndicator({ notes, nodeId, onNotesChange }: NotesIndicatorProps) {
  const [showPopover, setShowPopover] = useState(false)
  const [draft, setDraft] = useState(notes || '')

  if (!notes && !onNotesChange) return null

  const hasNotes = notes && notes.trim().length > 0

  return (
    <div className="relative inline-block">
      <button
        onClick={(e) => {
          e.stopPropagation()
          setDraft(notes || '')
          setShowPopover((v) => !v)
        }}
        className={`p-0.5 rounded transition-opacity ${hasNotes ? 'opacity-80' : 'opacity-30 hover:opacity-60'}`}
        style={{ color: hasNotes ? '#f59e0b' : 'var(--text-muted)' }}
        title={hasNotes ? 'View note' : 'Add note'}
      >
        <StickyNote size={10} />
      </button>

      {showPopover && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-[60]" onClick={() => setShowPopover(false)} />
          {/* Popover */}
          <div
            className="absolute left-0 top-full mt-1 z-[61] w-52 rounded-lg border shadow-lg p-2"
            style={{ background: 'var(--panel-bg)', borderColor: 'var(--panel-border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => {
                onNotesChange?.(nodeId, draft)
              }}
              placeholder="Add a note..."
              rows={3}
              className="w-full text-[11px] bg-transparent outline-none resize-none leading-relaxed"
              style={{ color: 'var(--text-primary)' }}
              autoFocus
            />
            <div className="flex justify-end mt-1">
              <button
                onClick={() => {
                  onNotesChange?.(nodeId, draft)
                  setShowPopover(false)
                }}
                className="text-[10px] px-2 py-0.5 rounded bg-indigo-500 text-white hover:bg-indigo-600"
              >
                Save
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
