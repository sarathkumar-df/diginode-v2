import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { GitBranch, Trash2, Loader2, Edit2, Check, X, Copy } from 'lucide-react'
import { v4 as uuidv4 } from 'uuid'
import { useFlowStore } from '@/store/flowStore'
import { listFlows, deleteFlow, renameFlow, duplicateFlow } from '@/services/flowService'
import { useConfirm } from '@/components/UI/ConfirmModal'
import { FlowMeta } from '@/types'

interface FlowsPanelProps {
  mapId: string
}

export function FlowsPanel({ mapId }: FlowsPanelProps) {
  const navigate = useNavigate()
  const confirm = useConfirm()
  const { flows, setFlows, removeFlowFromList, addFlowToList, updateFlowTitle } = useFlowStore()
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const data = await listFlows(mapId)
        if (!cancelled) setFlows(data)
      } catch {
        // silent
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [mapId, setFlows])

  const handleDelete = useCallback(async (e: React.MouseEvent, flow: FlowMeta) => {
    e.stopPropagation()
    const ok = await confirm({
      title: `Delete "${flow.title}"?`,
      description: 'This flow diagram will be permanently deleted. This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    try {
      await deleteFlow(mapId, flow.id)
      removeFlowFromList(flow.id)
    } catch {
      // silent
    }
  }, [mapId, removeFlowFromList, confirm])

  const startEdit = useCallback((e: React.MouseEvent, flow: FlowMeta) => {
    e.stopPropagation()
    setEditingId(flow.id)
    setEditTitle(flow.title)
  }, [])

  const confirmEdit = useCallback(async () => {
    if (!editingId || !editTitle.trim()) { setEditingId(null); return }
    try {
      await renameFlow(mapId, editingId, editTitle.trim())
      updateFlowTitle(editingId, editTitle.trim())
    } catch {
      // silent
    }
    setEditingId(null)
  }, [mapId, editingId, editTitle, updateFlowTitle])

  const handleDerive = useCallback(async (e: React.MouseEvent, flow: FlowMeta) => {
    e.stopPropagation()
    const newId = uuidv4()
    const newTitle = `${flow.title} — Derivative`
    try {
      await duplicateFlow(mapId, flow.id, newId, newTitle)
      addFlowToList({
        id: newId,
        mapId,
        title: newTitle,
        parentFlowId: flow.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      navigate(`/map/${mapId}/flow/${newId}`)
    } catch {
      // silent
    }
  }, [mapId, addFlowToList, navigate])

  const handleOpenFlow = (flowId: string) => {
    navigate(`/map/${mapId}/flow/${flowId}`)
  }

  // Helper: find parent flow title
  const getParentTitle = (parentId: string | null) => {
    if (!parentId) return null
    return flows.find((f) => f.id === parentId)?.title ?? 'Unknown'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 size={18} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
      </div>
    )
  }

  return (
    <div className="px-3 py-2">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <GitBranch size={14} style={{ color: 'var(--text-muted)' }} />
          <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            Flow Diagrams
          </span>
        </div>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'var(--panel-border)', color: 'var(--text-muted)' }}>
          {flows.length}
        </span>
      </div>

      {flows.length === 0 ? (
        <div
          className="text-center py-6 text-xs rounded-lg border border-dashed"
          style={{ borderColor: 'var(--panel-border)', color: 'var(--text-muted)' }}
        >
          <GitBranch size={20} className="mx-auto mb-2 opacity-40" />
          <p>No flow diagrams yet</p>
          <p className="mt-1 opacity-70">Generate one from your mind map using AI</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {flows.map((flow) => (
            <div
              key={flow.id}
              onClick={() => handleOpenFlow(flow.id)}
              className="w-full text-left px-3 py-2.5 rounded-lg text-xs transition-colors group cursor-pointer"
              style={{ background: 'var(--panel-bg)', border: '1px solid var(--panel-border)' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--panel-border)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--panel-bg)' }}
            >
              {editingId === flow.id ? (
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') confirmEdit()
                      if (e.key === 'Escape') setEditingId(null)
                      e.stopPropagation()
                    }}
                    autoFocus
                    className="flex-1 text-xs bg-transparent outline-none border-b min-w-0"
                    style={{ color: 'var(--text-primary)', borderColor: '#6366f1' }}
                  />
                  <button onClick={confirmEdit} className="text-green-500 flex-shrink-0 p-0.5"><Check size={11} /></button>
                  <button onClick={() => setEditingId(null)} className="text-red-400 flex-shrink-0 p-0.5"><X size={11} /></button>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                      {flow.title}
                    </div>
                    <div className="mt-0.5 opacity-60" style={{ color: 'var(--text-muted)' }}>
                      {new Date(flow.updatedAt).toLocaleDateString()}
                      {flow.parentFlowId && (
                        <span> · From: {getParentTitle(flow.parentFlowId)}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button
                      onClick={(e) => startEdit(e, flow)}
                      className="w-5 h-5 rounded flex items-center justify-center transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
                      style={{ color: 'var(--text-muted)' }}
                      title="Rename"
                    >
                      <Edit2 size={10} />
                    </button>
                    <button
                      onClick={(e) => handleDerive(e, flow)}
                      className="w-5 h-5 rounded flex items-center justify-center transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
                      style={{ color: 'var(--text-muted)' }}
                      title="Create derivative"
                    >
                      <Copy size={10} />
                    </button>
                    <button
                      onClick={(e) => handleDelete(e, flow)}
                      className="w-5 h-5 rounded flex items-center justify-center transition-colors hover:bg-red-50 dark:hover:bg-red-900/20"
                      style={{ color: 'var(--text-muted)' }}
                      title="Delete"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
