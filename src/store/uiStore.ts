import { create } from 'zustand'
import { Theme, AIMessage, AIStatus, SearchResult, AINodeSuggestion } from '@/types'

export interface ExpandResult {
  nodeId: string
  nodeName: string
  userPrompt?: string
  suggestions: AINodeSuggestion[]
  added: number[]
}

interface UIStore {
  // Theme
  theme: Theme
  toggleTheme: () => void
  setTheme: (theme: Theme) => void

  // Panels
  leftPanelOpen: boolean
  rightPanelOpen: boolean
  toggleLeftPanel: () => void
  toggleRightPanel: () => void

  // Selected nodes
  selectedNodeIds: string[]
  setSelectedNodes: (ids: string[]) => void
  clearSelection: () => void

  // Selected edges
  selectedEdgeIds: string[]
  setSelectedEdges: (ids: string[]) => void

  // Focus mode
  focusMode: boolean
  toggleFocusMode: () => void

  // Search
  searchOpen: boolean
  searchQuery: string
  searchResults: SearchResult[]
  toggleSearch: () => void
  setSearchQuery: (query: string) => void
  setSearchResults: (results: SearchResult[]) => void

  // Node context menu / inspector
  inspectorNodeId: string | null
  setInspectorNode: (id: string | null) => void

  // Drag-to-reparent: id of the node currently hovered while dragging another node
  dropTargetId: string | null
  setDropTargetId: (id: string | null) => void

  // AI panel state
  aiMessages: AIMessage[]
  aiStatus: AIStatus
  aiError: string | null
  addAIMessage: (message: AIMessage) => void
  updateLastAIMessage: (content: string) => void
  setAIStatus: (status: AIStatus) => void
  setAIError: (error: string | null) => void
  clearAIMessages: () => void

  // Expand-node suggestion result (shared between NodeAIPopover and RightSidebar)
  expandResult: ExpandResult | null
  setExpandResult: (result: ExpandResult | null) => void
  appendExpandSuggestions: (suggestions: AINodeSuggestion[]) => void
  markExpandSuggestionAdded: (index: number) => void
  markAllExpandSuggestionsAdded: () => void

  // Minimap
  minimapVisible: boolean
  toggleMinimap: () => void

  // Presentation mode
  presentationMode: boolean
  presentationIndex: number
  presentationOrder: string[]
  enterPresentationMode: (order: string[]) => void
  exitPresentationMode: () => void
  presentationNext: () => void
  presentationPrev: () => void
}

export const useUIStore = create<UIStore>((set, get) => ({
  theme: 'light',
  toggleTheme: () => set((s) => {
    const next: Theme = s.theme === 'light' ? 'dark' : 'light'
    document.documentElement.classList.toggle('dark', next === 'dark')
    return { theme: next }
  }),
  setTheme: (theme) => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    set({ theme })
  },

  leftPanelOpen: false,
  rightPanelOpen: false,
  toggleLeftPanel: () => set((s) => ({ leftPanelOpen: !s.leftPanelOpen })),
  toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),

  selectedNodeIds: [],
  setSelectedNodes: (ids) => set({ selectedNodeIds: ids }),
  clearSelection: () => set({ selectedNodeIds: [], selectedEdgeIds: [] }),

  selectedEdgeIds: [],
  setSelectedEdges: (ids) => set({ selectedEdgeIds: ids }),

  focusMode: false,
  toggleFocusMode: () => set((s) => ({ focusMode: !s.focusMode })),

  searchOpen: false,
  searchQuery: '',
  searchResults: [],
  toggleSearch: () => set((s) => ({ searchOpen: !s.searchOpen, searchQuery: '' })),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setSearchResults: (results) => set({ searchResults: results }),

  inspectorNodeId: null,
  setInspectorNode: (id) => set({ inspectorNodeId: id }),

  dropTargetId: null,
  setDropTargetId: (id) => set({ dropTargetId: id }),

  aiMessages: [],
  aiStatus: 'idle',
  aiError: null,
  addAIMessage: (message) => set((s) => ({ aiMessages: [...s.aiMessages, message] })),
  updateLastAIMessage: (content) => set((s) => {
    const msgs = [...s.aiMessages]
    if (msgs.length > 0) msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content }
    return { aiMessages: msgs }
  }),
  setAIStatus: (status) => set({ aiStatus: status }),
  setAIError: (error) => set({ aiError: error }),
  clearAIMessages: () => set({ aiMessages: [], aiError: null }),

  expandResult: null,
  setExpandResult: (result) => set({ expandResult: result }),
  appendExpandSuggestions: (suggestions) => set((s) => {
    if (!s.expandResult) return {}
    return {
      expandResult: {
        ...s.expandResult,
        suggestions: [...s.expandResult.suggestions, ...suggestions],
      },
    }
  }),
  markExpandSuggestionAdded: (index) => set((s) => {
    if (!s.expandResult) return {}
    if (s.expandResult.added.includes(index)) return {}
    return { expandResult: { ...s.expandResult, added: [...s.expandResult.added, index] } }
  }),
  markAllExpandSuggestionsAdded: () => set((s) => {
    if (!s.expandResult) return {}
    return {
      expandResult: {
        ...s.expandResult,
        added: s.expandResult.suggestions.map((_, i) => i),
      },
    }
  }),

  minimapVisible: true,
  toggleMinimap: () => set((s) => ({ minimapVisible: !s.minimapVisible })),

  presentationMode: false,
  presentationIndex: 0,
  presentationOrder: [],
  enterPresentationMode: (order) => set({ presentationMode: true, presentationOrder: order, presentationIndex: 0 }),
  exitPresentationMode: () => set({ presentationMode: false, presentationOrder: [], presentationIndex: 0 }),
  presentationNext: () => set((s) => ({
    presentationIndex: Math.min(s.presentationIndex + 1, s.presentationOrder.length - 1),
  })),
  presentationPrev: () => set((s) => ({
    presentationIndex: Math.max(s.presentationIndex - 1, 0),
  })),
}))
