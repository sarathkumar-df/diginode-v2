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

// ─── Map Metadata (list view — no nodes/edges) ───────────────────────────────

export interface MapMeta {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  rootColor?: string     // root node color, returned by GET /api/maps
  thumbnail?: string | null  // JPEG data URL, captured on save
}

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

// ─── Teams ───────────────────────────────────────────────────────────────────

export interface TeamMember {
  id: string
  name: string
  email: string
  role: 'owner' | 'member'
  joinedAt: string
}

export interface Team {
  id: string
  name: string
  ownerId: string
  role: 'owner' | 'member'
  memberCount: number
  createdAt: string
}

export interface TeamDetail extends Team {
  myRole: 'owner' | 'member'
  members: TeamMember[]
}

export interface InviteInfo {
  token: string
  teamId: string
  teamName: string
  memberCount: number
  expiresAt: string
}

// ─── Map Sharing ─────────────────────────────────────────────────────────────

export type MapPermission = 'view' | 'edit'

export interface MapShare {
  teamId: string
  teamName: string
  permission: MapPermission
  sharedAt: string
}

export interface SharedMapMeta extends MapMeta {
  permission: MapPermission
  ownerName: string
}

// ─── Version History ─────────────────────────────────────────────────────────

export interface MapVersion {
  id: string
  mapId: string
  nodeCount: number
  edgeCount: number
  createdAt: string
}

export interface MapVersionData extends MapVersion {
  nodes: MindMapNode[]
  edges: MindMapEdge[]
}

// ─── Flow Diagram ───────────────────────────────────────────────────────────

export type FlowNodeType = 'process' | 'decision' | 'label' | 'group' | 'bulletList' | 'swimlane'

export type FlowTagPreset = 'risk' | 'improvement' | 'dependency' | 'custom'

export interface FlowTag {
  id: string
  label: string
  color: string
  preset: FlowTagPreset
}

export interface FlowNodeData {
  label: string
  subtitle?: string
  color?: string
  type: FlowNodeType
  items?: string[]         // bullet list items
  childNodeIds?: string[]  // group: ids of nodes contained in this group
  layerIndex?: number      // swimlane: which layer row this represents
  tags?: FlowTag[]         // colored tag badges on the node
  notes?: string           // freeform note attached to the node
}

export type FlowNode = Node<FlowNodeData>
export type FlowEdge = Edge<{
  label?: string
  color?: string
  edgeStyle?: 'solid' | 'dashed' | 'dependency'
  bidirectional?: boolean
}>

export interface FlowMeta {
  id: string
  mapId: string
  title: string
  parentFlowId: string | null
  createdAt: string
  updatedAt: string
}

export interface FullFlow extends FlowMeta {
  nodes: FlowNode[]
  edges: FlowEdge[]
}

// ─── UI State ────────────────────────────────────────────────────────────────

export type Theme = 'light' | 'dark'
export type PanelSide = 'left' | 'right'

export interface SearchResult {
  nodeId: string
  label: string
  matchIndex: number
}
