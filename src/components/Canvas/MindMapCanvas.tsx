import { useCallback, useEffect, useRef } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  SelectionMode,
  NodeTypes,
  EdgeTypes,
  ConnectionLineType,
  useReactFlow,
  OnConnectStart,
  OnConnectEnd,
  Node,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { useMindMapStore } from '@/store/mindmapStore'
import { useUIStore } from '@/store/uiStore'
import { MindMapNode } from './MindMapNode'
import { CustomEdge } from './CustomEdge'
import { LiveCursors } from './LiveCursors'
import { NodeAIPopover } from './NodeAIPopover'
import { useKeyboard } from '@/hooks/useKeyboard'
import { useUpdateMyPresence } from '@/liveblocks.config'

const nodeTypes: NodeTypes = {
  mindmap: MindMapNode,
}

const edgeTypes: EdgeTypes = {
  custom: CustomEdge,
}

export function MindMapCanvas({ readOnly = false }: { readOnly?: boolean }) {
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addNode,
    addNodeAtPosition,
    reparentNode,
    layoutVersion,
  } = useMindMapStore()

  const {
    theme,
    minimapVisible,
    setSelectedNodes,
    setSelectedEdges,
    clearSelection,
    setInspectorNode,
    setDropTargetId,
    presentationMode,
    presentationIndex,
    presentationOrder,
  } = useUIStore()

  const { screenToFlowPosition, fitView, getIntersectingNodes } = useReactFlow()
  const updateMyPresence = useUpdateMyPresence()

  // Fit view to current presentation node when step changes
  useEffect(() => {
    if (!presentationMode || !presentationOrder[presentationIndex]) return
    const id = setTimeout(() => {
      fitView({ nodes: [{ id: presentationOrder[presentationIndex] }], duration: 500, padding: 0.5, maxZoom: 1.4 })
    }, 50)
    return () => clearTimeout(id)
  }, [presentationMode, presentationIndex, presentationOrder, fitView])

  // Fit view only when the user explicitly clicks the Layout button (which
  // bumps layoutVersion). Add/delete actions intentionally skip the bump so the
  // user's current zoom/pan stays put — they can re-fit manually if they want.
  const prevLayoutVersion = useRef(layoutVersion)
  useEffect(() => {
    if (layoutVersion > prevLayoutVersion.current) {
      const id = setTimeout(() => fitView({ duration: 500, padding: 0.25 }), 50)
      prevLayoutVersion.current = layoutVersion
      return () => clearTimeout(id)
    }
    prevLayoutVersion.current = layoutVersion
  }, [layoutVersion, fitView])

  // Track which node a connection drag started from
  const connectSourceId = useRef<string | null>(null)

  // Drag-to-reparent: while a node is being dragged, we precompute the set of
  // invalid drop targets (the node itself + every descendant) so we can skip
  // cycle-creating drops without re-walking the tree on every drag tick.
  const excludedTargetsRef = useRef<Set<string>>(new Set())
  const pendingDropTargetRef = useRef<string | null>(null)

  useKeyboard()

  // Broadcast cursor position to other users
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      updateMyPresence({ cursor: pos })
    },
    [screenToFlowPosition, updateMyPresence]
  )

  const handleMouseLeave = useCallback(() => {
    updateMyPresence({ cursor: null })
  }, [updateMyPresence])

  const handlePaneClick = useCallback(() => {
    clearSelection()
    setInspectorNode(null)
  }, [clearSelection, setInspectorNode])

  const handleSelectionChange = useCallback(
    ({ nodes: selectedNodes, edges: selectedEdges }: { nodes: any[]; edges: any[] }) => {
      const nodeIds = selectedNodes.map((n) => n.id)
      const edgeIds = selectedEdges.map((e) => e.id)
      setSelectedNodes(nodeIds)
      setSelectedEdges(edgeIds)
      if (nodeIds.length === 1) setInspectorNode(nodeIds[0])
      else setInspectorNode(null)
    },
    [setSelectedNodes, setSelectedEdges, setInspectorNode]
  )

  // Record which node the drag started from
  const handleConnectStart: OnConnectStart = useCallback((_, { nodeId }) => {
    connectSourceId.current = nodeId ?? null
  }, [])

  // When the drag ends — if it landed on the canvas (not a node/handle), create a new node
  const handleConnectEnd: OnConnectEnd = useCallback(
    (event) => {
      const sourceId = connectSourceId.current
      connectSourceId.current = null
      if (!sourceId) return

      // Only create a node if dropped on the pane, not on an existing node
      const target = event.target as Element
      const droppedOnPane =
        target.classList.contains('react-flow__pane') ||
        target.classList.contains('react-flow__background') ||
        target.tagName === 'svg' ||
        target.tagName === 'rect'

      if (!droppedOnPane) return

      // Convert screen coords to flow coords
      const clientEvent = event as MouseEvent | TouchEvent
      const clientX = 'touches' in clientEvent
        ? clientEvent.touches[0]?.clientX ?? 0
        : (clientEvent as MouseEvent).clientX
      const clientY = 'touches' in clientEvent
        ? clientEvent.touches[0]?.clientY ?? 0
        : (clientEvent as MouseEvent).clientY

      const position = screenToFlowPosition({ x: clientX, y: clientY })

      const newId = addNodeAtPosition(sourceId, position)

      // Select the new node
      setSelectedNodes([newId])
      setInspectorNode(newId)
    },
    [screenToFlowPosition, addNodeAtPosition, setSelectedNodes, setInspectorNode]
  )

  // ── Drag-to-reparent ───────────────────────────────────────────────────────

  const handleNodeDragStart = useCallback(
    (_evt: React.MouseEvent, node: Node) => {
      // Root node has no parent, can't be reparented — skip target tracking.
      if (node.data?.level === 0) {
        excludedTargetsRef.current = new Set()
        return
      }
      const excluded = new Set<string>([node.id])
      const stack = [node.id]
      while (stack.length > 0) {
        const id = stack.pop()!
        edges.forEach((e) => {
          if (e.source === id && !excluded.has(e.target)) {
            excluded.add(e.target)
            stack.push(e.target)
          }
        })
      }
      excludedTargetsRef.current = excluded
    },
    [edges]
  )

  const handleNodeDrag = useCallback(
    (_evt: React.MouseEvent, node: Node) => {
      if (excludedTargetsRef.current.size === 0) return
      const intersecting = getIntersectingNodes(node).filter(
        (n) => !excludedTargetsRef.current.has(n.id)
      )
      const target = intersecting[0]?.id ?? null
      if (target !== pendingDropTargetRef.current) {
        pendingDropTargetRef.current = target
        setDropTargetId(target)
      }
    },
    [getIntersectingNodes, setDropTargetId]
  )

  const handleNodeDragStop = useCallback(
    (_evt: React.MouseEvent, node: Node) => {
      const target = pendingDropTargetRef.current
      pendingDropTargetRef.current = null
      excludedTargetsRef.current = new Set()
      setDropTargetId(null)
      if (target) reparentNode(node.id, target)
    },
    [reparentNode, setDropTargetId]
  )

  const isEmptyMap = nodes.length <= 1

  return (
    <div
      className="w-full h-full"
      style={{ background: 'var(--canvas-bg)' }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* Other users' cursors, rendered in flow-space coordinates */}
      <LiveCursors />
      {isEmptyMap && (
        <div className="absolute bottom-28 left-0 right-0 flex justify-center pointer-events-none z-10">
          <div className="text-center select-none">
            <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-muted)' }}>
              Click the root node to select it
            </p>
            <p className="text-xs" style={{ color: 'var(--text-muted)', opacity: 0.7 }}>
              Then press <kbd className="px-1.5 py-0.5 rounded text-[10px] font-mono mx-0.5" style={{ background: 'var(--panel-border)' }}>Tab</kbd> to add a child node
              or drag from a handle to create connected nodes
            </p>
          </div>
        </div>
      )}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectStart={handleConnectStart}
        onConnectEnd={handleConnectEnd}
        onNodeDragStart={handleNodeDragStart}
        onNodeDrag={handleNodeDrag}
        onNodeDragStop={handleNodeDragStop}
        onPaneClick={handlePaneClick}
        onSelectionChange={handleSelectionChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        selectionMode={SelectionMode.Partial}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.2}
        maxZoom={2.5}
        defaultEdgeOptions={{
          type: 'custom',
          style: { strokeWidth: 2.5 },
        }}
        connectionLineType={ConnectionLineType.SimpleBezier}
        connectionLineStyle={{
          strokeWidth: 2.5,
          stroke: '#6366f1',
          strokeDasharray: '6 3',
          opacity: 0.65,
          strokeLinecap: 'round',
        }}
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        elementsSelectable={!readOnly}
        proOptions={{ hideAttribution: true }}
        deleteKeyCode={null}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1.5}
          color={theme === 'dark' ? '#2D2E4A' : '#D4C9A8'}
        />
        <Controls showInteractive={false} />
        {minimapVisible && (
          <MiniMap
            nodeColor={(n) => n.data?.color ?? '#6366f1'}
            nodeStrokeWidth={0}
            pannable
            zoomable
          />
        )}
        {!readOnly && !presentationMode && <NodeAIPopover />}
      </ReactFlow>
    </div>
  )
}
