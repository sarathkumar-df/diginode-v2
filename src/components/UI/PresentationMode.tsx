import { useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, ChevronRight, X, MonitorPlay } from 'lucide-react'
import { useUIStore } from '@/store/uiStore'
import { useMindMapStore } from '@/store/mindmapStore'

export function PresentationMode() {
  const {
    presentationMode,
    presentationIndex,
    presentationOrder,
    exitPresentationMode,
    presentationNext,
    presentationPrev,
  } = useUIStore()

  const { nodes } = useMindMapStore()

  const currentNodeId = presentationOrder[presentationIndex]
  const currentNode = nodes.find((n) => n.id === currentNodeId)
  const total = presentationOrder.length
  const isFirst = presentationIndex === 0
  const isLast = presentationIndex === total - 1

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (!presentationMode) return
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') presentationNext()
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') presentationPrev()
      if (e.key === 'Escape') exitPresentationMode()
    },
    [presentationMode, presentationNext, presentationPrev, exitPresentationMode]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [handleKey])

  // Clamp dot count so bar doesn't overflow on large maps
  const showDots = total <= 20

  return (
    <AnimatePresence>
      {presentationMode && (
        <motion.div
          key="presentation-root"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-30"
          style={{ pointerEvents: 'none' }}
        >
          {/* Edge vignette */}
          <div
            className="absolute inset-0"
            style={{
              background: 'radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.22) 100%)',
            }}
          />

          {/* Bottom control bar — re-enable pointer events only here */}
          <motion.div
            initial={{ y: 72, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 72, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 36, delay: 0.05 }}
            className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-2.5 rounded-2xl border"
            style={{
              pointerEvents: 'auto',
              background: 'var(--panel-bg)',
              borderColor: 'var(--panel-border)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
            }}
          >
            {/* Label */}
            <div
              className="flex items-center gap-1.5 pr-3 border-r"
              style={{ borderColor: 'var(--panel-border)' }}
            >
              <MonitorPlay size={13} style={{ color: 'var(--brand)' }} />
              <span className="text-xs font-semibold" style={{ color: 'var(--brand)' }}>
                Presentation
              </span>
            </div>

            {/* Prev */}
            <button
              onClick={presentationPrev}
              disabled={isFirst}
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors disabled:opacity-30 hover:bg-gray-100 dark:hover:bg-gray-700"
              style={{ color: 'var(--text-secondary)' }}
              title="Previous (←)"
            >
              <ChevronLeft size={16} />
            </button>

            {/* Node label + dot progress */}
            <div className="flex flex-col items-center" style={{ minWidth: 100, maxWidth: 180 }}>
              <span
                className="text-xs font-semibold truncate w-full text-center"
                style={{ color: 'var(--text-primary)' }}
              >
                {currentNode?.data.label ?? '—'}
              </span>
              {showDots && (
                <div className="flex items-center gap-1 mt-1.5">
                  {presentationOrder.map((_, i) => (
                    <div
                      key={i}
                      className="rounded-full transition-all duration-300"
                      style={{
                        width: i === presentationIndex ? 14 : 5,
                        height: 5,
                        background:
                          i === presentationIndex
                            ? currentNode?.data.color ?? 'var(--brand)'
                            : 'var(--panel-border)',
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Next */}
            <button
              onClick={presentationNext}
              disabled={isLast}
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors disabled:opacity-30 hover:bg-gray-100 dark:hover:bg-gray-700"
              style={{ color: 'var(--text-secondary)' }}
              title="Next (→)"
            >
              <ChevronRight size={16} />
            </button>

            {/* Counter */}
            <span
              className="text-[11px] tabular-nums pl-3 border-l"
              style={{ color: 'var(--text-muted)', borderColor: 'var(--panel-border)' }}
            >
              {presentationIndex + 1} / {total}
            </span>

            {/* Exit */}
            <button
              onClick={exitPresentationMode}
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
              style={{ color: 'var(--text-muted)' }}
              title="Exit (Esc)"
            >
              <X size={13} />
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
