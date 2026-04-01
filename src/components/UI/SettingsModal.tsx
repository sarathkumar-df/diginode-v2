import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Eye, EyeOff, CheckCircle, AlertCircle, Loader2, Settings } from 'lucide-react'
import { useSettingsStore, AIProvider, MODELS } from '@/store/settingsStore'

interface Props {
  open: boolean
  onClose: () => void
}

export function SettingsModal({ open, onClose }: Props) {
  const { provider, apiKey, model, setProvider, setApiKey, setModel } =
    useSettingsStore()

  const [localKey, setLocalKey] = useState(apiKey)
  const [showKey, setShowKey] = useState(false)
  const [testStatus, setTestStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [testError, setTestError] = useState('')

  const handleProviderChange = useCallback(
    (p: AIProvider) => {
      setProvider(p)
      setTestStatus('idle')
    },
    [setProvider]
  )

  const handleSave = useCallback(() => {
    setApiKey(localKey.trim())
    onClose()
  }, [localKey, setApiKey, onClose])

  const handleTest = useCallback(async () => {
    if (!localKey.trim()) {
      setTestStatus('error')
      setTestError('Please enter an API key first.')
      return
    }
    setTestStatus('loading')
    setTestError('')
    try {
      const res = await fetch('/api/ai/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey: localKey.trim(), model }),
      })
      let data: any = {}
      try { data = await res.json() } catch { data = { error: `Server error (${res.status})` } }

      if (data.ok) {
        setTestStatus('ok')
      } else {
        setTestStatus('error')
        const raw = data.error
        const msg = typeof raw === 'string' ? raw : raw?.message ?? JSON.stringify(raw) ?? 'Connection failed.'
        setTestError(msg)
      }
    } catch {
      setTestStatus('error')
      setTestError('Could not reach the server.')
    }
  }, [localKey, provider, model])

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
                    Configure your AI provider
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
                {(['openai', 'anthropic'] as AIProvider[]).map((p) => (
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
            <div className="mb-4">
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

            {/* API Key input */}
            <div className="mb-4">
              <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                API Key
              </label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={localKey}
                  onChange={(e) => { setLocalKey(e.target.value); setTestStatus('idle') }}
                  placeholder={provider === 'openai' ? 'sk-...' : 'sk-ant-...'}
                  className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none pr-10"
                  style={{
                    background: 'var(--canvas-bg)',
                    borderColor: 'var(--panel-border)',
                    color: 'var(--text-primary)',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowKey((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <p className="mt-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                Your key is stored locally and never sent to our servers.
              </p>
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
                className="flex-1 py-2.5 rounded-xl border text-sm font-medium transition-colors hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center justify-center gap-1.5"
                style={{ borderColor: 'var(--panel-border)', color: 'var(--text-secondary)' }}
              >
                {testStatus === 'loading' ? (
                  <><Loader2 size={13} className="animate-spin" /> Testing...</>
                ) : (
                  'Test Connection'
                )}
              </button>
              <button
                onClick={handleSave}
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
