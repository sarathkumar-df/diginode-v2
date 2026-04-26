import { create } from 'zustand'
import {
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  NodeChange,
  EdgeChange,
  Connection,
} from 'reactflow'
import { v4 as uuidv4 } from 'uuid'
import {
  MapMeta,
  MindMapNode,
  MindMapEdge,
  MindMapNodeData,
  HistoryEntry,
  NodeColor,
  NodeShape,
  MindMapExport,
} from '@/types'
import { useSettingsStore } from '@/store/settingsStore'

const DEFAULT_ROOT_COLOR = '#6366f1'
const MAX_HISTORY = 50

// Distinct, accessible colors used to differentiate top-level branches off the root.
// Sub-branches inherit their parent's color so each major branch stays visually unified.
export const BRANCH_PALETTE = [
  '#6366f1', // indigo
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#8b5cf6', // violet
  '#ef4444', // red
  '#84cc16', // lime
]

// Pick the next unused branch color among the parent's existing children.
// Cycles through the palette once all distinct colors are taken.
export function pickBranchColor(siblingColors: string[]): string {
  const used = new Set(siblingColors)
  for (const c of BRANCH_PALETTE) {
    if (!used.has(c)) return c
  }
  return BRANCH_PALETTE[siblingColors.length % BRANCH_PALETTE.length]
}

export function createDefaultMapData(): { id: string; title: string; nodes: MindMapNode[]; edges: MindMapEdge[] } {
  const rootId = uuidv4()
  return {
    id: uuidv4(),
    title: 'New Mind Map',
    nodes: [
      {
        id: rootId,
        type: 'mindmap',
        position: { x: 0, y: 0 },
        data: {
          label: 'Central Topic',
          color: DEFAULT_ROOT_COLOR,
          shape: 'rounded',
          level: 0,
        },
      },
    ],
    edges: [],
  }
}

interface MindMapStore {
  // Map list — metadata from API, cached in memory (no localStorage)
  maps: MapMeta[]
  activeMapId: string | null

  // Active map content (the map currently open in the editor)
  nodes: MindMapNode[]
  edges: MindMapEdge[]

  // History
  history: HistoryEntry[]
  historyIndex: number

  // Layout
  layoutVersion: number

  // ── Map list management (called after API operations in pages/components) ──
  setMapList: (maps: MapMeta[]) => void
  addMapToList: (map: MapMeta) => void
  updateMapMeta: (id: string, title: string) => void
  removeMap: (id: string) => void

  // ── Active map management ─────────────────────────────────────────────────
  loadMap: (map: { id: string; nodes: MindMapNode[]; edges: MindMapEdge[] }) => void

  // ── Getters ───────────────────────────────────────────────────────────────
  activeMap: () => MapMeta | null
  exportMap: () => MindMapExport

  // ── React Flow handlers ───────────────────────────────────────────────────
  onNodesChange: (changes: NodeChange[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onConnect: (connection: Connection) => void

  // ── Node operations ───────────────────────────────────────────────────────
  addNode: (parentId: string | null, label?: string) => string
  addNodeAtPosition: (parentId: string | null, position: { x: number; y: number }, label?: string) => string
  addSiblingNode: (nodeId: string, label?: string) => string
  deleteNode: (nodeId: string) => void
  deleteEdges: (edgeIds: string[]) => void
  updateNodeLabel: (nodeId: string, label: string) => void
  updateNodeColor: (nodeId: string, color: string) => void
  updateNodeIcon: (nodeId: string, icon: string) => void
  updateNodeShape: (nodeId: string, shape: NodeShape) => void
  updateNodeNotes: (nodeId: string, notes: string) => void
  toggleNodeChecked: (nodeId: string) => void
  toggleNodeCollapsed: (nodeId: string) => void
  setNodeEditing: (nodeId: string, editing: boolean) => void
  startTypingFromEmpty: (nodeId: string, char: string) => void
  moveNode: (nodeId: string, x: number, y: number) => void
  reparentNode: (nodeId: string, newParentId: string) => boolean

  // ── Layout ────────────────────────────────────────────────────────────────
  redistributeChildren: (parentId: string) => void
  autoLayout: (opts?: { skipHistory?: boolean; skipVersionBump?: boolean }) => void

  // ── Bulk AI operations ────────────────────────────────────────────────────
  addAINodes: (parentId: string, labels: string[], colors?: string[]) => void
  addAIEdges: (connections: Array<{ source: string; target: string }>) => void

  // ── History ───────────────────────────────────────────────────────────────
  undo: () => void
  redo: () => void
  pushHistory: () => void

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  reset: () => void
}

export const useMindMapStore = create<MindMapStore>()((set, get) => ({
  maps: [],
  activeMapId: null,
  nodes: [],
  edges: [],
  history: [],
  historyIndex: -1,
  layoutVersion: 0,

  // ── Map list management ───────────────────────────────────────────────────

  setMapList: (maps) => set({ maps }),

  addMapToList: (map) =>
    set((state) => ({ maps: [map, ...state.maps] })),

  updateMapMeta: (id, title) =>
    set((state) => ({
      maps: state.maps.map((m) =>
        m.id === id ? { ...m, title, updatedAt: new Date().toISOString() } : m
      ),
    })),

  removeMap: (id) =>
    set((state) => ({ maps: state.maps.filter((m) => m.id !== id) })),

  // ── Active map management ─────────────────────────────────────────────────

  loadMap: ({ id, nodes, edges }) => {
    // Backfill explicit source/target handle IDs on legacy edges so React Flow
    // doesn't auto-pick a different handle per child (which causes inconsistent
    // routing — e.g. one sibling edge entering the top, others entering the left).
    const normalizedEdges = edges.map((e) => ({
      ...e,
      sourceHandle: e.sourceHandle ?? 'right',
      targetHandle: e.targetHandle ?? 'left',
    }))
    set({ activeMapId: id, nodes, edges: normalizedEdges, history: [], historyIndex: -1 })
  },

  // ── Getters ───────────────────────────────────────────────────────────────

  activeMap: () => {
    const { maps, activeMapId } = get()
    return maps.find((m) => m.id === activeMapId) ?? null
  },

  exportMap: () => {
    const { nodes, edges, activeMap } = get()
    const map = activeMap()

    const childrenMap = new Map<string, string[]>()
    edges.forEach((e) => {
      if (!childrenMap.has(e.source)) childrenMap.set(e.source, [])
      childrenMap.get(e.source)!.push(e.target)
    })

    return {
      title: map?.title ?? 'Mind Map',
      nodes: nodes.map((n) => ({
        id: n.id,
        label: n.data.label,
        level: n.data.level,
        children: childrenMap.get(n.id) ?? [],
        color: n.data.color,
        checked: n.data.checked,
        notes: n.data.notes,
      })),
      edges: edges.map((e) => ({ source: e.source, target: e.target })),
    }
  },

  // ── React Flow handlers ───────────────────────────────────────────────────

  onNodesChange: (changes) => {
    set((state) => ({
      nodes: applyNodeChanges(changes, state.nodes) as MindMapNode[],
    }))
  },

  onEdgesChange: (changes) => {
    set((state) => ({
      edges: applyEdgeChanges(changes, state.edges) as MindMapEdge[],
    }))
  },

  onConnect: (connection) => {
    get().pushHistory()
    set((state) => ({
      edges: addEdge(
        {
          ...connection,
          type: 'custom',
          animated: false,
          style: { strokeWidth: 2 },
        },
        state.edges
      ) as MindMapEdge[],
    }))
  },

  // ── Node operations ───────────────────────────────────────────────────────

  addNode: (parentId, label = 'New Topic') => {
    get().pushHistory()
    const newId = uuidv4()
    const { nodes, edges } = get()

    let level = 1
    let color: string = '#54A0FF'
    let position = { x: 200, y: 0 }

    if (parentId) {
      const parent = nodes.find((n) => n.id === parentId)
      if (parent) {
        level = parent.data.level + 1
        const siblingIds = edges.filter((e) => e.source === parentId).map((e) => e.target)
        // Level-1 children (direct children of the root) get a fresh branch color.
        // Deeper descendants inherit the parent's color so each branch stays unified.
        if (parent.data.level === 0) {
          const siblingColors = siblingIds
            .map((sid) => nodes.find((n) => n.id === sid)?.data.color)
            .filter((c): c is string => Boolean(c))
          color = pickBranchColor(siblingColors)
        } else {
          color = parent.data.color
        }
        const hGap = level === 1 ? 230 : 190
        // Stack below the lowest existing sibling so the new node is visible
        // even when auto-layout is off. When auto-layout is on, autoLayout()
        // will redistribute siblings into their proper slots immediately.
        const siblingYs = siblingIds
          .map((sid) => nodes.find((n) => n.id === sid)?.position.y)
          .filter((y): y is number => typeof y === 'number')
        const y = siblingYs.length > 0 ? Math.max(...siblingYs) + 80 : parent.position.y
        position = {
          x: parent.position.x + hGap,
          y,
        }
      }
    }

    const newNode: MindMapNode = {
      id: newId,
      type: 'mindmap',
      position,
      data: { label, color, shape: 'rounded', level, isEditing: true },
    }

    const newEdge: MindMapEdge | undefined = parentId
      ? {
          id: `e-${parentId}-${newId}`,
          source: parentId,
          target: newId,
          sourceHandle: 'right',
          targetHandle: 'left',
          type: 'custom',
          style: { stroke: color, strokeWidth: 2.5 },
        }
      : undefined

    set((state) => ({
      nodes: [...state.nodes, newNode],
      edges: newEdge ? [...state.edges, newEdge] : state.edges,
    }))

    // Run the same full-tree layout the layout button triggers. Defer one tick so
    // React Flow has a chance to measure the new node's dimensions before layout.
    if (parentId) {
      // Run layout in the same tick as the add so React batches both set() calls
      // into a single render — otherwise the new node briefly appears at its
      // drop position, then jumps to its layout position (visible jerk).
      get().autoLayout({ skipHistory: true, skipVersionBump: true })
    }
    return newId
  },

  addNodeAtPosition: (parentId, position, label = 'New Topic') => {
    get().pushHistory()
    const newId = uuidv4()
    const { nodes, edges } = get()

    let level = 1
    let color: string = '#54A0FF'
    let snappedPosition = position

    if (parentId) {
      const parent = nodes.find((n) => n.id === parentId)
      if (parent) {
        level = parent.data.level + 1

        const siblingIds = edges.filter((e) => e.source === parentId).map((e) => e.target)
        if (parent.data.level === 0) {
          const siblingColors = siblingIds
            .map((sid) => nodes.find((n) => n.id === sid)?.data.color)
            .filter((c): c is string => Boolean(c))
          color = pickBranchColor(siblingColors)
        } else {
          color = parent.data.color
        }

        const siblingX = siblingIds.length > 0
          ? nodes.find((n) => n.id === siblingIds[0])?.position.x
          : undefined

        const hGap = level === 1 ? 230 : 190
        const columnX = siblingX ?? (parent.position.x + hGap)
        snappedPosition = { x: columnX, y: position.y }
      }
    }

    const newNode: MindMapNode = {
      id: newId,
      type: 'mindmap',
      position: snappedPosition,
      data: { label, color, shape: 'rounded', level, isEditing: true },
    }

    const newEdge: MindMapEdge | undefined = parentId
      ? {
          id: `e-${parentId}-${newId}`,
          source: parentId,
          target: newId,
          sourceHandle: 'right',
          targetHandle: 'left',
          type: 'custom',
          style: { stroke: color, strokeWidth: 2.5 },
        }
      : undefined

    set((state) => ({
      nodes: [...state.nodes, newNode],
      edges: newEdge ? [...state.edges, newEdge] : state.edges,
    }))

    if (parentId) {
      // Run layout in the same tick as the add so React batches both set() calls
      // into a single render — otherwise the new node briefly appears at its
      // drop position, then jumps to its layout position (visible jerk).
      get().autoLayout({ skipHistory: true, skipVersionBump: true })
    }
    return newId
  },

  addSiblingNode: (nodeId, label = 'New Topic') => {
    const { edges } = get()
    const parentEdge = edges.find((e) => e.target === nodeId)
    const parentId = parentEdge?.source ?? null
    return get().addNode(parentId, label)
  },

  deleteNode: (nodeId) => {
    get().pushHistory()
    const { nodes, edges } = get()

    const parentEdge = edges.find((e) => e.target === nodeId)
    const parentId = parentEdge?.source ?? null

    const toDelete = new Set<string>()
    const queue = [nodeId]
    while (queue.length > 0) {
      const id = queue.shift()!
      toDelete.add(id)
      edges.filter((e) => e.source === id).forEach((e) => queue.push(e.target))
    }

    set({
      nodes: nodes.filter((n) => !toDelete.has(n.id)),
      edges: edges.filter((e) => !toDelete.has(e.source) && !toDelete.has(e.target)),
    })

    if (parentId) {
      get().autoLayout({ skipHistory: true, skipVersionBump: true })
    }
  },

  deleteEdges: (edgeIds) => {
    if (edgeIds.length === 0) return
    get().pushHistory()
    const ids = new Set(edgeIds)
    set((state) => ({
      edges: state.edges.filter((e) => !ids.has(e.id)),
    }))
  },

  // ── Auto-layout: evenly space all children of a node ─────────────────────

  redistributeChildren: (startId: string) => {
    const { nodes, edges } = get()

    let rootId = startId
    const visited = new Set<string>()
    while (true) {
      if (visited.has(rootId)) break
      visited.add(rootId)
      const up = edges.find((e) => e.target === rootId)
      if (!up) break
      rootId = up.source
    }

    const MIN_SLOT = 48
    const BETWEEN = 18

    // React Flow populates `height` on each node after measurement.
    // Use it so multi-line / wrapped nodes reserve enough vertical space.
    const nodeSlot = (id: string): number => {
      const n = nodes.find((nd) => nd.id === id)
      const measured = (n?.height as number | undefined) ?? 0
      return Math.max(MIN_SLOT, measured)
    }

    function requiredHeight(nodeId: string): number {
      const children = edges.filter((e) => e.source === nodeId).map((e) => e.target)
      const own = nodeSlot(nodeId)
      if (children.length === 0) return own
      const sum = children.reduce((acc, c) => acc + requiredHeight(c), 0) + BETWEEN * (children.length - 1)
      return Math.max(sum, own)
    }

    const positions = new Map(nodes.map((n) => [n.id, { ...n.position }]))

    function layoutChildren(nodeId: string): void {
      const children = edges.filter((e) => e.source === nodeId).map((e) => e.target)
      if (children.length === 0) return

      const sorted = [...children].sort(
        (a, b) => (positions.get(a)?.y ?? 0) - (positions.get(b)?.y ?? 0)
      )

      // Center children around the parent's *visual* center (positions are top-left).
      const parentTopY = positions.get(nodeId)?.y ?? 0
      const parentCenterY = parentTopY + nodeSlot(nodeId) / 2

      const slots = sorted.map(requiredHeight)         // vertical room reserved per child
      const visualHeights = sorted.map(nodeSlot)       // actual rendered height per child
      const totalHeight = slots.reduce((s, h) => s + h, 0) + BETWEEN * (sorted.length - 1)

      let curY = parentCenterY - totalHeight / 2

      sorted.forEach((childId, i) => {
        // Place child so its visual center sits at the slot's center.
        const slotCenterY = curY + slots[i] / 2
        const targetTopY = slotCenterY - visualHeights[i] / 2
        const currentY = positions.get(childId)?.y ?? 0
        const dy = targetTopY - currentY

        if (Math.abs(dy) > 0.1) {
          const subtree: string[] = []
          const q = [childId]
          while (q.length > 0) {
            const id = q.shift()!
            subtree.push(id)
            edges.filter((e) => e.source === id).forEach((e) => q.push(e.target))
          }
          subtree.forEach((id) => {
            const p = positions.get(id)
            if (p) positions.set(id, { x: p.x, y: p.y + dy })
          })
        }

        curY += slots[i] + BETWEEN
        layoutChildren(childId)
      })
    }

    layoutChildren(rootId)

    set((state) => ({
      nodes: state.nodes.map((nd) => {
        const np = positions.get(nd.id)
        if (!np) return nd
        if (
          Math.abs(np.x - nd.position.x) < 0.1 &&
          Math.abs(np.y - nd.position.y) < 0.1
        ) return nd
        return { ...nd, position: np }
      }),
    }))
  },

  autoLayout: (opts) => {
    // Implicit calls (add/edit/delete) pass `skipHistory: true`. The manual
    // Layout button calls without opts. The auto-arrange toggle in the
    // toolbar gates only the implicit calls — clicking Layout always runs.
    if (opts?.skipHistory && !useSettingsStore.getState().autoLayoutEnabled) return

    const { nodes, edges } = get()
    if (!opts?.skipHistory) get().pushHistory()

    const hasParent = new Set(edges.map((e) => e.target))
    const rootNode = nodes.find((n) => !hasParent.has(n.id))
    if (!rootNode) return

    const H_GAP = 110           // visible horizontal space between parent's right edge and child's left edge
    const DEFAULT_WIDTH = 150   // fallback if React Flow hasn't measured a node yet
    const MIN_SLOT = 64
    const V_GAP = 24

    const childrenOf = new Map<string, string[]>()
    nodes.forEach((n) => childrenOf.set(n.id, []))
    edges.forEach((e) => {
      childrenOf.get(e.source)?.push(e.target)
    })

    // Use React Flow's measured height so wrapped/multi-line nodes get enough room.
    const nodeSlot = (id: string): number => {
      const n = nodes.find((nd) => nd.id === id)
      const measured = (n?.height as number | undefined) ?? 0
      return Math.max(MIN_SLOT, measured)
    }

    const nodeWidth = (id: string): number => {
      const n = nodes.find((nd) => nd.id === id)
      return ((n?.width as number | undefined) ?? 0) || DEFAULT_WIDTH
    }

    function subtreeHeight(id: string): number {
      const children = childrenOf.get(id) ?? []
      const own = nodeSlot(id)
      if (children.length === 0) return own
      const total = children.reduce((acc, c) => acc + subtreeHeight(c), 0) + V_GAP * (children.length - 1)
      return Math.max(total, own)
    }

    const positions = new Map<string, { x: number; y: number }>()
    // assign() takes the parent's *visual* center and stores the node's top-left position
    // so React Flow renders it at the right spot. Children are placed past the
    // parent's right edge so wide and narrow nodes both get a consistent visual gap.
    function assign(id: string, x: number, visualCenterY: number): void {
      const ownH = nodeSlot(id)
      positions.set(id, { x, y: visualCenterY - ownH / 2 })
      const children = childrenOf.get(id) ?? []
      if (children.length === 0) return
      const childX = x + nodeWidth(id) + H_GAP
      const slots = children.map((c) => subtreeHeight(c))
      const totalH = slots.reduce((a, h) => a + h, 0) + V_GAP * (children.length - 1)
      let curY = visualCenterY - totalH / 2
      children.forEach((childId, i) => {
        assign(childId, childX, curY + slots[i] / 2)
        curY += slots[i] + V_GAP
      })
    }

    assign(rootNode.id, 0, 0)

    set((state) => ({
      nodes: state.nodes.map((n) => {
        const pos = positions.get(n.id)
        return pos ? { ...n, position: pos } : n
      }),
      // Skip the version bump when called from internal add/delete actions —
      // those already trigger fitView via the nodes-length effect, and bumping
      // here would cause two fitView animations to overlap.
      layoutVersion: opts?.skipVersionBump ? state.layoutVersion : state.layoutVersion + 1,
    }))
  },

  // ── Node field updates ────────────────────────────────────────────────────

  updateNodeLabel: (nodeId, label) => {
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, label } } : n
      ),
    }))
    // After React Flow re-measures the node with its new (possibly wrapped) label,
    // run the same full-tree layout the layout button uses — without bumping the
    // version, so the user's current zoom/pan stays put.
    setTimeout(() => {
      get().autoLayout({ skipHistory: true, skipVersionBump: true })
    }, 60)
  },

  updateNodeColor: (nodeId, color) => {
    get().pushHistory()
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, color } } : n
      ),
      edges: state.edges.map((e) =>
        e.source === nodeId ? { ...e, style: { ...e.style, stroke: color } } : e
      ),
    }))
  },

  updateNodeIcon: (nodeId, icon) => {
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, icon } } : n
      ),
    }))
  },

  updateNodeShape: (nodeId, shape) => {
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, shape } } : n
      ),
    }))
  },

  updateNodeNotes: (nodeId, notes) => {
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, notes } } : n
      ),
    }))
  },

  toggleNodeChecked: (nodeId) => {
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, checked: !n.data.checked } } : n
      ),
    }))
  },

  toggleNodeCollapsed: (nodeId) => {
    const { edges } = get()
    const collapsed = !get().nodes.find((n) => n.id === nodeId)?.data.collapsed

    const descendants = new Set<string>()
    const queue = edges.filter((e) => e.source === nodeId).map((e) => e.target)
    while (queue.length > 0) {
      const id = queue.shift()!
      descendants.add(id)
      edges.filter((e) => e.source === id).forEach((e) => queue.push(e.target))
    }

    set((state) => ({
      nodes: state.nodes.map((n) => {
        if (n.id === nodeId) return { ...n, data: { ...n.data, collapsed } }
        if (descendants.has(n.id)) return { ...n, hidden: collapsed }
        return n
      }),
      edges: state.edges.map((e) => {
        if (descendants.has(e.target) || descendants.has(e.source)) {
          return { ...e, hidden: collapsed }
        }
        return e
      }),
    }))
  },

  setNodeEditing: (nodeId, editing) => {
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, isEditing: editing, editCursorAtEnd: false } } : n
      ),
    }))
  },

  startTypingFromEmpty: (nodeId, char) => {
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, label: char, isEditing: true, editCursorAtEnd: true } }
          : n
      ),
    }))
  },

  moveNode: (nodeId, x, y) => {
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, position: { x, y }, data: { ...n.data, userMoved: true } } : n
      ),
    }))
  },

  // Re-parent a node by removing its current incoming edge and connecting it
  // under newParentId. Cascades level + branch color through the moved subtree.
  // Returns true on success, false if the move is invalid (cycle, same parent,
  // root node, missing nodes).
  reparentNode: (nodeId, newParentId) => {
    if (nodeId === newParentId) return false
    const { nodes, edges } = get()
    const node = nodes.find((n) => n.id === nodeId)
    const newParent = nodes.find((n) => n.id === newParentId)
    if (!node || !newParent) return false
    if (node.data.level === 0) return false // root has no parent

    // Walk subtree of nodeId — needed for cycle check + level/color cascade
    const subtree = new Set<string>()
    const stack = [nodeId]
    while (stack.length > 0) {
      const id = stack.pop()!
      if (subtree.has(id)) continue
      subtree.add(id)
      edges.filter((e) => e.source === id).forEach((e) => stack.push(e.target))
    }
    if (subtree.has(newParentId)) return false // would create a cycle

    const currentParentEdge = edges.find((e) => e.target === nodeId)
    if (currentParentEdge?.source === newParentId) return false // already child

    get().pushHistory()

    const newLevel = newParent.data.level + 1
    const levelDelta = newLevel - node.data.level

    // New branch color: if reparenting under root, pick a fresh palette color;
    // otherwise inherit the new parent's branch color.
    let newBranchColor: string
    if (newParent.data.level === 0) {
      const siblingColors = edges
        .filter((e) => e.source === newParentId && e.target !== nodeId)
        .map((e) => nodes.find((n) => n.id === e.target)?.data.color)
        .filter((c): c is string => Boolean(c))
      newBranchColor = pickBranchColor(siblingColors)
    } else {
      newBranchColor = newParent.data.color
    }

    const oldBranchColor = node.data.color

    const newEdge: MindMapEdge = {
      id: `e-${newParentId}-${nodeId}`,
      source: newParentId,
      target: nodeId,
      sourceHandle: 'right',
      targetHandle: 'left',
      type: 'custom',
      style: { stroke: newBranchColor, strokeWidth: 2.5 },
    }

    set((state) => ({
      nodes: state.nodes.map((n) => {
        if (!subtree.has(n.id)) return n
        const data = { ...n.data, level: n.data.level + levelDelta }
        // Recolor only nodes that were following the old branch color — leave
        // any node the user explicitly recolored alone.
        if (n.data.color === oldBranchColor) data.color = newBranchColor
        return { ...n, data }
      }),
      edges: [
        ...state.edges
          .filter((e) => e.target !== nodeId)
          .map((e) => {
            if (subtree.has(e.source) && e.style?.stroke === oldBranchColor) {
              return { ...e, style: { ...e.style, stroke: newBranchColor } }
            }
            return e
          }),
        newEdge,
      ],
    }))

    get().autoLayout({ skipHistory: true, skipVersionBump: true })
    return true
  },

  // ── Bulk AI operations ────────────────────────────────────────────────────

  addAINodes: (parentId, labels, colors) => {
    get().pushHistory()
    const { nodes, edges } = get()
    const parent = nodes.find((n) => n.id === parentId)
    if (!parent) return

    const level = parent.data.level + 1
    const hGap = level === 1 ? 230 : 190

    const siblingIds = edges.filter((e) => e.source === parentId).map((e) => e.target)
    const siblingX = siblingIds.length > 0
      ? nodes.find((n) => n.id === siblingIds[0])?.position.x
      : undefined
    const columnX = siblingX ?? (parent.position.x + hGap)

    const newNodes: MindMapNode[] = []
    const newEdges: MindMapEdge[] = []

    // When AI expands the root, give each new branch a distinct color from the palette.
    // Otherwise inherit the parent's branch color so subtree nodes stay visually unified.
    const isRootExpansion = parent.data.level === 0
    const existingSiblingColors = isRootExpansion
      ? siblingIds
          .map((sid) => nodes.find((n) => n.id === sid)?.data.color)
          .filter((c): c is string => Boolean(c))
      : []

    labels.forEach((label, i) => {
      const newId = uuidv4()
      let color: string
      if (colors?.[i]) {
        color = colors[i]
      } else if (isRootExpansion) {
        color = pickBranchColor(existingSiblingColors)
        existingSiblingColors.push(color)
      } else {
        color = parent.data.color
      }

      newNodes.push({
        id: newId,
        type: 'mindmap',
        position: { x: columnX, y: parent.position.y + i * 80 },
        data: { label, color, shape: 'rounded', level },
      })

      newEdges.push({
        id: `e-${parentId}-${newId}`,
        source: parentId,
        target: newId,
        sourceHandle: 'right',
        targetHandle: 'left',
        type: 'custom',
        style: { stroke: color, strokeWidth: 2 },
      })
    })

    set((state) => ({
      nodes: [...state.nodes, ...newNodes],
      edges: [...state.edges, ...newEdges],
    }))

    get().autoLayout({ skipHistory: true, skipVersionBump: true })
  },

  addAIEdges: (connections) => {
    get().pushHistory()
    const newEdges: MindMapEdge[] = connections.map((c) => ({
      id: `e-ai-${c.source}-${c.target}`,
      source: c.source,
      target: c.target,
      type: 'custom',
      animated: true,
      style: { stroke: '#6366f1', strokeWidth: 1.5, strokeDasharray: '5,5' },
    }))
    set((state) => ({ edges: [...state.edges, ...newEdges] }))
  },

  // ── History ───────────────────────────────────────────────────────────────

  pushHistory: () => {
    const { nodes, edges, history, historyIndex } = get()
    const entry: HistoryEntry = {
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges)),
      timestamp: Date.now(),
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

  reset: () =>
    set({
      maps: [],
      activeMapId: null,
      nodes: [],
      edges: [],
      history: [],
      historyIndex: -1,
      layoutVersion: 0,
    }),
}))
