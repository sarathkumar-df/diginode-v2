import { create } from 'zustand'
import {
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  NodeChange,
  EdgeChange,
  Connection,
} from 'reactflow'
import { FlowMeta, FlowNode, FlowEdge, FlowTag } from '@/types'

const MAX_HISTORY = 50

interface HistoryEntry {
  nodes: FlowNode[]
  edges: FlowEdge[]
}

interface FlowStore {
  // Flow list for the current map
  flows: FlowMeta[]
  setFlows: (flows: FlowMeta[]) => void
  addFlowToList: (flow: FlowMeta) => void
  removeFlowFromList: (flowId: string) => void
  updateFlowTitle: (flowId: string, title: string) => void

  // Active flow data
  activeFlowId: string | null
  activeMapId: string | null
  nodes: FlowNode[]
  edges: FlowEdge[]

  loadFlow: (data: { mapId: string; flowId: string; nodes: FlowNode[]; edges: FlowEdge[] }) => void
  clearFlow: () => void

  // History (undo/redo)
  history: HistoryEntry[]
  historyIndex: number
  pushHistory: () => void
  undo: () => void
  redo: () => void

  // React Flow change handlers
  onNodesChange: (changes: NodeChange[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onConnect: (connection: Connection) => void

  // Node/edge manipulation
  updateNodeLabel: (nodeId: string, label: string) => void
  updateNodeData: (nodeId: string, data: Partial<FlowNode['data']>) => void
  addNode: (node: FlowNode) => void
  deleteNode: (nodeId: string) => void
  addEdgeManual: (edge: FlowEdge) => void

  // Tags
  addTag: (nodeId: string, tag: FlowTag) => void
  updateTag: (nodeId: string, tagId: string, updates: Partial<FlowTag>) => void
  removeTag: (nodeId: string, tagId: string) => void

  // Notes
  setNodeNote: (nodeId: string, notes: string) => void
}

export const useFlowStore = create<FlowStore>((set, get) => ({
  flows: [],
  setFlows: (flows) => set({ flows }),
  addFlowToList: (flow) => set((s) => ({ flows: [flow, ...s.flows] })),
  removeFlowFromList: (flowId) => set((s) => ({ flows: s.flows.filter((f) => f.id !== flowId) })),
  updateFlowTitle: (flowId, title) =>
    set((s) => ({
      flows: s.flows.map((f) => (f.id === flowId ? { ...f, title } : f)),
    })),

  activeFlowId: null,
  activeMapId: null,
  nodes: [],
  edges: [],
  history: [],
  historyIndex: -1,

  loadFlow: ({ mapId, flowId, nodes, edges }) =>
    set({
      activeMapId: mapId, activeFlowId: flowId, nodes, edges,
      history: [{ nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) }],
      historyIndex: 0,
    }),

  clearFlow: () => set({ activeFlowId: null, activeMapId: null, nodes: [], edges: [], history: [], historyIndex: -1 }),

  pushHistory: () => {
    const { nodes, edges, history, historyIndex } = get()
    const entry: HistoryEntry = {
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges)),
    }
    const newHistory = history.slice(0, historyIndex + 1)
    newHistory.push(entry)
    if (newHistory.length > MAX_HISTORY) newHistory.shift()
    set({ history: newHistory, historyIndex: newHistory.length - 1 })
  },

  undo: () => {
    const { history, historyIndex } = get()
    if (historyIndex <= 0) return
    const entry = history[historyIndex - 1]
    set({
      nodes: JSON.parse(JSON.stringify(entry.nodes)),
      edges: JSON.parse(JSON.stringify(entry.edges)),
      historyIndex: historyIndex - 1,
    })
  },

  redo: () => {
    const { history, historyIndex } = get()
    if (historyIndex >= history.length - 1) return
    const entry = history[historyIndex + 1]
    set({
      nodes: JSON.parse(JSON.stringify(entry.nodes)),
      edges: JSON.parse(JSON.stringify(entry.edges)),
      historyIndex: historyIndex + 1,
    })
  },

  onNodesChange: (changes) => {
    const hasRemove = changes.some((c) => c.type === 'remove')
    if (hasRemove) get().pushHistory()
    set((s) => ({ nodes: applyNodeChanges(changes, s.nodes) as FlowNode[] }))
  },

  onEdgesChange: (changes) => {
    const hasRemove = changes.some((c) => c.type === 'remove')
    if (hasRemove) get().pushHistory()
    set((s) => ({ edges: applyEdgeChanges(changes, s.edges) as FlowEdge[] }))
  },

  onConnect: (connection) => {
    get().pushHistory()
    set((s) => ({ edges: addEdge(connection, s.edges) as FlowEdge[] }))
  },

  updateNodeLabel: (nodeId, label) => {
    get().pushHistory()
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, label } } : n
      ),
    }))
  },

  updateNodeData: (nodeId, data) => {
    get().pushHistory()
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n
      ),
    }))
  },

  addNode: (node) => {
    get().pushHistory()
    set((s) => ({ nodes: [...s.nodes, node] }))
  },

  deleteNode: (nodeId) => {
    get().pushHistory()
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== nodeId),
      edges: s.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
    }))
  },

  addEdgeManual: (edge) => {
    get().pushHistory()
    set((s) => ({ edges: [...s.edges, edge] }))
  },

  // Tags
  addTag: (nodeId, tag) => {
    get().pushHistory()
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, tags: [...(n.data.tags || []), tag] } }
          : n
      ),
    }))
  },

  updateTag: (nodeId, tagId, updates) => {
    get().pushHistory()
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === nodeId
          ? {
              ...n,
              data: {
                ...n.data,
                tags: (n.data.tags || []).map((t) =>
                  t.id === tagId ? { ...t, ...updates } : t
                ),
              },
            }
          : n
      ),
    }))
  },

  removeTag: (nodeId, tagId) => {
    get().pushHistory()
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, tags: (n.data.tags || []).filter((t) => t.id !== tagId) } }
          : n
      ),
    }))
  },

  // Notes
  setNodeNote: (nodeId, notes) => {
    get().pushHistory()
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, notes } } : n
      ),
    }))
  },
}))
