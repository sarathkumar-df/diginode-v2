import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, X, Loader2, Type, FileText } from 'lucide-react'
import { useMindMapStore } from '@/store/mindmapStore'
import { generateMapFromTopic, generateMapFromText } from '@/services/aiService'
import { v4 as uuidv4 } from 'uuid'
import { MindMapNode, MindMapEdge } from '@/types'

interface AINodeTree {
  label: string
  icon?: string
  color?: string
  children?: AINodeTree[]
}

function buildNodesFromTree(
  items: AINodeTree[],
  parentId: string,
  parentPos: { x: number; y: number },
  level: number
): { nodes: MindMapNode[]; edges: MindMapEdge[] } {
  const nodes: MindMapNode[] = []
  const edges: MindMapEdge[] = []
  const count = items.length

  items.forEach((item, i) => {
    const id = uuidv4()
    const color = item.color ?? '#54A0FF'
    let x: number, y: number

    if (level === 1) {
      const angle = (i / count) * 2 * Math.PI - Math.PI / 2
      x = parentPos.x + Math.cos(angle) * 260
      y = parentPos.y + Math.sin(angle) * 180
    } else {
      const spread = 120
      const startY = parentPos.y - (spread * (count - 1)) / 2
      x = parentPos.x + 200
      y = startY + i * spread
    }

    nodes.push({
      id,
      type: 'mindmap',
      position: { x, y },
      data: {
        label: item.icon ? `${item.icon} ${item.label}` : item.label,
        color,
        shape: 'rounded',
        level,
      },
    })

    edges.push({
      id: `e-${parentId}-${id}`,
      source: parentId,
      target: id,
      type: 'custom',
      style: { stroke: color, strokeWidth: 2 },
    })

    if (item.children?.length) {
      const sub = buildNodesFromTree(item.children, id, { x, y }, level + 1)
      nodes.push(...sub.nodes)
      edges.push(...sub.edges)
    }
  })

  return { nodes, edges }
}

function applyGeneratedMap(parsed: any, fallbackTitle: string) {
  const rootId = uuidv4()
  const rootNode: MindMapNode = {
    id: rootId,
    type: 'mindmap',
    position: { x: 0, y: 0 },
    data: { label: parsed.title ?? fallbackTitle, color: '#6366f1', shape: 'rounded', level: 0 },
  }

  const { nodes: childNodes, edges } = buildNodesFromTree(parsed.nodes ?? [], rootId, { x: 0, y: 0 }, 1)

  const newMap = {
    id: uuidv4(),
    title: parsed.title ?? fallbackTitle,
    nodes: [rootNode, ...childNodes],
    edges,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    theme: 'light' as const,
  }

  useMindMapStore.setState((s) => ({
    maps: [...s.maps, newMap],
    activeMapId: newMap.id,
    nodes: newMap.nodes,
    edges: newMap.edges,
    history: [],
    historyIndex: -1,
  }))

  setTimeout(() => useMindMapStore.getState().autoLayout(), 120)
}

type GenTab = 'topic' | 'text'

interface Props {
  open: boolean
  onClose: () => void
}

export function GenerateMapModal({ open, onClose }: Props) {
  const [genTab, setGenTab] = useState<GenTab>('topic')
  const [topic, setTopic] = useState('')
  const [pastedText, setPastedText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleClose = () => { setError(null); onClose() }

  const handleGenerate = useCallback(async () => {
    const isText = genTab === 'text'
    const input = isText ? pastedText.trim() : topic.trim()
    if (!input || loading) return

    setLoading(true)
    setError(null)

    let fullText = ''
    try {
      if (isText) {
        await generateMapFromText(input, (chunk) => { fullText += chunk })
      } else {
        await generateMapFromTopic(input, (chunk) => { fullText += chunk })
      }

      const jsonMatch = fullText.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('Could not parse AI response. Try again.')

      applyGeneratedMap(JSON.parse(jsonMatch[0]), isText ? 'Mind Map' : input)
      setTopic('')
      setPastedText('')
      handleClose()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [genTab, topic, pastedText, loading, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="generate-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.45)' }}
          onClick={handleClose}
        >
          <motion.div
            key="generate-modal"
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
                  <Sparkles size={18} color="white" />
                </div>
                <div>
                  <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                    Generate with AI
                  </h2>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    Build a mind map instantly
                  </p>
                </div>
              </div>
              <button onClick={handleClose} style={{ color: 'var(--text-muted)' }}>
                <X size={18} />
              </button>
            </div>

            {/* Mode tabs */}
            <div
              className="flex gap-1 p-1 rounded-xl mb-4"
              style={{ background: 'var(--canvas-bg)', border: '1px solid var(--panel-border)' }}
            >
              {([
                { id: 'topic' as GenTab, icon: Type, label: 'From Topic' },
                { id: 'text' as GenTab, icon: FileText, label: 'From Text' },
              ]).map(({ id, icon: Icon, label }) => (
                <button
                  key={id}
                  onClick={() => { setGenTab(id); setError(null) }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all"
                  style={
                    genTab === id
                      ? { background: 'var(--panel-bg)', color: 'var(--text-primary)', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }
                      : { color: 'var(--text-muted)' }
                  }
                >
                  <Icon size={12} />
                  {label}
                </button>
              ))}
            </div>

            {/* From Topic */}
            {genTab === 'topic' && (
              <>
                <input
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
                  placeholder="e.g. Product Launch Strategy, Climate Change..."
                  autoFocus
                  className="w-full px-4 py-3 rounded-xl border outline-none text-sm mb-3"
                  style={{
                    background: 'var(--canvas-bg)',
                    borderColor: 'var(--panel-border)',
                    color: 'var(--text-primary)',
                  }}
                />
                <div className="flex flex-wrap gap-2 mb-4">
                  {['Product Roadmap', 'Study Plan', 'Business Model', 'Travel Planning'].map((s) => (
                    <button
                      key={s}
                      onClick={() => setTopic(s)}
                      className="text-xs px-2.5 py-1 rounded-full border hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
                      style={{ borderColor: 'var(--panel-border)', color: 'var(--text-secondary)' }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* From Text */}
            {genTab === 'text' && (
              <div className="mb-4">
                <textarea
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  placeholder="Paste any text — an article, notes, outline, or document. AI will extract the key ideas and structure them as a mind map."
                  autoFocus
                  rows={7}
                  className="w-full px-4 py-3 rounded-xl border outline-none text-sm resize-none leading-relaxed"
                  style={{
                    background: 'var(--canvas-bg)',
                    borderColor: 'var(--panel-border)',
                    color: 'var(--text-primary)',
                  }}
                />
                <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
                  Up to ~4,000 words · AI extracts 4–6 main themes with sub-topics
                </p>
              </div>
            )}

            {error && (
              <div className="mb-3 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-sm text-red-600 dark:text-red-400">
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={handleClose}
                className="flex-1 py-2.5 rounded-xl border text-sm font-medium transition-colors hover:bg-gray-50 dark:hover:bg-gray-700"
                style={{ borderColor: 'var(--panel-border)', color: 'var(--text-secondary)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleGenerate}
                disabled={!(genTab === 'topic' ? topic.trim() : pastedText.trim()) || loading}
                className="flex-1 py-2.5 rounded-xl bg-indigo-500 text-white text-sm font-medium disabled:opacity-50 hover:bg-indigo-600 transition-colors flex items-center justify-center gap-2"
              >
                {loading
                  ? <><Loader2 size={14} className="animate-spin" /> Generating…</>
                  : <><Sparkles size={14} /> Generate</>
                }
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
