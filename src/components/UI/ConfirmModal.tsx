import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, Info } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ConfirmOptions {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>

// ── Context ───────────────────────────────────────────────────────────────────

const ConfirmContext = createContext<ConfirmFn>(() => Promise.resolve(false))

export function useConfirm(): ConfirmFn {
  return useContext(ConfirmContext)
}

// ── Provider ──────────────────────────────────────────────────────────────────

interface PendingConfirm extends ConfirmOptions {
  resolve: (value: boolean) => void
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null)

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setPending({ ...options, resolve })
    })
  }, [])

  const handleConfirm = () => {
    pending?.resolve(true)
    setPending(null)
  }

  const handleCancel = () => {
    pending?.resolve(false)
    setPending(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AnimatePresence>
        {pending && (
          <motion.div
            className="fixed inset-0 z-[200] flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ background: 'rgba(0,0,0,0.45)' }}
            onMouseDown={handleCancel}
          >
            <motion.div
              className="w-full max-w-sm rounded-2xl border shadow-2xl overflow-hidden"
              style={{ background: 'var(--panel-bg)', borderColor: 'var(--panel-border)' }}
              initial={{ scale: 0.94, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.94, opacity: 0, y: 10 }}
              transition={{ type: 'spring', stiffness: 420, damping: 30 }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {/* Body */}
              <div className="px-6 pt-6 pb-5">
                <div className="flex items-start gap-3.5">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: pending.danger ? '#fef2f2' : 'var(--brand-light)' }}
                  >
                    {pending.danger
                      ? <AlertTriangle size={17} style={{ color: '#ef4444' }} />
                      : <Info size={17} style={{ color: 'var(--brand)' }} />
                    }
                  </div>
                  <div>
                    <p className="text-sm font-semibold leading-snug" style={{ color: 'var(--text-primary)' }}>
                      {pending.title}
                    </p>
                    {pending.description && (
                      <p className="text-xs mt-1.5 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                        {pending.description}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div
                className="flex items-center justify-end gap-2 px-6 py-4 border-t"
                style={{ borderColor: 'var(--panel-border)', background: 'var(--canvas-bg)' }}
              >
                <button
                  onClick={handleCancel}
                  className="px-4 py-2 rounded-xl text-xs font-medium border transition-colors"
                  style={{
                    borderColor: 'var(--panel-border)',
                    color: 'var(--text-secondary)',
                    background: 'var(--panel-bg)',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--panel-border)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--panel-bg)' }}
                >
                  {pending.cancelLabel ?? 'Cancel'}
                </button>
                <button
                  onClick={handleConfirm}
                  className="px-4 py-2 rounded-xl text-xs font-semibold transition-opacity hover:opacity-90"
                  style={{
                    background: pending.danger ? '#ef4444' : 'var(--brand)',
                    color: 'white',
                  }}
                >
                  {pending.confirmLabel ?? (pending.danger ? 'Delete' : 'Confirm')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </ConfirmContext.Provider>
  )
}
