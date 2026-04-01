import { create } from 'zustand'
import { persist } from 'zustand/middleware'
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
  MindMap,
  MindMapNode,
  MindMapEdge,
  MindMapNodeData,
  HistoryEntry,
  NodeColor,
  NodeShape,
  MindMapExport,
} from '@/types'

const DEFAULT_ROOT_COLOR = '#6366f1'
const MAX_HISTORY = 50

function createDefaultMap(): MindMap {
  const rootId = uuidv4()
  return {
    id: uuidv4(),
    title: 'My Mind Map',
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
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    theme: 'light',
  }
}

interface MindMapStore {
  // Data
  maps: MindMap[]
  activeMapId: string | null
  nodes: MindMapNode[]
  edges: MindMapEdge[]

  // History
  history: HistoryEntry[]
  historyIndex: number

  // Getters
  activeMap: () => MindMap | null
  exportMap: () => MindMapExport

  // Map management
  createMap: (title?: string) => void
  switchMap: (id: string) => void
  deleteMap: (id: string) => void
  renameMap: (id: string, title: string) => void
  saveCurrentMap: () => void

  // React Flow handlers
  onNodesChange: (changes: NodeChange[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onConnect: (connection: Connection) => void

  // Node operations
  addNode: (parentId: string | null, label?: string) => string
  addNodeAtPosition: (parentId: string | null, position: { x: number; y: number }, label?: string) => string
  addSiblingNode: (nodeId: string, label?: string) => string
  deleteNode: (nodeId: string) => void
  updateNodeLabel: (nodeId: string, label: string) => void
  updateNodeColor: (nodeId: string, color: string) => void
  updateNodeIcon: (nodeId: string, icon: string) => void
  updateNodeShape: (nodeId: string, shape: NodeShape) => void
  updateNodeNotes: (nodeId: string, notes: string) => void
  toggleNodeChecked: (nodeId: string) => void
  toggleNodeCollapsed: (nodeId: string) => void
  setNodeEditing: (nodeId: string, editing: boolean) => void
  moveNode: (nodeId: string, x: number, y: number) => void

  // Layout
  redistributeChildren: (parentId: string) => void
  autoLayout: () => void
  layoutVersion: number

  // Bulk operations
  addAINodes: (parentId: string, labels: string[], colors?: string[]) => void
  addAIEdges: (connections: Array<{ source: string; target: string }>) => void

  // History
  undo: () => void
  redo: () => void
  pushHistory: () => void
}

export const useMindMapStore = create<MindMapStore>()(
  persist(
    (set, get) => {
      const defaultMap = createDefaultMap()

      return {
        maps: [defaultMap],
        activeMapId: defaultMap.id,
        nodes: defaultMap.nodes,
        edges: defaultMap.edges,
        history: [],
        historyIndex: -1,
        layoutVersion: 0,

        activeMap: () => {
          const { maps, activeMapId } = get()
          return maps.find((m) => m.id === activeMapId) ?? null
        },

        exportMap: () => {
          const { nodes, edges, activeMap } = get()
          const map = activeMap()
          const nodeMap = new Map(nodes.map((n) => [n.id, n]))

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
            })),
            edges: edges.map((e) => ({ source: e.source, target: e.target })),
          }
        },

        createMap: (title = 'New Mind Map') => {
          const newMap = createDefaultMap()
          newMap.title = title
          get().saveCurrentMap()
          set((state) => ({
            maps: [...state.maps, newMap],
            activeMapId: newMap.id,
            nodes: newMap.nodes,
            edges: newMap.edges,
            history: [],
            historyIndex: -1,
          }))
        },

        switchMap: (id) => {
          get().saveCurrentMap()
          const map = get().maps.find((m) => m.id === id)
          if (!map) return
          set({
            activeMapId: id,
            nodes: map.nodes,
            edges: map.edges,
            history: [],
            historyIndex: -1,
          })
        },

        deleteMap: (id) => {
          set((state) => {
            const remaining = state.maps.filter((m) => m.id !== id)
            if (remaining.length === 0) {
              const fresh = createDefaultMap()
              return {
                maps: [fresh],
                activeMapId: fresh.id,
                nodes: fresh.nodes,
                edges: fresh.edges,
              }
            }
            const newActive = state.activeMapId === id ? remaining[0] : state.maps.find((m) => m.id === state.activeMapId) ?? remaining[0]
            return {
              maps: remaining,
              activeMapId: newActive.id,
              nodes: newActive.nodes,
              edges: newActive.edges,
            }
          })
        },

        renameMap: (id, title) => {
          set((state) => ({
            maps: state.maps.map((m) => m.id === id ? { ...m, title, updatedAt: new Date().toISOString() } : m),
          }))
        },

        saveCurrentMap: () => {
          const { maps, activeMapId, nodes, edges } = get()
          if (!activeMapId) return
          set({
            maps: maps.map((m) =>
              m.id === activeMapId
                ? { ...m, nodes, edges, updatedAt: new Date().toISOString() }
                : m
            ),
          })
        },

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
              color = parent.data.color
              // Place roughly to the right — redistributeChildren will fix Y
              const hGap = level === 1 ? 230 : 190
              position = {
                x: parent.position.x + hGap,
                y: parent.position.y,
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
                type: 'custom',
                style: { stroke: color, strokeWidth: 2.5 },
              }
            : undefined

          set((state) => ({
            nodes: [...state.nodes, newNode],
            edges: newEdge ? [...state.edges, newEdge] : state.edges,
          }))

          // Re-space all children of parent evenly
          if (parentId) get().redistributeChildren(parentId)

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
              color = parent.data.color

              // X is always the uniform sibling column — ignore drop X.
              // Check if siblings already exist and use their X, otherwise compute from parent.
              const siblingIds = edges.filter((e) => e.source === parentId).map((e) => e.target)
              const siblingX = siblingIds.length > 0
                ? nodes.find((n) => n.id === siblingIds[0])?.position.x
                : undefined

              const hGap = level === 1 ? 230 : 190
              const columnX = siblingX ?? (parent.position.x + hGap)

              // Y comes from the drop position so insertion order feels natural;
              // redistributeChildren will even it out immediately after.
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
                type: 'custom',
                style: { stroke: color, strokeWidth: 2.5 },
              }
            : undefined

          set((state) => ({
            nodes: [...state.nodes, newNode],
            edges: newEdge ? [...state.edges, newEdge] : state.edges,
          }))

          // Re-space all children evenly (fixes Y, keeps X uniform)
          if (parentId) get().redistributeChildren(parentId)

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

          // Find parent before deletion so we can re-space its remaining children
          const parentEdge = edges.find((e) => e.target === nodeId)
          const parentId = parentEdge?.source ?? null

          // Collect all descendants
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

          // Re-space remaining siblings
          if (parentId) get().redistributeChildren(parentId)
        },

        // ── Auto-layout: evenly space all direct children of a node ──────────
        // Children are stacked vertically, centered on the parent's Y.
        // Spacing compresses as children grow (min 44px).
        // Each child's entire subtree is shifted by the same delta.
        redistributeChildren: (startId: string) => {
          const { nodes, edges } = get()

          // ── Step 1: walk UP to find the tree root so the whole tree re-layouts ──
          let rootId = startId
          const visited = new Set<string>()
          while (true) {
            if (visited.has(rootId)) break
            visited.add(rootId)
            const up = edges.find((e) => e.target === rootId)
            if (!up) break
            rootId = up.source
          }

          // ── Step 2: compute required vertical height of a subtree (bottom-up) ──
          // This is purely structural — uses edges only, not positions.
          const MIN_SLOT = 48   // minimum height per leaf node
          const BETWEEN  = 18   // gap between adjacent subtrees

          function requiredHeight(nodeId: string): number {
            const children = edges.filter((e) => e.source === nodeId).map((e) => e.target)
            if (children.length === 0) return MIN_SLOT
            const sum = children.reduce((acc, c) => acc + requiredHeight(c), 0)
            return sum + BETWEEN * (children.length - 1)
          }

          // ── Step 3: layout a node's children into positions map (recursive) ──
          // positions map is updated in-place so recursive calls see updated values.
          const positions = new Map(nodes.map((n) => [n.id, { ...n.position }]))

          function layoutChildren(nodeId: string): void {
            const children = edges.filter((e) => e.source === nodeId).map((e) => e.target)
            if (children.length === 0) return

            // Preserve visual order by sorting children by their current Y
            const sorted = [...children].sort(
              (a, b) => (positions.get(a)?.y ?? 0) - (positions.get(b)?.y ?? 0)
            )

            const parentY = positions.get(nodeId)?.y ?? 0
            const heights = sorted.map(requiredHeight)
            const totalHeight = heights.reduce((s, h) => s + h, 0) + BETWEEN * (sorted.length - 1)

            let curY = parentY - totalHeight / 2

            sorted.forEach((childId, i) => {
              // Each child is centered in its allocated slot
              const targetY = curY + heights[i] / 2

              const currentY = positions.get(childId)?.y ?? 0
              const dy = targetY - currentY

              if (Math.abs(dy) > 0.1) {
                // Shift child + its entire subtree together
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

              curY += heights[i] + BETWEEN

              // Recurse so grandchildren are also correctly spaced
              layoutChildren(childId)
            })
          }

          layoutChildren(rootId)

          // ── Step 4: apply all position changes in one set() call ──
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

        autoLayout: () => {
          const { nodes, edges } = get()
          get().pushHistory()

          // Find root: the node with no incoming edge
          const hasParent = new Set(edges.map((e) => e.target))
          const rootNode = nodes.find((n) => !hasParent.has(n.id))
          if (!rootNode) return

          const H_GAP = 230
          const MIN_SLOT = 64
          const V_GAP = 24

          // Build children map
          const childrenOf = new Map<string, string[]>()
          nodes.forEach((n) => childrenOf.set(n.id, []))
          edges.forEach((e) => {
            childrenOf.get(e.source)?.push(e.target)
          })

          // Bottom-up: compute the total vertical height a subtree needs
          function subtreeHeight(id: string): number {
            const children = childrenOf.get(id) ?? []
            if (children.length === 0) return MIN_SLOT
            const total = children.reduce((acc, c) => acc + subtreeHeight(c), 0)
            return total + V_GAP * (children.length - 1)
          }

          // Top-down: assign x/y positions
          const positions = new Map<string, { x: number; y: number }>()
          function assign(id: string, x: number, centerY: number): void {
            positions.set(id, { x, y: centerY })
            const children = childrenOf.get(id) ?? []
            if (children.length === 0) return
            const heights = children.map((c) => subtreeHeight(c))
            const totalH = heights.reduce((a, h) => a + h, 0) + V_GAP * (children.length - 1)
            let curY = centerY - totalH / 2
            children.forEach((childId, i) => {
              assign(childId, x + H_GAP, curY + heights[i] / 2)
              curY += heights[i] + V_GAP
            })
          }

          assign(rootNode.id, 0, 0)

          set((state) => ({
            nodes: state.nodes.map((n) => {
              const pos = positions.get(n.id)
              return pos ? { ...n, position: pos } : n
            }),
            layoutVersion: state.layoutVersion + 1,
          }))
        },

        updateNodeLabel: (nodeId, label) => {
          set((state) => ({
            nodes: state.nodes.map((n) =>
              n.id === nodeId ? { ...n, data: { ...n.data, label } } : n
            ),
          }))
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

          // Collect all descendants
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
              n.id === nodeId ? { ...n, data: { ...n.data, isEditing: editing } } : n
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

        addAINodes: (parentId, labels, colors) => {
          get().pushHistory()
          const { nodes, edges } = get()
          const parent = nodes.find((n) => n.id === parentId)
          if (!parent) return

          const level = parent.data.level + 1
          const hGap = level === 1 ? 230 : 190

          // Snap all new nodes to the same column as existing siblings
          const siblingIds = edges.filter((e) => e.source === parentId).map((e) => e.target)
          const siblingX = siblingIds.length > 0
            ? nodes.find((n) => n.id === siblingIds[0])?.position.x
            : undefined
          const columnX = siblingX ?? (parent.position.x + hGap)

          const newNodes: MindMapNode[] = []
          const newEdges: MindMapEdge[] = []

          labels.forEach((label, i) => {
            const newId = uuidv4()
            const color = colors?.[i] ?? parent.data.color

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
              type: 'custom',
              style: { stroke: color, strokeWidth: 2 },
            })
          })

          set((state) => ({
            nodes: [...state.nodes, ...newNodes],
            edges: [...state.edges, ...newEdges],
          }))

          // Full tree re-layout so everything is clean and fits
          get().redistributeChildren(parentId)
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
      }
    },
    {
      name: 'digonode-storage',
      partialize: (state) => ({ maps: state.maps, activeMapId: state.activeMapId }),
      onRehydrateStorage: () => (state) => {
        if (state && state.activeMapId) {
          const activeMap = state.maps.find((m) => m.id === state.activeMapId)
          if (activeMap) {
            state.nodes = activeMap.nodes
            state.edges = activeMap.edges
          }
        }
      },
    }
  )
)
