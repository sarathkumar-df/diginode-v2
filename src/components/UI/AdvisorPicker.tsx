import { useState, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Check, Sparkles, ArrowLeft, Pencil } from 'lucide-react'
import { v4 as uuidv4 } from 'uuid'
import { ADVISORS, Advisor } from '@/data/advisors'
import { MapAdvisor } from '@/types'

interface Props {
  open: boolean
  current: MapAdvisor | null
  onClose: () => void
  onPick: (advisor: MapAdvisor | null) => void
}

type View = 'grid' | 'custom'

// Build a systemFragment from the user's role + focus inputs. The server
// re-sanitizes this on its side; this client-side text is just what we
// preserve in the stored MapAdvisor so it survives reload.
function buildCustomFragment(role: string, focus: string): string {
  const r = role.trim()
  const f = focus.trim()
  const base = `Apply the perspective, vocabulary, and concerns of ${r}.`
  return f ? `${base} ${f}` : base
}

export function AdvisorPicker({ open, current, onClose, onPick }: Props) {
  const [view, setView] = useState<View>('grid')

  // Custom-form state. Pre-populated from the current advisor when it's a
  // custom one so the user can tweak rather than retype.
  const [role, setRole] = useState('')
  const [focus, setFocus] = useState('')

  useEffect(() => {
    if (!open) return
    setView('grid')
    if (current?.custom) {
      // Best-effort: stored MapAdvisor only carries label + role, not the raw
      // focus text. We seed `role` from the stored role so editing is at least
      // a starting point.
      setRole(current.role || current.label || '')
      setFocus('')
    } else {
      setRole('')
      setFocus('')
    }
  }, [open, current])

  const handlePickCurated = useCallback(
    (a: Advisor) => {
      onPick({ id: a.id, label: a.label, role: a.role })
      onClose()
    },
    [onPick, onClose]
  )

  const handleClear = useCallback(() => {
    onPick(null)
    onClose()
  }, [onPick, onClose])

  const handleSaveCustom = useCallback(() => {
    const trimmedRole = role.trim()
    if (!trimmedRole) return
    // Short label for the chip — use the first ~30 chars of the role unless
    // the user added a comma/sentence boundary (then use up to that).
    const labelSplit = trimmedRole.split(/[,.;]/, 1)[0]
    const label = labelSplit.length > 28 ? labelSplit.slice(0, 28).trim() + '…' : labelSplit.trim()
    const advisor: MapAdvisor = {
      id: `custom-${uuidv4()}`,
      label,
      role: trimmedRole,
      custom: true,
      systemFragment: buildCustomFragment(trimmedRole, focus),
    }
    onPick(advisor)
    onClose()
  }, [role, focus, onPick, onClose])

  const customSelected = !!current?.custom

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="advisor-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.45)' }}
          onClick={onClose}
        >
          <motion.div
            key="advisor-modal"
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 12 }}
            transition={{ type: 'spring', stiffness: 500, damping: 35 }}
            className="w-full max-w-2xl rounded-2xl border shadow-lg p-6 mx-4 max-h-[85vh] overflow-hidden flex flex-col"
            style={{ background: 'var(--panel-bg)', borderColor: 'var(--panel-border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-1 flex-shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                {view === 'custom' ? (
                  <button
                    onClick={() => setView('grid')}
                    className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
                    style={{ color: 'var(--text-secondary)' }}
                    title="Back to library"
                  >
                    <ArrowLeft size={16} />
                  </button>
                ) : (
                  <div className="w-9 h-9 rounded-xl bg-indigo-500 flex items-center justify-center flex-shrink-0">
                    <Sparkles size={18} color="white" />
                  </div>
                )}
                <div className="min-w-0">
                  <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                    {view === 'custom' ? 'Custom advisor' : 'Choose your AI advisor'}
                  </h2>
                  <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                    {view === 'custom'
                      ? 'Describe a role and the AI will adopt that lens'
                      : 'Every AI suggestion on this map will be filtered through this lens'}
                  </p>
                </div>
              </div>
              <button onClick={onClose} style={{ color: 'var(--text-muted)' }}>
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            {view === 'grid' && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 mt-5 overflow-y-auto pr-1 -mr-1">
                {ADVISORS.map((a) => {
                  const selected = !current?.custom && current?.id === a.id
                  return (
                    <button
                      key={a.id}
                      onClick={() => handlePickCurated(a)}
                      className="text-left rounded-xl border p-3 transition-all duration-150 relative"
                      style={{
                        background: selected ? 'var(--brand-light)' : 'var(--canvas-bg)',
                        borderColor: selected ? 'var(--brand)' : 'var(--panel-border)',
                      }}
                      onMouseEnter={(e) => {
                        if (!selected) e.currentTarget.style.borderColor = 'var(--brand)'
                      }}
                      onMouseLeave={(e) => {
                        if (!selected) e.currentTarget.style.borderColor = 'var(--panel-border)'
                      }}
                    >
                      {selected && (
                        <div
                          className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center"
                          style={{ background: 'var(--brand)' }}
                        >
                          <Check size={12} color="white" />
                        </div>
                      )}
                      <div className="text-2xl mb-1.5" aria-hidden>
                        {a.emoji}
                      </div>
                      <div
                        className="text-sm font-semibold mb-1"
                        style={{ color: selected ? 'var(--brand)' : 'var(--text-primary)' }}
                      >
                        {a.label}
                      </div>
                      <div
                        className="text-xs leading-snug"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {a.blurb}
                      </div>
                    </button>
                  )
                })}

                {/* Custom advisor card — flips the modal into the form view */}
                <button
                  onClick={() => setView('custom')}
                  className="text-left rounded-xl border-2 border-dashed p-3 transition-all duration-150 relative"
                  style={{
                    background: customSelected ? 'var(--brand-light)' : 'var(--canvas-bg)',
                    borderColor: customSelected ? 'var(--brand)' : 'var(--panel-border)',
                  }}
                  onMouseEnter={(e) => {
                    if (!customSelected) e.currentTarget.style.borderColor = 'var(--brand)'
                  }}
                  onMouseLeave={(e) => {
                    if (!customSelected) e.currentTarget.style.borderColor = 'var(--panel-border)'
                  }}
                >
                  {customSelected && (
                    <div
                      className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center"
                      style={{ background: 'var(--brand)' }}
                    >
                      <Check size={12} color="white" />
                    </div>
                  )}
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center mb-1.5"
                    style={{ background: 'var(--brand-light)', color: 'var(--brand)' }}
                  >
                    <Pencil size={14} />
                  </div>
                  <div
                    className="text-sm font-semibold mb-1"
                    style={{ color: customSelected ? 'var(--brand)' : 'var(--text-primary)' }}
                  >
                    {customSelected ? current?.label : 'Custom advisor'}
                  </div>
                  <div className="text-xs leading-snug" style={{ color: 'var(--text-secondary)' }}>
                    {customSelected
                      ? 'Edit the role you wrote'
                      : 'Write your own role — e.g. "VP of Engineering at a fintech"'}
                  </div>
                </button>
              </div>
            )}

            {view === 'custom' && (
              <div className="mt-5 overflow-y-auto pr-1 -mr-1 flex-1">
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  Role <span style={{ color: 'var(--text-muted)' }}>(required)</span>
                </label>
                <input
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSaveCustom() } }}
                  placeholder='e.g. "VP of Engineering at a fintech with 200 engineers"'
                  maxLength={120}
                  autoFocus
                  className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none mb-4"
                  style={{
                    background: 'var(--canvas-bg)',
                    borderColor: 'var(--panel-border)',
                    color: 'var(--text-primary)',
                  }}
                />

                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  How they think <span style={{ color: 'var(--text-muted)' }}>(optional)</span>
                </label>
                <textarea
                  value={focus}
                  onChange={(e) => setFocus(e.target.value)}
                  placeholder='e.g. "Cares most about delivery velocity, infra costs, and team morale. Sceptical of new vendors."'
                  rows={4}
                  maxLength={500}
                  className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none resize-none leading-relaxed"
                  style={{
                    background: 'var(--canvas-bg)',
                    borderColor: 'var(--panel-border)',
                    color: 'var(--text-primary)',
                  }}
                />
                <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
                  {focus.length}/500 — what should this advisor focus on, push back on, or value?
                </p>
              </div>
            )}

            {/* Footer */}
            <div
              className="flex items-center justify-between gap-2 mt-5 pt-4 border-t flex-shrink-0"
              style={{ borderColor: 'var(--panel-border)' }}
            >
              {view === 'grid' ? (
                <>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {current
                      ? `Currently advising as ${current.label}`
                      : 'No advisor — generic AI assistant'}
                  </p>
                  {current && (
                    <button
                      onClick={handleClear}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors hover:bg-gray-50 dark:hover:bg-gray-700"
                      style={{ borderColor: 'var(--panel-border)', color: 'var(--text-secondary)' }}
                    >
                      Clear advisor
                    </button>
                  )}
                </>
              ) : (
                <>
                  <button
                    onClick={() => setView('grid')}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-gray-50 dark:hover:bg-gray-700"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveCustom}
                    disabled={!role.trim()}
                    className="px-4 py-2 rounded-lg bg-indigo-500 text-white text-xs font-medium disabled:opacity-50 hover:bg-indigo-600 transition-colors"
                  >
                    Use this advisor
                  </button>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
