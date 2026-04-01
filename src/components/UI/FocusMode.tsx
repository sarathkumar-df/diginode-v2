import { motion, AnimatePresence } from 'framer-motion'
import { Eye } from 'lucide-react'
import { useUIStore } from '@/store/uiStore'

export function FocusModeBar() {
  const { focusMode, toggleFocusMode, selectedNodeIds } = useUIStore()

  return (
    <AnimatePresence>
      {focusMode && (
        <motion.div
          key="focus-bar"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          className="absolute bottom-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2.5 rounded-2xl border"
          style={{
            background: 'var(--panel-bg)',
            borderColor: 'var(--panel-border)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
          }}
        >
          <Eye size={14} color="#6366f1" />
          <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
            Focus Mode — {selectedNodeIds.length} node{selectedNodeIds.length !== 1 ? 's' : ''} selected
          </span>
          <button
            onClick={toggleFocusMode}
            className="text-xs px-2.5 py-1 rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 transition-colors"
          >
            Exit (Esc)
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
