import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react'
import { Toast, ToastKind, useToastStore } from '@/store/toastStore'

const ICONS: Record<ToastKind, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
}

const ACCENT: Record<ToastKind, string> = {
  success: '#10b981',
  error: '#ef4444',
  warning: '#f59e0b',
  info: 'var(--brand)',
}

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useToastStore((s) => s.dismiss)
  const Icon = ICONS[toast.kind]
  const accent = ACCENT[toast.kind]

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 24, scale: 0.96, transition: { duration: 0.15 } }}
      transition={{ type: 'spring', stiffness: 480, damping: 32 }}
      className="pointer-events-auto w-[340px] rounded-xl border overflow-hidden"
      style={{
        background: 'var(--panel-bg)',
        borderColor: 'var(--panel-border)',
        boxShadow: 'var(--shadow-md, 0 10px 24px rgba(0,0,0,0.10))',
      }}
      role={toast.kind === 'error' || toast.kind === 'warning' ? 'alert' : 'status'}
      aria-live={toast.kind === 'error' ? 'assertive' : 'polite'}
    >
      <div className="flex items-start gap-3 px-3.5 py-3 relative">
        <span
          className="absolute left-0 top-0 bottom-0"
          style={{ width: 3, background: accent }}
          aria-hidden
        />
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
          style={{ background: `${accent}1A`, color: accent }}
        >
          <Icon size={15} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold leading-snug" style={{ color: 'var(--text-primary)' }}>
            {toast.title}
          </p>
          {toast.description && (
            <p className="text-[12px] mt-0.5 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              {toast.description}
            </p>
          )}
        </div>
        <button
          onClick={() => dismiss(toast.id)}
          className="flex-shrink-0 p-1 -mr-1 -mt-0.5 rounded transition-colors hover:bg-black/5 dark:hover:bg-white/10"
          style={{ color: 'var(--text-muted)' }}
          aria-label="Dismiss notification"
        >
          <X size={13} />
        </button>
      </div>
    </motion.div>
  )
}

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts)

  return (
    <div
      className="fixed bottom-4 right-4 z-[300] flex flex-col items-end gap-2 pointer-events-none"
      aria-label="Notifications"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} />
        ))}
      </AnimatePresence>
    </div>
  )
}
