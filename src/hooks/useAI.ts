import { useCallback, useRef } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useMindMapStore } from '@/store/mindmapStore'
import { useUIStore } from '@/store/uiStore'
import {
  expandNode,
  expandNodeWithPrompt,
  summarizeMap,
  chatWithMap,
  findConnections,
  generateMapFromTopic,
  writeFromMap,
  challengeMap,
  prioritizeMap,
  findGaps,
  compressBranch,
  debateMap,
  ExpandStyle,
} from '@/services/aiService'
import { AIMessage, AIFeature, AINodeSuggestion, MapAdvisor, MindMapExport } from '@/types'

export type RefineMode = 'more' | 'concrete' | 'ambitious' | 'regenerate'

export type AnalysisMode = 'challenge' | 'prioritize' | 'find-gaps' | 'compress'

// Runners that a primitive accepts. Each variant matches a shape of the
// streaming service functions so runAnalysis below can dispatch uniformly.
type AnalysisRunner =
  | {
      kind: 'map-wide'
      fn: (ctx: MindMapExport, onChunk: (t: string) => void, signal: AbortSignal, sel?: string) => Promise<void>
    }
  | {
      kind: 'node-scoped'
      fn: (
        nodeLabel: string,
        ctx: MindMapExport,
        onChunk: (t: string) => void,
        signal: AbortSignal,
        advisor?: MapAdvisor | null,
      ) => Promise<void>
    }

export function useAI() {
  const { exportMap, addAINodes, addAIEdges } = useMindMapStore()
  const {
    selectedNodeIds,
    addAIMessage,
    updateLastAIMessage,
    setAIStatus,
    setAIError,
    aiMessages,
    rightPanelOpen,
    toggleRightPanel,
    setExpandResult,
    appendExpandSuggestions,
  } = useUIStore()

  const abortRef = useRef<AbortController | null>(null)

  const cancelCurrent = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
  }, [])

  const ensurePanelOpen = useCallback(() => {
    if (!rightPanelOpen) toggleRightPanel()
  }, [rightPanelOpen, toggleRightPanel])

  // ── Fetch expand suggestions (publishes result to store) ──────────────────

  const fetchExpandSuggestions = useCallback(async (
    nodeIdOverride?: string,
    userPrompt?: string,
  ): Promise<boolean> => {
    const nodeId = nodeIdOverride ?? selectedNodeIds[0]
    if (!nodeId) return false

    const map = useMindMapStore.getState()
    const node = map.nodes.find((n) => n.id === nodeId)
    if (!node) return false

    setAIStatus('loading')
    setAIError(null)
    ensurePanelOpen()
    setExpandResult(null)

    try {
      const nodeAdvisor = node.data.advisor
      const suggestions = userPrompt?.trim()
        ? await expandNodeWithPrompt(node.data.label, userPrompt.trim(), exportMap(), { advisor: nodeAdvisor })
        : await expandNode(node.data.label, exportMap(), { advisor: nodeAdvisor })
      setAIStatus('idle')
      if (suggestions.length > 0) {
        setExpandResult({
          nodeId,
          nodeName: node.data.label,
          userPrompt: userPrompt?.trim() || undefined,
          suggestions,
          added: [],
        })
      }
      return true
    } catch (err: any) {
      setAIStatus('error')
      setAIError(err.message)
      return false
    }
  }, [selectedNodeIds, exportMap, setAIStatus, setAIError, ensurePanelOpen, setExpandResult])

  // ── Refine the current expand result (more / concrete / ambitious / regenerate) ──

  const refineExpandSuggestions = useCallback(async (mode: RefineMode): Promise<boolean> => {
    const current = useUIStore.getState().expandResult
    if (!current) return false

    setAIStatus('loading')
    setAIError(null)

    const excludeLabels = current.suggestions.map((s) => s.label)
    const style: ExpandStyle | undefined =
      mode === 'concrete' ? 'concrete' :
      mode === 'ambitious' ? 'ambitious' :
      undefined

    try {
      // Refines target the same node as the original expand call, so look up
      // the override here instead of remembering it across the chain.
      const refineNode = useMindMapStore.getState().nodes.find((n) => n.id === current.nodeId)
      const refineAdvisor = refineNode?.data.advisor
      const suggestions = current.userPrompt
        ? await expandNodeWithPrompt(current.nodeName, current.userPrompt, exportMap(), { style, excludeLabels, advisor: refineAdvisor })
        : await expandNode(current.nodeName, exportMap(), { style, excludeLabels, advisor: refineAdvisor })
      setAIStatus('idle')
      if (suggestions.length === 0) return true

      if (mode === 'more') {
        // Append new ideas to the current list; existing added indices stay valid
        appendExpandSuggestions(suggestions)
      } else {
        // Replace — style changed or user asked to regenerate
        setExpandResult({
          nodeId: current.nodeId,
          nodeName: current.nodeName,
          userPrompt: current.userPrompt,
          suggestions,
          added: [],
        })
      }
      return true
    } catch (err: any) {
      setAIStatus('error')
      setAIError(err.message)
      return false
    }
  }, [exportMap, setAIStatus, setAIError, setExpandResult, appendExpandSuggestions])

  // ── Add a single suggestion node ──────────────────────────────────────────

  const addSuggestionNode = useCallback((nodeId: string, suggestion: AINodeSuggestion) => {
    addAINodes(nodeId, [suggestion.label])
  }, [addAINodes])

  // ── Add all suggestions at once ───────────────────────────────────────────

  const addAllSuggestions = useCallback((nodeId: string, suggestions: AINodeSuggestion[]) => {
    addAINodes(nodeId, suggestions.map((s) => s.label))
  }, [addAINodes])

  // ── Summarize map ──────────────────────────────────────────────────────────

  const summarize = useCallback(async () => {
    setAIStatus('streaming')
    setAIError(null)
    ensurePanelOpen()

    const placeholderMsg: AIMessage = {
      id: uuidv4(),
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      feature: 'summarize',
    }
    addAIMessage(placeholderMsg)

    abortRef.current = new AbortController()

    try {
      await summarizeMap(exportMap(), (chunk) => {
        updateLastAIMessage(
          (useUIStore.getState().aiMessages.at(-1)?.content ?? '') + chunk
        )
      }, abortRef.current.signal)
      setAIStatus('idle')
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setAIStatus('error')
        setAIError(err.message)
      } else {
        setAIStatus('idle')
      }
    }
  }, [exportMap, addAIMessage, updateLastAIMessage, setAIStatus, setAIError, ensurePanelOpen])

  // ── Chat ───────────────────────────────────────────────────────────────────

  const sendChatMessage = useCallback(async (userText: string) => {
    if (!userText.trim()) return

    const userMsg: AIMessage = {
      id: uuidv4(),
      role: 'user',
      content: userText,
      timestamp: new Date().toISOString(),
    }
    addAIMessage(userMsg)

    const assistantMsg: AIMessage = {
      id: uuidv4(),
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      feature: 'brainstorm',
    }
    addAIMessage(assistantMsg)

    setAIStatus('streaming')
    setAIError(null)
    abortRef.current = new AbortController()

    const history = useUIStore.getState().aiMessages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(-10)
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))

    const selectedId = useUIStore.getState().selectedNodeIds[0]
    const selectedNodeLabel = selectedId
      ? useMindMapStore.getState().nodes.find((n) => n.id === selectedId)?.data.label
      : undefined

    try {
      await chatWithMap(
        userText,
        exportMap(),
        history,
        (chunk) => {
          updateLastAIMessage(
            (useUIStore.getState().aiMessages.at(-1)?.content ?? '') + chunk
          )
        },
        abortRef.current.signal,
        selectedNodeLabel,
      )
      setAIStatus('idle')
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setAIStatus('error')
        setAIError(err.message)
      } else {
        setAIStatus('idle')
      }
    }
  }, [exportMap, addAIMessage, updateLastAIMessage, setAIStatus, setAIError])

  // ── Find connections ───────────────────────────────────────────────────────

  const discoverConnections = useCallback(async () => {
    setAIStatus('loading')
    setAIError(null)
    ensurePanelOpen()

    try {
      const connections = await findConnections(exportMap())
      if (connections.length > 0) {
        addAIEdges(connections.map((c) => ({ source: c.sourceId, target: c.targetId })))

        const msg: AIMessage = {
          id: uuidv4(),
          role: 'assistant',
          content: `Found ${connections.length} hidden connections:\n${connections.map((c) => `• ${c.reason}`).join('\n')}`,
          timestamp: new Date().toISOString(),
          feature: 'find-connections',
        }
        addAIMessage(msg)
      }
      setAIStatus('idle')
    } catch (err: any) {
      setAIStatus('error')
      setAIError(err.message)
    }
  }, [exportMap, addAIEdges, addAIMessage, setAIStatus, setAIError, ensurePanelOpen])

  // ── Brainstorming primitives (challenge / prioritize / find-gaps / compress) ──

  const runAnalysis = useCallback(async (mode: AnalysisMode): Promise<void> => {
    const selectedId = useUIStore.getState().selectedNodeIds[0]
    const map = useMindMapStore.getState()
    const selectedNode = selectedId ? map.nodes.find((n) => n.id === selectedId) : undefined
    const selectedLabel = selectedNode?.data.label

    // Primitives that require a selected node
    if ((mode === 'find-gaps' || mode === 'compress') && !selectedLabel) {
      setAIError('Select a node first')
      setAIStatus('error')
      return
    }

    const runners: Record<AnalysisMode, AnalysisRunner> = {
      challenge: { kind: 'map-wide', fn: challengeMap },
      prioritize: { kind: 'map-wide', fn: prioritizeMap },
      'find-gaps': { kind: 'node-scoped', fn: findGaps },
      compress: { kind: 'node-scoped', fn: compressBranch },
    }

    setAIStatus('streaming')
    setAIError(null)
    ensurePanelOpen()

    const placeholderMsg: AIMessage = {
      id: uuidv4(),
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      feature: mode as AIFeature,
    }
    addAIMessage(placeholderMsg)

    abortRef.current = new AbortController()
    const onChunk = (chunk: string) => {
      updateLastAIMessage(
        (useUIStore.getState().aiMessages.at(-1)?.content ?? '') + chunk
      )
    }

    try {
      const runner = runners[mode]
      if (runner.kind === 'map-wide') {
        await runner.fn(exportMap(), onChunk, abortRef.current.signal, selectedLabel)
      } else {
        // Node-scoped primitives (find-gaps, compress) honor the per-node
        // advisor override when set; otherwise the map-level advisor applies.
        const nodeAdvisor = selectedNode?.data.advisor
        await runner.fn(selectedLabel!, exportMap(), onChunk, abortRef.current.signal, nodeAdvisor)
      }
      setAIStatus('idle')
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setAIStatus('error')
        setAIError(err.message)
      } else {
        setAIStatus('idle')
      }
    }
  }, [exportMap, addAIMessage, updateLastAIMessage, setAIStatus, setAIError, ensurePanelOpen])

  // ── Write from map ─────────────────────────────────────────────────────────

  const writeDocument = useCallback(async (format: 'essay' | 'outline' | 'bullets') => {
    setAIStatus('streaming')
    setAIError(null)
    ensurePanelOpen()

    const placeholderMsg: AIMessage = {
      id: uuidv4(),
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      feature: 'write-from-map',
    }
    addAIMessage(placeholderMsg)

    abortRef.current = new AbortController()

    try {
      await writeFromMap(
        exportMap(),
        format,
        (chunk) => {
          updateLastAIMessage(
            (useUIStore.getState().aiMessages.at(-1)?.content ?? '') + chunk
          )
        },
        abortRef.current.signal
      )
      setAIStatus('idle')
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setAIStatus('error')
        setAIError(err.message)
      } else {
        setAIStatus('idle')
      }
    }
  }, [exportMap, addAIMessage, updateLastAIMessage, setAIStatus, setAIError, ensurePanelOpen])

  // ── Multi-advisor debate ───────────────────────────────────────────────────

  const runDebate = useCallback(async (question: string, advisors: MapAdvisor[]) => {
    if (!question.trim() || advisors.length === 0) return

    const userMsg: AIMessage = {
      id: uuidv4(),
      role: 'user',
      content: question.trim(),
      timestamp: new Date().toISOString(),
    }
    addAIMessage(userMsg)

    const placeholderMsg: AIMessage = {
      id: uuidv4(),
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      feature: 'brainstorm',
    }
    addAIMessage(placeholderMsg)

    setAIStatus('streaming')
    setAIError(null)
    ensurePanelOpen()
    abortRef.current = new AbortController()

    const selectedId = useUIStore.getState().selectedNodeIds[0]
    const selectedNodeLabel = selectedId
      ? useMindMapStore.getState().nodes.find((n) => n.id === selectedId)?.data.label
      : undefined

    try {
      await debateMap(
        question.trim(),
        advisors,
        exportMap(),
        (chunk) => {
          updateLastAIMessage(
            (useUIStore.getState().aiMessages.at(-1)?.content ?? '') + chunk
          )
        },
        abortRef.current.signal,
        selectedNodeLabel,
      )
      setAIStatus('idle')
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setAIStatus('error')
        setAIError(err.message)
      } else {
        setAIStatus('idle')
      }
    }
  }, [exportMap, addAIMessage, updateLastAIMessage, setAIStatus, setAIError, ensurePanelOpen])

  return {
    fetchExpandSuggestions,
    refineExpandSuggestions,
    addSuggestionNode,
    addAllSuggestions,
    summarize,
    sendChatMessage,
    discoverConnections,
    writeDocument,
    runAnalysis,
    runDebate,
    cancelCurrent,
  }
}
