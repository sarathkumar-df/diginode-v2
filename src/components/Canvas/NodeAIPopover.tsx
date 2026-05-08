import { useCallback, useEffect, useRef, useState } from 'react'
import { NodeToolbar, Position } from 'reactflow'
import { Sparkles, Send, Loader2 } from 'lucide-react'
import { useUIStore } from '@/store/uiStore'
import { useMindMapStore } from '@/store/mindmapStore'
import { useAI } from '@/hooks/useAI'

const POPOVER_INPUT_ID = 'node-ai-popover-input'

export function NodeAIPopover() {
  const { aiPopoverNodeId, setAIPopoverNode, aiStatus } = useUIStore()
  const { fetchExpandSuggestions } = useAI()

  const [prompt, setPrompt] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const nodeId = aiPopoverNodeId
  const node = useMindMapStore((s) => (nodeId ? s.nodes.find((n) => n.id === nodeId) : undefined))

  // Reset the input + auto-focus it whenever a different node opens the popover.
  useEffect(() => {
    setPrompt('')
    if (nodeId) {
      // Defer one tick so NodeToolbar has rendered before we focus.
      const id = setTimeout(() => inputRef.current?.focus(), 0)
      return () => clearTimeout(id)
    }
  }, [nodeId])

  // Auto-grow the textarea to fit its content (capped so the popover doesn't
  // overflow the canvas).
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }, [prompt, nodeId])

  // Listen for a global "focus the popover input" request (Cmd/Ctrl+K)
  useEffect(() => {
    const handler = () => inputRef.current?.focus()
    window.addEventListener('digo:focus-ai-popover', handler)
    return () => window.removeEventListener('digo:focus-ai-popover', handler)
  }, [])

  const isBusy = aiStatus === 'loading' || aiStatus === 'streaming'

  const handleQuickExpand = useCallback(() => {
    if (!nodeId || isBusy) return
    fetchExpandSuggestions(nodeId)
  }, [nodeId, isBusy, fetchExpandSuggestions])

  const handleSubmitPrompt = useCallback(() => {
    if (!nodeId || isBusy) return
    const trimmed = prompt.trim()
    if (!trimmed) return
    fetchExpandSuggestions(nodeId, trimmed)
  }, [nodeId, isBusy, prompt, fetchExpandSuggestions])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmitPrompt()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      // Close the popover entirely on Escape (matches the new "explicit open"
      // model — pressing Escape should dismiss the AI UI, not just blur the input).
      setAIPopoverNode(null)
    }
    // Prevent canvas shortcuts (Tab adds child, etc.) from firing while typing
    e.stopPropagation()
  }, [handleSubmitPrompt, setAIPopoverNode])

  // Render only when the user has explicitly opened the popover via the
  // hover-revealed sparkle button on the node. Selection/edit state alone
  // never triggers it.
  if (!nodeId || !node) return null

  return (
    <NodeToolbar
      nodeId={nodeId}
      isVisible
      position={Position.Right}
      offset={12}
      className="flex items-center gap-1.5 px-1.5 py-1.5 rounded-xl border shadow-lg"
      style={{
        background: 'var(--panel-bg)',
        borderColor: 'var(--panel-border)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.10)',
      }}
    >
      <button
        onClick={handleQuickExpand}
        disabled={isBusy}
        title="Expand with AI"
        className="h-7 pl-2 pr-2.5 rounded-lg flex items-center gap-1 text-white text-xs font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
        style={{ background: 'var(--brand)' }}
      >
        {isBusy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
        <span>Generate ideas</span>
      </button>

      <textarea
        id={POPOVER_INPUT_ID}
        data-ai-popover-input
        ref={inputRef}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask AI about this node…"
        disabled={isBusy}
        rows={1}
        className="w-56 px-2.5 py-1.5 rounded-lg text-xs outline-none border bg-transparent resize-none leading-relaxed overflow-y-auto"
        style={{
          borderColor: 'var(--panel-border)',
          color: 'var(--text-primary)',
        }}
      />

      <button
        onClick={handleSubmitPrompt}
        disabled={isBusy || !prompt.trim()}
        title="Send to AI (Enter)"
        className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors disabled:opacity-30"
        style={{
          color: prompt.trim() ? 'var(--brand)' : 'var(--text-muted)',
        }}
      >
        <Send size={13} />
      </button>
    </NodeToolbar>
  )
}
