import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles, FileText, Link2, PenLine, Wand2,
  RefreshCw, X, Send, StopCircle, Plus, Check, CheckCheck,
  ChevronRight,
} from 'lucide-react'
import { useUIStore } from '@/store/uiStore'
import { useAI } from '@/hooks/useAI'
import { AINodeSuggestion } from '@/types'

function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-1 py-0.5">
      <span className="thinking-dot" />
      <span className="thinking-dot" />
      <span className="thinking-dot" />
    </div>
  )
}

type AITab = 'chat' | 'tools'

const PROMPT_CHIPS = [
  'Give me 5 ideas to expand this map',
  'What connections am I missing?',
  'How can I better organize this?',
]

export function RightSidebar() {
  const { rightPanelOpen, toggleRightPanel, aiMessages, aiStatus, aiError, clearAIMessages } = useUIStore()
  const {
    sendChatMessage, summarize, discoverConnections, writeDocument,
    cancelCurrent, fetchExpandSuggestions, addSuggestionNode, addAllSuggestions,
  } = useAI()

  const [tab, setTab] = useState<AITab>('tools')
  const [input, setInput] = useState('')
  const [writeFormat, setWriteFormat] = useState<'essay' | 'outline' | 'bullets'>('essay')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const [expandResult, setExpandResult] = useState<{
    nodeId: string
    nodeName: string
    suggestions: AINodeSuggestion[]
    added: Set<number>
  } | null>(null)

  const handleExpand = useCallback(async () => {
    setExpandResult(null)
    const result = await fetchExpandSuggestions()
    if (result && result.suggestions.length > 0) {
      setExpandResult({ ...result, added: new Set() })
    }
  }, [fetchExpandSuggestions])

  const handleAddOne = useCallback((idx: number) => {
    if (!expandResult) return
    addSuggestionNode(expandResult.nodeId, expandResult.suggestions[idx])
    setExpandResult((prev) => {
      if (!prev) return prev
      const added = new Set(prev.added)
      added.add(idx)
      return { ...prev, added }
    })
  }, [expandResult, addSuggestionNode])

  const handleAddAll = useCallback(() => {
    if (!expandResult) return
    const remaining = expandResult.suggestions.filter((_, i) => !expandResult.added.has(i))
    if (remaining.length > 0) addAllSuggestions(expandResult.nodeId, remaining)
    setExpandResult((prev) => {
      if (!prev) return prev
      return { ...prev, added: new Set(prev.suggestions.map((_, i) => i)) }
    })
  }, [expandResult, addAllSuggestions])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [aiMessages])

  const handleSend = useCallback(() => {
    if (!input.trim() || aiStatus === 'streaming') return
    sendChatMessage(input.trim())
    setInput('')
  }, [input, aiStatus, sendChatMessage])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  const isBusy = aiStatus === 'streaming' || aiStatus === 'loading'
  const allAdded = expandResult != null && expandResult.added.size === expandResult.suggestions.length

  return (
    <AnimatePresence>
      {rightPanelOpen && (
        <motion.div
          key="right-panel"
          initial={{ x: 320, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 320, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 35 }}
          className="absolute top-0 right-0 h-full w-72 z-40 flex flex-col"
          style={{
            background: 'var(--panel-bg)',
            borderLeft: '1px solid var(--panel-border)',
            boxShadow: 'var(--panel-shadow)',
          }}
        >
          {/* ── Header ───────────────────────────────────────────────── */}
          <div
            className="flex-shrink-0 px-4 pt-4 pb-0 border-b"
            style={{ borderColor: 'var(--panel-border)' }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{ background: 'var(--brand)', opacity: 0.9 }}
                >
                  <Sparkles size={13} color="white" />
                </div>
                <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  AI Assistant
                </span>
              </div>
              <div className="flex items-center gap-0.5">
                {aiMessages.length > 0 && (
                  <button
                    onClick={clearAIMessages}
                    title="Clear"
                    className="w-7 h-7 rounded-md flex items-center justify-center transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <RefreshCw size={13} />
                  </button>
                )}
                <button
                  onClick={toggleRightPanel}
                  className="w-7 h-7 rounded-md flex items-center justify-center transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex">
              {(['tools', 'chat'] as AITab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className="relative pb-2.5 px-1 mr-5 text-xs font-medium transition-colors"
                  style={{ color: tab === t ? 'var(--text-primary)' : 'var(--text-muted)' }}
                >
                  {t === 'tools' ? 'Tools' : 'Chat'}
                  {tab === t && (
                    <motion.div
                      layoutId="tab-underline"
                      className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
                      style={{ background: 'var(--brand)' }}
                      transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                    />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* ── Body ─────────────────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto">

            {tab === 'tools' ? (
              <div className="p-4 space-y-2">

                {/* Expand Node */}
                <Section>
                  <SectionHeader icon={Wand2} title="Expand Node" />
                  <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
                    Generate child ideas for the selected node
                  </p>
                  <PrimaryButton onClick={handleExpand} loading={isBusy && !expandResult}>
                    Generate Ideas
                  </PrimaryButton>

                  <AnimatePresence>
                    {expandResult && expandResult.suggestions.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden mt-3"
                      >
                        <div
                          className="border-t pt-3"
                          style={{ borderColor: 'var(--panel-border)' }}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                              {expandResult.suggestions.length} ideas for &ldquo;{expandResult.nodeName}&rdquo;
                            </span>
                            <button
                              onClick={handleAddAll}
                              disabled={allAdded}
                              className="flex items-center gap-1 text-xs font-medium transition-opacity disabled:opacity-30"
                              style={{ color: 'var(--brand)' }}
                            >
                              <CheckCheck size={11} />
                              {allAdded ? 'Done' : 'Add all'}
                            </button>
                          </div>
                          <div className="space-y-0.5">
                            {expandResult.suggestions.map((s, i) => {
                              const isAdded = expandResult.added.has(i)
                              return (
                                <motion.button
                                  key={i}
                                  initial={{ opacity: 0, y: 4 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{ delay: i * 0.04 }}
                                  onClick={() => !isAdded && handleAddOne(i)}
                                  disabled={isAdded}
                                  className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-left group transition-colors disabled:cursor-default"
                                  style={{
                                    background: isAdded ? 'var(--canvas-bg)' : 'transparent',
                                  }}
                                  onMouseEnter={(e) => { if (!isAdded) e.currentTarget.style.background = 'var(--canvas-bg)' }}
                                  onMouseLeave={(e) => { if (!isAdded) e.currentTarget.style.background = 'transparent' }}
                                >
                                  {s.icon && (
                                    <span className="text-sm leading-none flex-shrink-0">{s.icon}</span>
                                  )}
                                  <span
                                    className="flex-1 text-xs"
                                    style={{ color: isAdded ? 'var(--text-muted)' : 'var(--text-primary)' }}
                                  >
                                    {s.label}
                                  </span>
                                  <div
                                    className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-colors"
                                    style={{
                                      color: isAdded ? '#22c55e' : 'var(--text-muted)',
                                      background: isAdded ? '#f0fdf4' : 'transparent',
                                    }}
                                  >
                                    {isAdded ? <Check size={11} /> : <Plus size={11} className="opacity-0 group-hover:opacity-100 transition-opacity" />}
                                  </div>
                                </motion.button>
                              )
                            })}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Section>

                <Divider />

                {/* Summarize */}
                <Section>
                  <SectionHeader icon={FileText} title="Summarize Map" />
                  <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
                    Convert your mind map into a readable summary
                  </p>
                  <SecondaryButton onClick={() => { summarize(); setTab('chat') }} loading={isBusy}>
                    Summarize
                  </SecondaryButton>
                </Section>

                <Divider />

                {/* Find Connections */}
                <Section>
                  <SectionHeader icon={Link2} title="Find Connections" />
                  <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
                    Discover non-obvious links between nodes
                  </p>
                  <SecondaryButton onClick={discoverConnections} loading={isBusy}>
                    Analyze
                  </SecondaryButton>
                </Section>

                <Divider />

                {/* Write from Map */}
                <Section>
                  <SectionHeader icon={PenLine} title="Write from Map" />
                  <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
                    Generate a document from your map structure
                  </p>
                  <div
                    className="flex rounded-lg p-0.5 mb-3"
                    style={{ background: 'var(--canvas-bg)', border: '1px solid var(--panel-border)' }}
                  >
                    {(['essay', 'outline', 'bullets'] as const).map((f) => (
                      <button
                        key={f}
                        onClick={() => setWriteFormat(f)}
                        className="flex-1 py-1.5 rounded-md text-xs font-medium transition-all"
                        style={
                          writeFormat === f
                            ? { background: 'var(--panel-bg)', color: 'var(--text-primary)', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }
                            : { color: 'var(--text-muted)' }
                        }
                      >
                        {f === 'essay' ? 'Essay' : f === 'outline' ? 'Outline' : 'Bullets'}
                      </button>
                    ))}
                  </div>
                  <SecondaryButton onClick={() => { writeDocument(writeFormat); setTab('chat') }} loading={isBusy}>
                    Write
                  </SecondaryButton>
                </Section>

                <AnimatePresence>
                  {isBusy && (
                    <motion.button
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={cancelCurrent}
                      className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors"
                      style={{ color: '#ef4444', background: '#fef2f2', border: '1px solid #fecaca' }}
                    >
                      <StopCircle size={12} /> Stop generating
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>

            ) : (
              /* Chat tab */
              <div className="p-3 space-y-3">
                {aiMessages.length === 0 && (
                  <div className="pt-6 pb-2">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
                      style={{ background: 'var(--canvas-bg)', border: '1px solid var(--panel-border)' }}
                    >
                      <Sparkles size={18} style={{ color: 'var(--brand)' }} />
                    </div>
                    <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                      Brainstorm with AI
                    </p>
                    <p className="text-xs leading-relaxed mb-4" style={{ color: 'var(--text-muted)' }}>
                      Ask anything about your map or get ideas to develop it further.
                    </p>
                    <div className="space-y-1.5">
                      {PROMPT_CHIPS.map((prompt) => (
                        <button
                          key={prompt}
                          onClick={() => sendChatMessage(prompt)}
                          className="w-full text-left px-3 py-2 rounded-lg text-xs flex items-center justify-between group transition-colors"
                          style={{
                            background: 'var(--canvas-bg)',
                            border: '1px solid var(--panel-border)',
                            color: 'var(--text-secondary)',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = 'var(--brand)'
                            e.currentTarget.style.color = 'var(--text-primary)'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = 'var(--panel-border)'
                            e.currentTarget.style.color = 'var(--text-secondary)'
                          }}
                        >
                          <span>{prompt}</span>
                          <ChevronRight size={12} className="flex-shrink-0 opacity-0 group-hover:opacity-50 transition-opacity" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {aiMessages.map((msg) => (
                  <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {msg.role === 'assistant' && (
                      <div
                        className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-1"
                        style={{ background: 'var(--canvas-bg)', border: '1px solid var(--panel-border)' }}
                      >
                        <Sparkles size={10} style={{ color: 'var(--brand)' }} />
                      </div>
                    )}
                    <div
                      className={`max-w-[82%] rounded-xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap ${
                        msg.role === 'user' ? 'rounded-br-sm' : 'rounded-bl-sm'
                      }`}
                      style={
                        msg.role === 'user'
                          ? { background: 'var(--brand)', color: 'white' }
                          : { background: 'var(--canvas-bg)', color: 'var(--text-primary)', border: '1px solid var(--panel-border)' }
                      }
                    >
                      {msg.content || (isBusy ? <ThinkingIndicator /> : null)}
                    </div>
                  </div>
                ))}

                {aiStatus === 'loading' && (
                  <div className="flex gap-2">
                    <div
                      className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-1"
                      style={{ background: 'var(--canvas-bg)', border: '1px solid var(--panel-border)' }}
                    >
                      <Sparkles size={10} style={{ color: 'var(--brand)' }} />
                    </div>
                    <div
                      className="rounded-xl rounded-bl-sm px-3 py-2"
                      style={{ background: 'var(--canvas-bg)', border: '1px solid var(--panel-border)' }}
                    >
                      <ThinkingIndicator />
                    </div>
                  </div>
                )}

                {aiError && (
                  <div className="px-3 py-2 rounded-lg text-xs" style={{ background: '#fef2f2', color: '#ef4444' }}>
                    {aiError}
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* ── Chat input ────────────────────────────────────────────── */}
          {tab === 'chat' && (
            <div className="border-t p-3 flex-shrink-0" style={{ borderColor: 'var(--panel-border)' }}>
              <div
                className="flex items-end gap-2 rounded-xl border px-3 py-2 transition-colors"
                style={{ borderColor: 'var(--panel-border)', background: 'var(--canvas-bg)' }}
              >
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask anything about your map…"
                  rows={1}
                  disabled={isBusy}
                  className="flex-1 resize-none bg-transparent outline-none text-xs leading-relaxed"
                  style={{ color: 'var(--text-primary)', maxHeight: 80 }}
                />
                {aiStatus === 'streaming' ? (
                  <button
                    onClick={cancelCurrent}
                    className="flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center bg-red-500 text-white"
                  >
                    <StopCircle size={11} />
                  </button>
                ) : (
                  <button
                    onClick={handleSend}
                    disabled={!input.trim()}
                    className="flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center text-white disabled:opacity-30 transition-opacity"
                    style={{ background: 'var(--brand)' }}
                  >
                    <Send size={11} />
                  </button>
                )}
              </div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ── Small reusable components ─────────────────────────────────────────────── */

function Section({ children }: { children: React.ReactNode }) {
  return <div className="py-1">{children}</div>
}

function Divider() {
  return <div className="h-px" style={{ background: 'var(--panel-border)' }} />
}

function SectionHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-1.5">
      <Icon size={13} style={{ color: 'var(--brand)' }} />
      <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</span>
    </div>
  )
}

function PrimaryButton({ children, onClick, loading }: {
  children: React.ReactNode; onClick: () => void; loading?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="w-full py-2 rounded-lg text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1.5"
      style={{ background: 'var(--brand)' }}
    >
      {loading
        ? <><span className="w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin" /> Working…</>
        : children
      }
    </button>
  )
}

function SecondaryButton({ children, onClick, loading }: {
  children: React.ReactNode; onClick: () => void; loading?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="w-full py-2 rounded-lg text-xs font-medium transition-colors hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 flex items-center justify-center gap-1.5"
      style={{
        border: '1px solid var(--panel-border)',
        color: 'var(--text-secondary)',
      }}
    >
      {loading
        ? <><span className="w-3 h-3 border border-current/40 border-t-current rounded-full animate-spin opacity-60" /> Working…</>
        : children
      }
    </button>
  )
}
