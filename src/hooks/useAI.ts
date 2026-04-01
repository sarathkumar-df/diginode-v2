import { useCallback, useRef } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useMindMapStore } from '@/store/mindmapStore'
import { useUIStore } from '@/store/uiStore'
import {
  expandNode,
  summarizeMap,
  chatWithMap,
  findConnections,
  generateMapFromTopic,
  writeFromMap,
} from '@/services/aiService'
import { AIMessage, AINodeSuggestion } from '@/types'

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
  } = useUIStore()

  const abortRef = useRef<AbortController | null>(null)

  const cancelCurrent = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
  }, [])

  const ensurePanelOpen = useCallback(() => {
    if (!rightPanelOpen) toggleRightPanel()
  }, [rightPanelOpen, toggleRightPanel])

  // ── Fetch expand suggestions (returns list, does NOT add nodes) ───────────

  const fetchExpandSuggestions = useCallback(async (): Promise<{
    nodeId: string
    nodeName: string
    suggestions: AINodeSuggestion[]
  } | null> => {
    const nodeId = selectedNodeIds[0]
    if (!nodeId) return null

    const map = useMindMapStore.getState()
    const node = map.nodes.find((n) => n.id === nodeId)
    if (!node) return null

    setAIStatus('loading')
    setAIError(null)
    ensurePanelOpen()

    try {
      const suggestions = await expandNode(node.data.label, exportMap())
      setAIStatus('idle')
      return { nodeId, nodeName: node.data.label, suggestions }
    } catch (err: any) {
      setAIStatus('error')
      setAIError(err.message)
      return null
    }
  }, [selectedNodeIds, exportMap, setAIStatus, setAIError, ensurePanelOpen])

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

  return {
    fetchExpandSuggestions,
    addSuggestionNode,
    addAllSuggestions,
    summarize,
    sendChatMessage,
    discoverConnections,
    writeDocument,
    cancelCurrent,
  }
}
