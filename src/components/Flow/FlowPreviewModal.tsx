import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ReactFlow, {
  ReactFlowProvider,
  Background,
  Controls,
  BackgroundVariant,
  NodeTypes,
  EdgeTypes,
  applyNodeChanges,
  applyEdgeChanges,
  NodeChange,
  EdgeChange,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { X, Loader2, GitBranch, Check, Sparkles } from 'lucide-react'
import { v4 as uuidv4 } from 'uuid'
import { useMindMapStore } from '@/store/mindmapStore'
import { useFlowStore } from '@/store/flowStore'
import { generateFlowFromMap } from '@/services/aiService'
import { createFlow } from '@/services/flowService'
import { ProcessNode } from './ProcessNode'
import { DecisionNode } from './DecisionNode'
import { LabelNode } from './LabelNode'
import { GroupNode } from './GroupNode'
import { BulletListNode } from './BulletListNode'
import { SwimlaneNode } from './SwimlaneNode'
import { FlowCustomEdge } from './FlowEdge'
import { FlowNode, FlowEdge, MindMapExport } from '@/types'

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

interface Props {
  open: boolean
  onClose: () => void
  mapId: string
}

function FlowPreviewInner({ onClose, mapId }: Omit<Props, 'open'>) {
  const { nodes: mapNodes, edges: mapEdges } = useMindMapStore()
  const { addFlowToList } = useFlowStore()

  const [status, setStatus] = useState<'idle' | 'generating' | 'preview' | 'saving'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [flowTitle, setFlowTitle] = useState('Current Understanding')
  const [previewNodes, setPreviewNodes] = useState<FlowNode[]>([])
  const [previewEdges, setPreviewEdges] = useState<FlowEdge[]>([])

  const handleGenerate = useCallback(async () => {
    setStatus('generating')
    setError(null)

    try {
      // Build map context for the AI
      const activeMap = useMindMapStore.getState().activeMap()
      const mapContext: MindMapExport = {
        title: activeMap?.title ?? 'Mind Map',
        nodes: mapNodes.map((n) => ({
          id: n.id,
          label: n.data.label,
          level: n.data.level,
          children: mapEdges
            .filter((e) => e.source === n.id)
            .map((e) => e.target),
          color: n.data.color,
          checked: n.data.checked,
        })),
        edges: mapEdges.map((e) => ({ source: e.source, target: e.target })),
      }

      const result = await generateFlowFromMap(mapContext)
      setFlowTitle(result.title)
      setPreviewNodes(result.nodes)
      setPreviewEdges(result.edges)
      setStatus('preview')
    } catch (err: any) {
      setError(err.message || 'Failed to generate flow. Try again.')
      setStatus('idle')
    }
  }, [mapNodes, mapEdges])

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    setPreviewNodes((nds) => applyNodeChanges(changes, nds) as FlowNode[])
  }, [])

  const handleEdgesChange = useCallback((changes: EdgeChange[]) => {
    setPreviewEdges((eds) => applyEdgeChanges(changes, eds) as FlowEdge[])
  }, [])

  const handleConfirmSave = useCallback(async () => {
    setStatus('saving')
    try {
      const flowId = uuidv4()
      await createFlow(mapId, flowId, flowTitle, previewNodes, previewEdges)
      addFlowToList({
        id: flowId,
        mapId,
        title: flowTitle,
        parentFlowId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to save flow.')
      setStatus('preview')
    }
  }, [mapId, flowTitle, previewNodes, previewEdges, addFlowToList, onClose])

  return (
    <motion.div
      key="flow-preview-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <motion.div
        key="flow-preview-modal"
        initial={{ opacity: 0, scale: 0.94, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 16 }}
        transition={{ type: 'spring', stiffness: 500, damping: 35 }}
        className="w-[90vw] max-w-5xl h-[80vh] rounded-2xl border shadow-2xl flex flex-col overflow-hidden"
        style={{ background: 'var(--panel-bg)', borderColor: 'var(--panel-border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3 border-b shrink-0"
          style={{ borderColor: 'var(--panel-border)' }}
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center">
              <GitBranch size={16} color="white" />
            </div>
            <div>
              <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                {status === 'idle' ? 'Generate Flow Diagram' : status === 'generating' ? 'Generating...' : 'Flow Preview'}
              </h2>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {status === 'idle' && 'AI will analyze your mind map and create a process flow'}
                {status === 'generating' && 'Analyzing mind map context and building flow structure...'}
                {(status === 'preview' || status === 'saving') && 'Drag nodes to rearrange. Edit the title, then confirm to save.'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md transition-colors hover:bg-black/5 dark:hover:bg-white/5"
            style={{ color: 'var(--text-muted)' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 relative overflow-hidden">
          {status === 'idle' && (
            <div className="flex flex-col items-center justify-center h-full gap-4 px-6">
              <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center">
                <Sparkles size={28} className="text-indigo-500" />
              </div>
              <div className="text-center max-w-md">
                <h3 className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                  Ready to generate
                </h3>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  AI will read your mind map nodes and create a structured flow diagram showing
                  the client's current operational flow, systems, and processes.
                </p>
              </div>
              {error && (
                <div className="px-4 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-sm text-red-600 dark:text-red-400 max-w-md text-center">
                  {error}
                </div>
              )}
              <button
                onClick={handleGenerate}
                className="px-6 py-2.5 rounded-xl bg-indigo-500 text-white text-sm font-medium hover:bg-indigo-600 transition-colors flex items-center gap-2"
              >
                <Sparkles size={14} />
                Generate Flow
              </button>
            </div>
          )}

          {status === 'generating' && (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <Loader2 size={32} className="animate-spin text-indigo-500" />
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Analyzing mind map and building flow...
              </p>
            </div>
          )}

          {(status === 'preview' || status === 'saving') && (
            <ReactFlow
              nodes={previewNodes}
              edges={previewEdges}
              onNodesChange={handleNodesChange}
              onEdgesChange={handleEdgesChange}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              defaultEdgeOptions={{ type: 'flow' }}
              fitView
              fitViewOptions={{ padding: 0.3 }}
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
                style={{ opacity: 0.2 }}
              />
              <Controls
                className="!bg-transparent !border-none !shadow-none [&>button]:!bg-[var(--panel-bg)] [&>button]:!border-[var(--panel-border)] [&>button]:!text-[var(--text-secondary)]"
              />
            </ReactFlow>
          )}
        </div>

        {/* Footer — only in preview state */}
        {(status === 'preview' || status === 'saving') && (
          <div
            className="flex items-center gap-3 px-5 py-3 border-t shrink-0"
            style={{ borderColor: 'var(--panel-border)' }}
          >
            <input
              value={flowTitle}
              onChange={(e) => setFlowTitle(e.target.value)}
              placeholder="Flow title..."
              className="flex-1 px-3 py-2 rounded-lg border text-sm outline-none"
              style={{
                background: 'var(--canvas-bg)',
                borderColor: 'var(--panel-border)',
                color: 'var(--text-primary)',
              }}
            />
            {error && (
              <span className="text-xs text-red-500">{error}</span>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg border text-sm font-medium transition-colors hover:bg-gray-50 dark:hover:bg-gray-700"
              style={{ borderColor: 'var(--panel-border)', color: 'var(--text-secondary)' }}
            >
              Discard
            </button>
            <button
              onClick={handleConfirmSave}
              disabled={!flowTitle.trim() || status === 'saving'}
              className="px-5 py-2 rounded-lg bg-indigo-500 text-white text-sm font-medium hover:bg-indigo-600 transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {status === 'saving'
                ? <><Loader2 size={14} className="animate-spin" /> Saving...</>
                : <><Check size={14} /> Confirm & Save</>
              }
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}

export function FlowPreviewModal({ open, onClose, mapId }: Props) {
  return (
    <AnimatePresence>
      {open && (
        <ReactFlowProvider>
          <FlowPreviewInner onClose={onClose} mapId={mapId} />
        </ReactFlowProvider>
      )}
    </AnimatePresence>
  )
}
