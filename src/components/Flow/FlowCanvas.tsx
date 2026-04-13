import { useCallback, useState } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  NodeTypes,
  EdgeTypes,
  BackgroundVariant,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { useFlowStore } from '@/store/flowStore'
import { ProcessNode } from './ProcessNode'
import { DecisionNode } from './DecisionNode'
import { LabelNode } from './LabelNode'
import { GroupNode } from './GroupNode'
import { BulletListNode } from './BulletListNode'
import { SwimlaneNode } from './SwimlaneNode'
import { FlowCustomEdge } from './FlowEdge'
import { NodeContextMenu } from './NodeContextMenu'

const nodeTypes: NodeTypes = {
  process: ProcessNode,
  decision: DecisionNode,
  label: LabelNode,
  group: GroupNode,
  bulletList: BulletListNode,
  swimlane: SwimlaneNode,
}

const edgeTypes: EdgeTypes = {
  flow: FlowCustomEdge,
}

const defaultEdgeOptions = {
  type: 'flow',
  animated: false,
}

interface ContextMenuState {
  nodeId: string
  x: number
  y: number
}

export function FlowCanvas() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect } = useFlowStore()
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const onNodeContextMenu = useCallback((event: React.MouseEvent, node: { id: string }) => {
    event.preventDefault()
    setContextMenu({ nodeId: node.id, x: event.clientX, y: event.clientY })
  }, [])

  const onPaneClick = useCallback(() => {
    setContextMenu(null)
  }, [])

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDragOver={onDragOver}
        onNodeContextMenu={onNodeContextMenu}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        deleteKeyCode={['Backspace', 'Delete']}
        snapToGrid
        snapGrid={[16, 16]}
        minZoom={0.1}
        maxZoom={2}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="var(--text-muted)"
          style={{ opacity: 0.3 }}
        />
        <Controls
          className="!bg-transparent !border-none !shadow-none [&>button]:!bg-[var(--panel-bg)] [&>button]:!border-[var(--panel-border)] [&>button]:!text-[var(--text-secondary)]"
        />
        <MiniMap
          nodeColor={(node) => node.data?.color || '#6366f1'}
          maskColor="rgba(0,0,0,0.1)"
          className="!bg-[var(--panel-bg)] !border-[var(--panel-border)]"
        />
      </ReactFlow>

      {contextMenu && (
        <NodeContextMenu
          nodeId={contextMenu.nodeId}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}
