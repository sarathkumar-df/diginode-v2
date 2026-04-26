import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Check, Sparkles, Loader2, Users } from 'lucide-react'
import { ADVISORS, findAdvisor } from '@/data/advisors'
import { suggestAdvisors, AdvisorSuggestion } from '@/services/aiService'
import { MapAdvisor } from '@/types'

interface Props {
  open: boolean
  title: string
  text?: string
  onClose: () => void
  onPick: (advisor: MapAdvisor | null) => void
  onBrowseAll: () => void
}

// Suggests 3 advisors for a new map based on its title/text. Used by the
// Dashboard hero prompt and GenerateMapModal flows. Self-fetches on open
// so callers don't need to manage suggestion state.
export function AdvisorSuggestionModal({ open, title, text, onClose, onPick, onBrowseAll }: Props) {
  const [suggestions, setSuggestions] = useState<AdvisorSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !title) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setSuggestions([])
    suggestAdvisors(title, text)
      .then((s) => { if (!cancelled) setSuggestions(s) })
      .catch((err) => { if (!cancelled) setError(err?.message ?? 'Could not load suggestions') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [open, title, text])

  const handlePick = useCallback(
    (id: string) => {
      const a = findAdvisor(id)
      if (a) {
        onPick({ id: a.id, label: a.label, role: a.role })
        onClose()
      }
    },
    [onPick, onClose]
  )

  const handleSkip = useCallback(() => {
    onPick(null)
    onClose()
  }, [onPick, onClose])

  // Resolve suggestion ids back to the rich curated entries (label, blurb, emoji).
  const resolved = suggestions
    .map((s) => {
      const a = findAdvisor(s.id)
      return a ? { advisor: a, reason: s.reason } : null
    })
    .filter((x): x is { advisor: typeof ADVISORS[number]; reason: string } => x !== null)

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="advisor-suggest-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.45)' }}
          onClick={onClose}
        >
          <motion.div
            key="advisor-suggest-modal"
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 12 }}
            transition={{ type: 'spring', stiffness: 500, damping: 35 }}
            className="w-full max-w-xl rounded-2xl border shadow-lg p-6 mx-4 max-h-[85vh] overflow-hidden flex flex-col"
            style={{ background: 'var(--panel-bg)', borderColor: 'var(--panel-border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-1 flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-500 flex items-center justify-center">
                  <Sparkles size={18} color="white" />
                </div>
                <div>
                  <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                    Pick an advisor for this map
                  </h2>
                  <p className="text-xs truncate max-w-[380px]" style={{ color: 'var(--text-secondary)' }}>
                    Suggestions for &ldquo;{title}&rdquo;
                  </p>
                </div>
              </div>
              <button onClick={onClose} style={{ color: 'var(--text-muted)' }}>
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="mt-5 overflow-y-auto pr-1 -mr-1 flex-1">
              {loading && (
                <div className="flex flex-col items-center justify-center py-10 gap-2">
                  <Loader2 size={22} className="animate-spin" style={{ color: 'var(--brand)' }} />
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Picking advisors that fit your topic…
                  </p>
                </div>
              )}

              {error && (
                <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-sm text-red-600 dark:text-red-400 mb-3">
                  {error}
                </div>
              )}

              {!loading && !error && resolved.length === 0 && (
                <p className="text-xs py-6 text-center" style={{ color: 'var(--text-muted)' }}>
                  No suggestions came back — you can browse all advisors or skip for now.
                </p>
              )}

              {!loading && resolved.length > 0 && (
                <div className="flex flex-col gap-2">
                  {resolved.map(({ advisor, reason }) => (
                    <button
                      key={advisor.id}
                      onClick={() => handlePick(advisor.id)}
                      className="flex items-start gap-3 text-left rounded-xl border p-3.5 transition-all duration-150"
                      style={{
                        background: 'var(--canvas-bg)',
                        borderColor: 'var(--panel-border)',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'var(--brand)'
                        e.currentTarget.style.background = 'var(--brand-light)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--panel-border)'
                        e.currentTarget.style.background = 'var(--canvas-bg)'
                      }}
                    >
                      <div className="text-2xl flex-shrink-0 mt-0.5" aria-hidden>
                        {advisor.emoji}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div
                          className="text-sm font-semibold mb-0.5"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {advisor.label}
                        </div>
                        <div className="text-xs leading-snug" style={{ color: 'var(--text-secondary)' }}>
                          {reason}
                        </div>
                      </div>
                      <div
                        className="w-7 h-7 rounded-lg border flex items-center justify-center flex-shrink-0 mt-0.5"
                        style={{ borderColor: 'var(--panel-border)', color: 'var(--text-muted)' }}
                      >
                        <Check size={14} />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div
              className="flex items-center justify-between gap-2 mt-5 pt-4 border-t flex-shrink-0"
              style={{ borderColor: 'var(--panel-border)' }}
            >
              <button
                onClick={() => { onBrowseAll(); onClose() }}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors hover:bg-gray-50 dark:hover:bg-gray-700"
                style={{ borderColor: 'var(--panel-border)', color: 'var(--text-secondary)' }}
              >
                <Users size={12} />
                Browse all advisors
              </button>
              <button
                onClick={handleSkip}
                className="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors hover:bg-gray-50 dark:hover:bg-gray-700"
                style={{ color: 'var(--text-muted)' }}
              >
                Skip — pick later
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
