import { Node, Edge } from 'reactflow'

// ─── Node Colors ────────────────────────────────────────────────────────────

export type NodeColor =
  | '#FF6B6B'  // coral
  | '#FF9F43'  // orange
  | '#FECA57'  // yellow
  | '#1DD1A1'  // teal
  | '#54A0FF'  // blue
  | '#5F27CD'  // purple
  | '#FF9FF3'  // pink
  | '#48DBFB'  // cyan

export const NODE_COLORS: NodeColor[] = [
  '#FF6B6B', '#FF9F43', '#FECA57', '#1DD1A1',
  '#54A0FF', '#5F27CD', '#FF9FF3', '#48DBFB',
]

export type NodeShape = 'rounded' | 'rectangle' | 'ellipse' | 'pill'

// ─── Mind Map Node ───────────────────────────────────────────────────────────

export interface MindMapNodeData {
  label: string
  color: string
  icon?: string
  shape: NodeShape
  checked?: boolean
  collapsed?: boolean
  notes?: string
  level: number
  isEditing?: boolean
  userMoved?: boolean
}

export type MindMapNode = Node<MindMapNodeData>
export type MindMapEdge = Edge<{ color?: string }>

// ─── Mind Map Document ───────────────────────────────────────────────────────

export interface MindMap {
  id: string
  title: string
  nodes: MindMapNode[]
  edges: MindMapEdge[]
  createdAt: string
  updatedAt: string
  theme: 'light' | 'dark'
}

// ─── History (Undo/Redo) ─────────────────────────────────────────────────────

export interface HistoryEntry {
  nodes: MindMapNode[]
  edges: MindMapEdge[]
  timestamp: number
}

// ─── AI Types ────────────────────────────────────────────────────────────────

export type AIFeature =
  | 'generate-map'
  | 'expand-node'
  | 'summarize'
  | 'brainstorm'
  | 'find-connections'
  | 'write-from-map'

export interface AIMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  feature?: AIFeature
}

export interface AINodeSuggestion {
  label: string
  icon?: string
  color?: string
  children?: AINodeSuggestion[]
}

export interface AIConnectionSuggestion {
  sourceId: string
  targetId: string
  reason: string
}

export interface AIGeneratedMap {
  title: string
  nodes: AINodeSuggestion[]
}

export type AIStatus = 'idle' | 'loading' | 'streaming' | 'error'

// ─── Export Types ────────────────────────────────────────────────────────────

export interface MindMapExport {
  title: string
  nodes: Array<{
    id: string
    label: string
    level: number
    children: string[]
    color: string
    checked?: boolean
  }>
  edges: Array<{ source: string; target: string }>
}

// ─── UI State ────────────────────────────────────────────────────────────────

export type Theme = 'light' | 'dark'
export type PanelSide = 'left' | 'right'

export interface SearchResult {
  nodeId: string
  label: string
  matchIndex: number
}
