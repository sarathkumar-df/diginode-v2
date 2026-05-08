import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles, FileText, PenLine, Wand2,
  RefreshCw, X, Send, StopCircle, Plus, Check, CheckCheck,
  ChevronRight, Quote, Zap, Target, Flame,
  ShieldAlert, ListOrdered, Scan, Shrink, Search as SearchIcon, Users,
} from 'lucide-react'
import { useUIStore } from '@/store/uiStore'
import { useMindMapStore } from '@/store/mindmapStore'
import { useSettingsStore, RIGHT_PANEL_MIN, RIGHT_PANEL_MAX } from '@/store/settingsStore'
import { useAI, RefineMode, AnalysisMode } from '@/hooks/useAI'
import { ADVISORS } from '@/data/advisors'
import { MapAdvisor } from '@/types'

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
  const {
    rightPanelOpen, toggleRightPanel, aiMessages, aiStatus, aiError, clearAIMessages,
    expandResult, markExpandSuggestionAdded, markAllExpandSuggestionsAdded,
    selectedNodeIds,
  } = useUIStore()
  const {
    sendChatMessage, summarize, discoverConnections, writeDocument,
    cancelCurrent, fetchExpandSuggestions, refineExpandSuggestions,
    addSuggestionNode, addAllSuggestions, runAnalysis, runDebate,
  } = useAI()
  const mapAdvisor = useMindMapStore((s) => s.advisor)
  const hasSelectedNode = selectedNodeIds.length === 1

  const [tab, setTab] = useState<AITab>('tools')
  const [input, setInput] = useState('')
  const [writeFormat, setWriteFormat] = useState<'essay' | 'outline' | 'bullets'>('essay')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 80)}px`
  }, [input, tab])

  // Auto-switch the active tab to wherever the latest activity is happening,
  // so a generate triggered from the canvas popover (lands in Tools) or a chat
  // action triggered from the Tools tab (lands in Chat) doesn't strand the
  // user on the wrong tab. We only react to transitions, not steady state.
  const prevExpandNodeIdRef = useRef<string | null>(expandResult?.nodeId ?? null)
  const prevMessageCountRef = useRef<number>(aiMessages.length)

  useEffect(() => {
    const nextId = expandResult?.nodeId ?? null
    if (nextId && nextId !== prevExpandNodeIdRef.current) setTab('tools')
    prevExpandNodeIdRef.current = nextId
  }, [expandResult?.nodeId])

  useEffect(() => {
    if (aiMessages.length > prevMessageCountRef.current) setTab('chat')
    prevMessageCountRef.current = aiMessages.length
  }, [aiMessages.length])

  const handleExpand = useCallback(() => {
    fetchExpandSuggestions()
  }, [fetchExpandSuggestions])

  const handleAddOne = useCallback((idx: number) => {
    if (!expandResult) return
    addSuggestionNode(expandResult.nodeId, expandResult.suggestions[idx])
    markExpandSuggestionAdded(idx)
  }, [expandResult, addSuggestionNode, markExpandSuggestionAdded])

  const handleAddAll = useCallback(() => {
    if (!expandResult) return
    const addedSet = new Set(expandResult.added)
    const remaining = expandResult.suggestions.filter((_, i) => !addedSet.has(i))
    if (remaining.length > 0) addAllSuggestions(expandResult.nodeId, remaining)
    markAllExpandSuggestionsAdded()
  }, [expandResult, addAllSuggestions, markAllExpandSuggestionsAdded])

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
  const allAdded = expandResult != null && expandResult.added.length === expandResult.suggestions.length

  // Resizable: width persists across reloads via settingsStore. We derive the
  // "live" width from a local ref during a drag so we don't push every mouse-
  // move into the persisted store; the store is updated only on mouseup.
  const rightPanelWidth = useSettingsStore((s) => s.rightPanelWidth)
  const setRightPanelWidth = useSettingsStore((s) => s.setRightPanelWidth)
  const dragWidthRef = useRef<number | null>(null)
  const [resizing, setResizing] = useState(false)
  const [liveWidth, setLiveWidth] = useState<number | null>(null)

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setResizing(true)
    dragWidthRef.current = rightPanelWidth
    const startX = e.clientX

    const onMove = (ev: MouseEvent) => {
      const delta = startX - ev.clientX // dragging left = wider (panel is right-anchored)
      const next = Math.max(RIGHT_PANEL_MIN, Math.min(RIGHT_PANEL_MAX, rightPanelWidth + delta))
      dragWidthRef.current = next
      setLiveWidth(next)
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      if (dragWidthRef.current !== null) setRightPanelWidth(dragWidthRef.current)
      setResizing(false)
      setLiveWidth(null)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [rightPanelWidth, setRightPanelWidth])

  const effectiveWidth = liveWidth ?? rightPanelWidth

  return (
    <AnimatePresence>
      {rightPanelOpen && (
        <motion.div
          key="right-panel"
          initial={{ x: 320, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 320, opacity: 0 }}
          // Skip the spring animation while resizing so width tracks the
          // mouse 1:1 instead of overshooting and bouncing.
          transition={resizing ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 35 }}
          className="absolute top-0 right-0 h-full z-40 flex flex-col"
          style={{
            width: effectiveWidth,
            background: 'var(--panel-bg)',
            borderLeft: '1px solid var(--panel-border)',
            boxShadow: 'var(--panel-shadow)',
          }}
        >
          {/* Drag handle — thin invisible strip on the left edge that widens
              the panel when dragged left. Brand-colored stripe shows up on
              hover/while resizing so it's discoverable but not noisy. */}
          <div
            onMouseDown={startResize}
            title="Drag to resize"
            className="absolute top-0 left-0 h-full w-1.5 -translate-x-1/2 z-50 group"
            style={{ cursor: 'ew-resize' }}
          >
            <div
              className="absolute top-0 left-1/2 -translate-x-1/2 h-full w-0.5 transition-colors"
              style={{
                background: resizing ? 'var(--brand)' : 'transparent',
              }}
            />
            {!resizing && (
              <div
                className="absolute top-0 left-1/2 -translate-x-1/2 h-full w-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: 'var(--brand)' }}
              />
            )}
          </div>
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
                          {expandResult.userPrompt && (
                            <div
                              className="flex items-start gap-1.5 mb-2 px-2 py-1.5 rounded-md"
                              style={{ background: 'var(--canvas-bg)', border: '1px solid var(--panel-border)' }}
                            >
                              <Quote size={10} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                              <span className="text-[11px] italic leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                                {expandResult.userPrompt}
                              </span>
                            </div>
                          )}
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
                          <RefinementChips
                            disabled={isBusy}
                            onRefine={(mode) => refineExpandSuggestions(mode)}
                          />
                          <div className="space-y-0.5">
                            {expandResult.suggestions.map((s, i) => {
                              const isAdded = expandResult.added.includes(i)
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

                {/* Analyze */}
                <Section>
                  <SectionHeader icon={SearchIcon} title="Analyze" />
                  <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
                    Push your thinking — challenge, prioritize, fill gaps, or tighten.
                  </p>
                  <AnalyzeGrid
                    hasSelectedNode={hasSelectedNode}
                    busy={isBusy}
                    onRun={(mode) => { runAnalysis(mode); setTab('chat') }}
                  />
                </Section>

                <Divider />

                {/* Multiple perspectives — debate mode */}
                <Section>
                  <SectionHeader icon={Users} title="Multiple Perspectives" />
                  <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
                    Hear 2–4 advisors weigh in on the same question. Each one stays in their own lens.
                  </p>
                  <DebateSetup
                    busy={isBusy}
                    mapAdvisor={mapAdvisor}
                    onRun={(question, advisors) => { runDebate(question, advisors); setTab('chat') }}
                  />
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
                    <div className={`flex flex-col gap-1.5 max-w-[82%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                      <div
                        className={`rounded-xl px-3 py-2 text-xs leading-relaxed ${
                          msg.role === 'user' ? 'rounded-br-sm whitespace-pre-wrap' : 'rounded-bl-sm'
                        }`}
                        style={
                          msg.role === 'user'
                            ? { background: 'var(--brand)', color: 'white' }
                            : { background: 'var(--canvas-bg)', color: 'var(--text-primary)', border: '1px solid var(--panel-border)' }
                        }
                      >
                        {msg.role === 'assistant'
                          ? (msg.content
                              ? <Markdown text={msg.content} />
                              : (isBusy ? <ThinkingIndicator /> : null))
                          : (msg.content || (isBusy ? <ThinkingIndicator /> : null))}
                      </div>
                      {msg.role === 'assistant' && msg.content && (
                        <ApplyChips content={msg.content} />
                      )}
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
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask anything about your map…"
                  rows={1}
                  disabled={isBusy}
                  className="flex-1 resize-none bg-transparent outline-none text-xs leading-relaxed overflow-y-auto"
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

/* ── Analyze grid (challenge / prioritize / find-gaps / compress) ──────────── */

const ANALYZE_TILES: Array<{
  mode: AnalysisMode
  label: string
  hint: string
  icon: React.ElementType
  requiresNode: boolean
}> = [
  { mode: 'challenge',  label: 'Challenge',  hint: 'Poke holes in weak assumptions',  icon: ShieldAlert, requiresNode: false },
  { mode: 'prioritize', label: 'Prioritize', hint: 'What to tackle first',            icon: ListOrdered, requiresNode: false },
  { mode: 'find-gaps',  label: 'Find gaps',  hint: 'Obvious sub-topics missing',      icon: Scan,        requiresNode: true },
  { mode: 'compress',   label: 'Compress',   hint: 'Tighten an overgrown branch',     icon: Shrink,      requiresNode: true },
]

function AnalyzeGrid({
  hasSelectedNode, busy, onRun,
}: {
  hasSelectedNode: boolean
  busy: boolean
  onRun: (mode: AnalysisMode) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {ANALYZE_TILES.map(({ mode, label, hint, icon: Icon, requiresNode }) => {
        const needsNode = requiresNode && !hasSelectedNode
        const disabled = busy || needsNode
        const title = needsNode ? `${hint} · select a node first` : hint
        return (
          <button
            key={mode}
            onClick={() => onRun(mode)}
            disabled={disabled}
            title={title}
            className="flex flex-col items-start gap-1 p-2 rounded-lg text-left border transition-colors disabled:opacity-40 hover:border-indigo-400"
            style={{
              borderColor: 'var(--panel-border)',
              background: 'var(--canvas-bg)',
            }}
          >
            <div className="flex items-center gap-1.5 w-full">
              <Icon size={11} style={{ color: 'var(--brand)' }} />
              <span className="text-[11px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                {label}
              </span>
            </div>
            <span className="text-[10px] leading-tight" style={{ color: 'var(--text-muted)' }}>
              {hint}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/* ── Debate setup (multi-advisor perspective panel) ─────────────────────────── */

const MIN_DEBATE = 2
const MAX_DEBATE = 4

// Default 3 advisors when the user opens this section: include the map's
// active advisor when there is one, plus two contrasting lenses. Devil's
// Advocate is great because it almost always disagrees with whatever the
// other two say; Senior Engineer grounds idealistic answers in practicality.
function pickDefaultAdvisors(map: MapAdvisor | null): MapAdvisor[] {
  const ids: string[] = []
  if (map) ids.push(map.id)
  for (const id of ['devils-advocate', 'senior-engineer', 'product-manager']) {
    if (ids.length >= 3) break
    if (!ids.includes(id)) ids.push(id)
  }
  const result: MapAdvisor[] = []
  for (const id of ids) {
    if (map?.id === id) {
      result.push(map)
    } else {
      const a = ADVISORS.find((x) => x.id === id)
      if (a) result.push({ id: a.id, label: a.label, role: a.role })
    }
  }
  return result.slice(0, MAX_DEBATE)
}

function DebateSetup({
  busy, mapAdvisor, onRun,
}: {
  busy: boolean
  mapAdvisor: MapAdvisor | null
  onRun: (question: string, advisors: MapAdvisor[]) => void
}) {
  const [question, setQuestion] = useState('')
  const [selected, setSelected] = useState<MapAdvisor[]>(() => pickDefaultAdvisors(mapAdvisor))

  // If the map advisor changes (or first appears) and the user hasn't taken
  // a non-default action, reseed defaults so a new custom advisor shows up.
  useEffect(() => {
    setSelected((prev) => {
      const hasMap = mapAdvisor && prev.some((a) => a.id === mapAdvisor.id)
      if (mapAdvisor && !hasMap && prev.length < MAX_DEBATE) {
        return [mapAdvisor, ...prev].slice(0, MAX_DEBATE)
      }
      return prev
    })
  }, [mapAdvisor])

  const isSelected = (id: string) => selected.some((a) => a.id === id)
  const canRun = question.trim().length > 0 && selected.length >= MIN_DEBATE && !busy

  // Library = curated advisors + the map's custom advisor (if present), so a
  // user who wrote a custom lens can still pull it into a debate alongside
  // curated ones.
  const library: MapAdvisor[] = [
    ...(mapAdvisor?.custom ? [mapAdvisor] : []),
    ...ADVISORS.map((a) => ({ id: a.id, label: a.label, role: a.role })),
  ]

  const toggle = (advisor: MapAdvisor) => {
    setSelected((prev) => {
      if (prev.some((a) => a.id === advisor.id)) {
        return prev.filter((a) => a.id !== advisor.id)
      }
      if (prev.length >= MAX_DEBATE) return prev
      return [...prev, advisor]
    })
  }

  return (
    <div className="space-y-2">
      <textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder='Ask one question, e.g. "Should we ship without rate limiting?"'
        rows={2}
        className="w-full px-2.5 py-2 rounded-lg border text-xs outline-none resize-none"
        style={{
          background: 'var(--canvas-bg)',
          borderColor: 'var(--panel-border)',
          color: 'var(--text-primary)',
        }}
      />

      <div className="flex flex-wrap gap-1">
        {library.map((advisor) => {
          const curated = ADVISORS.find((a) => a.id === advisor.id)
          const emoji = curated?.emoji ?? (advisor.custom ? '🧠' : '🎯')
          const active = isSelected(advisor.id)
          const disabled = !active && selected.length >= MAX_DEBATE
          return (
            <button
              key={advisor.id}
              onClick={() => toggle(advisor)}
              disabled={disabled}
              title={curated?.blurb || advisor.role}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-medium border transition-colors disabled:opacity-30"
              style={
                active
                  ? { background: 'var(--brand-light)', borderColor: 'var(--brand)', color: 'var(--brand)' }
                  : { background: 'var(--canvas-bg)', borderColor: 'var(--panel-border)', color: 'var(--text-secondary)' }
              }
            >
              <span aria-hidden>{emoji}</span>
              <span className="truncate max-w-[110px]">{advisor.label}</span>
            </button>
          )
        })}
      </div>

      <div className="flex items-center justify-between pt-1">
        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
          {selected.length}/{MAX_DEBATE} selected (min {MIN_DEBATE})
        </span>
        <button
          onClick={() => onRun(question.trim(), selected)}
          disabled={!canRun}
          className="px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors disabled:opacity-40"
          style={{
            background: canRun ? 'var(--brand)' : 'var(--canvas-bg)',
            color: canRun ? 'white' : 'var(--text-muted)',
            border: canRun ? 'none' : '1px solid var(--panel-border)',
          }}
        >
          Run debate
        </button>
      </div>
    </div>
  )
}

/* ── Refinement chips (5 more / concrete / ambitious / regenerate) ─────────── */

const REFINE_CHIPS: Array<{ mode: RefineMode; label: string; icon: React.ElementType }> = [
  { mode: 'more', label: '5 more', icon: Plus },
  { mode: 'concrete', label: 'More concrete', icon: Target },
  { mode: 'ambitious', label: 'More ambitious', icon: Flame },
  { mode: 'regenerate', label: 'Regenerate', icon: Zap },
]

function RefinementChips({
  disabled, onRefine,
}: {
  disabled: boolean
  onRefine: (mode: RefineMode) => void
}) {
  return (
    <div className="flex flex-wrap gap-1 mb-2">
      {REFINE_CHIPS.map(({ mode, label, icon: Icon }) => (
        <button
          key={mode}
          onClick={() => onRefine(mode)}
          disabled={disabled}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-[10.5px] font-medium border transition-colors disabled:opacity-40 hover:border-indigo-400"
          style={{
            borderColor: 'var(--panel-border)',
            color: 'var(--text-secondary)',
            background: 'var(--canvas-bg)',
          }}
        >
          <Icon size={10} />
          {label}
        </button>
      ))}
    </div>
  )
}

/* ── Tiny markdown renderer for chat replies ─────────────────────────────── */
// The model emits prose with **bold**, bullet/numbered lists, and headings.
// We render those as proper HTML so the chat doesn't look like raw text. Lines
// matching the **Add to "X":** pattern are dropped — ApplyChips renders those
// as interactive chips, so showing them as text would duplicate the UI.

const ADD_TO_LINE_RE = /^\s*\*\*Add to "[^"]+":\*\*/

function renderInline(text: string, keyBase: string): React.ReactNode[] {
  // Split on **bold** and `code`, keeping the delimiters.
  const out: React.ReactNode[] = []
  const re = /(\*\*[^*\n]+\*\*|`[^`\n]+`)/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const tok = m[0]
    if (tok.startsWith('**')) {
      out.push(<strong key={`${keyBase}-${i}`} className="font-semibold">{tok.slice(2, -2)}</strong>)
    } else {
      out.push(
        <code
          key={`${keyBase}-${i}`}
          className="px-1 py-0.5 rounded text-[11px] font-mono"
          style={{ background: 'var(--panel-bg)', border: '1px solid var(--panel-border)' }}
        >
          {tok.slice(1, -1)}
        </code>
      )
    }
    last = re.lastIndex
    i += 1
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

function Markdown({ text }: { text: string }) {
  const lines = text.split('\n').filter((l) => !ADD_TO_LINE_RE.test(l))
  const blocks: React.ReactNode[] = []
  let i = 0
  let key = 0
  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    if (trimmed === '') { i += 1; continue }

    // Heading: #, ##, ###
    const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed)
    if (heading) {
      const level = heading[1].length
      const cls = level === 1 ? 'text-sm font-semibold mt-2 mb-1'
                : level === 2 ? 'text-xs font-semibold mt-2 mb-1'
                : 'text-xs font-semibold mt-1.5 mb-0.5'
      blocks.push(<div key={key++} className={cls}>{renderInline(heading[2], `h${key}`)}</div>)
      i += 1
      continue
    }

    // Bullet list (- or *)
    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = []
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ''))
        i += 1
      }
      blocks.push(
        <ul key={key++} className="list-disc pl-4 space-y-0.5 my-1">
          {items.map((it, j) => <li key={j}>{renderInline(it, `li${key}-${j}`)}</li>)}
        </ul>
      )
      continue
    }

    // Numbered list
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ''))
        i += 1
      }
      blocks.push(
        <ol key={key++} className="list-decimal pl-4 space-y-0.5 my-1">
          {items.map((it, j) => <li key={j}>{renderInline(it, `oli${key}-${j}`)}</li>)}
        </ol>
      )
      continue
    }

    // Paragraph: collect contiguous non-empty, non-list, non-heading lines
    const para: string[] = [line]
    i += 1
    while (i < lines.length) {
      const t = lines[i].trim()
      if (t === '' || /^[-*]\s+/.test(t) || /^\d+\.\s+/.test(t) || /^#{1,3}\s+/.test(t)) break
      para.push(lines[i])
      i += 1
    }
    blocks.push(
      <p key={key++} className="my-1 first:mt-0 last:mb-0">
        {renderInline(para.join(' '), `p${key}`)}
      </p>
    )
  }

  return <div className="space-y-0">{blocks}</div>
}

/* ── Chat Apply chips ─────────────────────────────────────────────────────── */
// Parses the **Add to "Parent":** idea1, idea2 pattern the chat system prompt
// instructs the model to emit, and renders a one-click Apply chip per group.

interface ApplyGroup {
  parentLabel: string
  labels: string[]
  key: string
}

// Strip (uuid), (id: ...), surrounding quotes, bullet markers, and stray
// punctuation from a single suggested label so chips never show model noise.
const UUID_RE = /\(\s*(?:id:\s*)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\s*\)/gi

function cleanLabel(raw: string): string {
  return raw
    .replace(UUID_RE, '')
    .replace(/^[•*\-–—\s]+/, '')   // leading bullet / dash
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '') // wrapping quotes
    .replace(/\.\s*$/, '')         // trailing period
    .replace(/\s+/g, ' ')
    .trim()
}

function parseApplyGroups(content: string): ApplyGroup[] {
  const groups: ApplyGroup[] = []
  // [ \t]* so whitespace after the marker does NOT cross newlines — we only
  // want labels the model put on the same line as **Add to "X":**.
  const re = /\*\*Add to "([^"]+)":\*\*[ \t]*([^\n]+)/g
  let match: RegExpExecArray | null
  let idx = 0
  while ((match = re.exec(content)) !== null) {
    const parentLabel = match[1].trim()
    const labels = match[2]
      .split(/[,;]/)
      .map(cleanLabel)
      .filter((l) => l.length > 0 && l.length <= 80) // drop empty + long prose lines
    if (labels.length > 0) {
      groups.push({ parentLabel, labels, key: `${idx}-${parentLabel}` })
      idx += 1
    }
  }
  return groups
}

function ApplyChips({ content }: { content: string }) {
  const { addAINodes, nodes } = useMindMapStore()
  const [addedItems, setAddedItems] = useState<Set<string>>(new Set())

  const groups = useMemo(() => parseApplyGroups(content), [content])
  if (groups.length === 0) return null

  const itemKey = (g: ApplyGroup, i: number) => `${g.key}::${i}`

  // Case-insensitive label match; prefer exact, fall back to startsWith
  const findTarget = (parentLabel: string) =>
    nodes.find((n) => n.data.label.toLowerCase() === parentLabel.toLowerCase())
      ?? nodes.find((n) => n.data.label.toLowerCase().startsWith(parentLabel.toLowerCase()))

  const handleAddOne = (g: ApplyGroup, i: number) => {
    const target = findTarget(g.parentLabel)
    if (!target) return
    addAINodes(target.id, [g.labels[i]])
    setAddedItems((prev) => {
      const next = new Set(prev)
      next.add(itemKey(g, i))
      return next
    })
  }

  const handleAddAll = (g: ApplyGroup) => {
    const target = findTarget(g.parentLabel)
    if (!target) return
    const remaining: string[] = []
    const remainingIndices: number[] = []
    g.labels.forEach((label, i) => {
      if (!addedItems.has(itemKey(g, i))) {
        remaining.push(label)
        remainingIndices.push(i)
      }
    })
    if (remaining.length === 0) return
    addAINodes(target.id, remaining)
    setAddedItems((prev) => {
      const next = new Set(prev)
      remainingIndices.forEach((i) => next.add(itemKey(g, i)))
      return next
    })
  }

  return (
    <div className="flex flex-col gap-2 w-full">
      {groups.map((g) => {
        const allApplied = g.labels.every((_, i) => addedItems.has(itemKey(g, i)))
        return (
          <div
            key={g.key}
            className="rounded-lg border p-2"
            style={{
              background: 'var(--canvas-bg)',
              borderColor: 'var(--panel-border)',
            }}
          >
            <div className="flex items-center justify-between mb-1.5 gap-2">
              <span className="text-[10.5px] font-medium truncate" style={{ color: 'var(--text-muted)' }}>
                Add to &ldquo;{g.parentLabel}&rdquo;
              </span>
              <button
                onClick={() => !allApplied && handleAddAll(g)}
                disabled={allApplied}
                className="flex items-center gap-0.5 text-[10.5px] font-medium whitespace-nowrap disabled:opacity-30"
                style={{ color: 'var(--brand)' }}
              >
                <CheckCheck size={10} />
                {allApplied ? 'Done' : 'Add all'}
              </button>
            </div>
            <div className="flex flex-wrap gap-1">
              {g.labels.map((label, i) => {
                const isAdded = addedItems.has(itemKey(g, i))
                return (
                  <button
                    key={i}
                    onClick={() => !isAdded && handleAddOne(g, i)}
                    disabled={isAdded}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] border transition-colors disabled:cursor-default hover:border-indigo-400"
                    style={{
                      background: isAdded ? '#f0fdf4' : 'var(--panel-bg)',
                      borderColor: isAdded ? '#bbf7d0' : 'var(--panel-border)',
                      color: isAdded ? '#15803d' : 'var(--text-primary)',
                    }}
                  >
                    {isAdded
                      ? <Check size={9} style={{ color: '#22c55e' }} />
                      : <Plus size={9} style={{ color: 'var(--brand)' }} />}
                    <span>{label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
