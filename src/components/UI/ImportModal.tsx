import { useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Upload, FileJson, FileText, AlertCircle, Loader2 } from 'lucide-react'
import { parseJSON, parseMarkdown } from '@/utils/importUtils'
import { MindMapNode, MindMapEdge } from '@/types'

interface ImportResult {
  title: string
  nodes: MindMapNode[]
  edges: MindMapEdge[]
}

interface Props {
  open: boolean
  onClose: () => void
  onImport: (result: ImportResult) => Promise<void>
}

type TabId = 'json' | 'markdown'

export function ImportModal({ open, onClose, onImport }: Props) {
  const [tab, setTab] = useState<TabId>('json')
  const [mdText, setMdText] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const reset = () => { setError(''); setMdText(''); setTab('json') }

  const handleClose = () => { if (!loading) { reset(); onClose() } }

  const processFile = useCallback((file: File) => {
    setError('')
    const reader = new FileReader()
    reader.onload = async (e) => {
      const text = e.target?.result as string
      const result = parseJSON(text)
      if (!result) { setError('Invalid JSON format. Make sure it\'s a DigiNode export file.'); return }
      setLoading(true)
      try { await onImport(result); handleClose() }
      catch { setError('Failed to create map. Please try again.') }
      finally { setLoading(false) }
    }
    reader.readAsText(file)
  }, [onImport])

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (!file) return
    if (!file.name.endsWith('.json')) { setError('Only .json files are supported here.'); return }
    processFile(file)
  }, [processFile])

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
    e.target.value = ''
  }

  const handleMarkdownImport = async () => {
    setError('')
    if (!mdText.trim()) { setError('Paste some Markdown content first.'); return }
    const result = parseMarkdown(mdText)
    if (!result) { setError('Could not parse the Markdown. Check the format.'); return }
    setLoading(true)
    try { await onImport(result); handleClose() }
    catch { setError('Failed to create map. Please try again.') }
    finally { setLoading(false) }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          style={{ background: 'rgba(0,0,0,0.4)' }}
          onClick={handleClose}
        >
          <motion.div
            className="w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden"
            style={{ background: 'var(--panel-bg)', borderColor: 'var(--panel-border)' }}
            initial={{ scale: 0.95, opacity: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 8 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--panel-border)' }}>
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'var(--brand-light)' }}>
                  <Upload size={14} style={{ color: 'var(--brand)' }} />
                </div>
                <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Import Map</span>
              </div>
              <button onClick={handleClose} className="w-7 h-7 rounded-lg flex items-center justify-center hover:opacity-70 transition-opacity" style={{ color: 'var(--text-muted)' }}>
                <X size={15} />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b" style={{ borderColor: 'var(--panel-border)' }}>
              {([['json', FileJson, 'JSON File'], ['markdown', FileText, 'Markdown']] as const).map(([id, Icon, label]) => (
                <button
                  key={id}
                  onClick={() => { setTab(id); setError('') }}
                  className="flex-1 flex items-center justify-center gap-2 py-3 text-xs font-medium transition-colors"
                  style={{
                    color: tab === id ? 'var(--brand)' : 'var(--text-muted)',
                    borderBottom: tab === id ? '2px solid var(--brand)' : '2px solid transparent',
                  }}
                >
                  <Icon size={13} />
                  {label}
                </button>
              ))}
            </div>

            {/* Body */}
            <div className="p-6">
              {tab === 'json' ? (
                <div>
                  <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
                    Import a <strong>.json</strong> file previously exported from DigiNode.
                  </p>
                  {/* Drop zone */}
                  <div
                    className="border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-3 py-10 cursor-pointer transition-colors"
                    style={{
                      borderColor: dragging ? 'var(--brand)' : 'var(--panel-border)',
                      background: dragging ? 'var(--brand-light)' : 'transparent',
                    }}
                    onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={handleFileDrop}
                    onClick={() => fileRef.current?.click()}
                  >
                    <FileJson size={28} style={{ color: dragging ? 'var(--brand)' : 'var(--text-muted)' }} />
                    <div className="text-center">
                      <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        Drop your .json file here
                      </p>
                      <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>or click to browse</p>
                    </div>
                    <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleFileInput} />
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
                    Paste a Markdown outline. Use <code className="px-1 py-0.5 rounded text-xs" style={{ background: 'var(--canvas-bg)' }}># Title</code>, <code className="px-1 py-0.5 rounded text-xs" style={{ background: 'var(--canvas-bg)' }}>## Root</code>, and <code className="px-1 py-0.5 rounded text-xs" style={{ background: 'var(--canvas-bg)' }}>- items</code>.
                  </p>
                  <textarea
                    value={mdText}
                    onChange={(e) => setMdText(e.target.value)}
                    placeholder={'# My Map\n\n## Central Topic\n- Child node\n  - Grandchild\n- Another child'}
                    rows={9}
                    className="w-full rounded-xl border px-3 py-2.5 text-xs font-mono resize-none outline-none transition-colors"
                    style={{
                      background: 'var(--canvas-bg)',
                      borderColor: 'var(--panel-border)',
                      color: 'var(--text-primary)',
                    }}
                  />
                  <button
                    onClick={handleMarkdownImport}
                    disabled={loading}
                    className="w-full mt-3 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2"
                    style={{ background: 'var(--brand)', color: 'white' }}
                  >
                    {loading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                    Import from Markdown
                  </button>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="mt-3 flex items-start gap-2 px-3 py-2.5 rounded-xl text-xs" style={{ background: '#fef2f2', color: '#ef4444' }}>
                  <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
                  {error}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
