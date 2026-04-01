import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, CheckCircle, AlertCircle, Loader2, Settings } from 'lucide-react'
import { useSettingsStore, AIProvider, MODELS } from '@/store/settingsStore'

interface Props {
  open: boolean
  onClose: () => void
}

export function SettingsModal({ open, onClose }: Props) {
  const { provider, model, setProvider, setModel } = useSettingsStore()
  const [testStatus, setTestStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [testError, setTestError] = useState('')

  const handleProviderChange = useCallback(
    (p: AIProvider) => {
      setProvider(p)
      setTestStatus('idle')
    },
    [setProvider]
  )

  const handleTest = useCallback(async () => {
    setTestStatus('loading')
    setTestError('')
    try {
      const API_BASE = (import.meta.env.VITE_API_URL ?? '') + '/api/ai'
      const res = await fetch(`${API_BASE}/test-connection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, model }),
      })
      let data: any = {}
      try { data = await res.json() } catch { data = { error: `Server error (${res.status})` } }

      if (data.ok) {
        setTestStatus('ok')
      } else {
        setTestStatus('error')
        const raw = data.error
        setTestError(typeof raw === 'string' ? raw : raw?.message ?? 'Connection failed.')
      }
    } catch {
      setTestStatus('error')
      setTestError('Could not reach the server.')
    }
  }, [provider, model])

  const currentModels = MODELS[provider]

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="settings-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.45)' }}
          onClick={onClose}
        >
          <motion.div
            key="settings-modal"
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 12 }}
            transition={{ type: 'spring', stiffness: 500, damping: 35 }}
            className="w-full max-w-md rounded-2xl border shadow-lg p-6 mx-4"
            style={{ background: 'var(--panel-bg)', borderColor: 'var(--panel-border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-500 flex items-center justify-center">
                  <Settings size={18} color="white" />
                </div>
                <div>
                  <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                    AI Settings
                  </h2>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    Choose your AI provider and model
                  </p>
                </div>
              </div>
              <button onClick={onClose} style={{ color: 'var(--text-muted)' }}>
                <X size={18} />
              </button>
            </div>

            {/* Provider selector */}
            <div className="mb-4">
              <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                AI Provider
              </label>
              <div
                className="flex rounded-xl border overflow-hidden"
                style={{ borderColor: 'var(--panel-border)' }}
              >
                {(['anthropic', 'openai'] as AIProvider[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => handleProviderChange(p)}
                    className="flex-1 py-2 text-sm font-medium transition-colors"
                    style={
                      provider === p
                        ? { background: 'var(--brand)', color: 'white' }
                        : { background: 'transparent', color: 'var(--text-secondary)' }
                    }
                  >
                    {p === 'openai' ? 'OpenAI' : 'Anthropic'}
                  </button>
                ))}
              </div>
            </div>

            {/* Model selector */}
            <div className="mb-5">
              <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                Model
              </label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none appearance-none"
                style={{
                  background: 'var(--canvas-bg)',
                  borderColor: 'var(--panel-border)',
                  color: 'var(--text-primary)',
                }}
              >
                {currentModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Test result */}
            {testStatus === 'ok' && (
              <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 dark:bg-green-900/20 text-sm text-green-600 dark:text-green-400">
                <CheckCircle size={14} />
                Connection successful!
              </div>
            )}
            {testStatus === 'error' && (
              <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-sm text-red-600 dark:text-red-400">
                <AlertCircle size={14} />
                {testError}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={handleTest}
                disabled={testStatus === 'loading'}
                className="flex-1 py-2.5 rounded-xl border text-sm font-medium transition-colors hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center justify-center gap-1.5 disabled:opacity-60"
                style={{ borderColor: 'var(--panel-border)', color: 'var(--text-secondary)' }}
              >
                {testStatus === 'loading' ? (
                  <><Loader2 size={13} className="animate-spin" /> Testing...</>
                ) : (
                  'Test Connection'
                )}
              </button>
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl bg-indigo-500 text-white text-sm font-medium hover:bg-indigo-600 transition-colors"
              >
                Save
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
