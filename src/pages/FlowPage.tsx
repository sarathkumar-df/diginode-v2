import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ReactFlowProvider, useReactFlow } from 'reactflow'
import { ArrowLeft, Loader2, Edit2, Check, X, Copy, Trash2, Download, Image, FileCode, FileText, Maximize } from 'lucide-react'
import { v4 as uuidv4 } from 'uuid'
import { FlowCanvas } from '@/components/Flow/FlowCanvas'
import { useFlowStore } from '@/store/flowStore'
import { useUIStore } from '@/store/uiStore'
import { fetchFlow, saveFlow, renameFlow, duplicateFlow, deleteFlow } from '@/services/flowService'
import { exportFlowToPng, exportFlowToSvg, exportFlowToPdf } from '@/utils/exportUtils'
import { useConfirm } from '@/components/UI/ConfirmModal'
import { UserMenu } from '@/components/Layout/UserMenu'

const SAVE_DEBOUNCE = 2000

function FlowExportMenu({ title }: { title: string }) {
  const [open, setOpen] = useState(false)

  const items = [
    { icon: Image, label: 'PNG image', action: () => { exportFlowToPng(title); setOpen(false) } },
    { icon: FileCode, label: 'SVG file', action: () => { exportFlowToSvg(title); setOpen(false) } },
    { icon: FileText, label: 'PDF (print)', action: () => { exportFlowToPdf(title); setOpen(false) } },
  ]

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors hover:bg-black/5 dark:hover:bg-white/5"
        style={{ borderColor: 'var(--panel-border)', color: 'var(--text-secondary)' }}
        title="Export flow diagram"
      >
        <Download size={12} />
        Export
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute top-full right-0 mt-1.5 rounded-xl border overflow-hidden z-50 shadow-xl"
            style={{ background: 'var(--panel-bg)', borderColor: 'var(--panel-border)', minWidth: 150 }}
          >
            {items.map(({ icon: Icon, label, action }) => (
              <button
                key={label}
                onClick={action}
                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs transition-colors hover:bg-gray-50 dark:hover:bg-gray-700"
                style={{ color: 'var(--text-primary)' }}
              >
                <Icon size={13} style={{ color: 'var(--text-muted)' }} />
                {label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function FlowPageInner() {
  const { mapId, flowId } = useParams<{ mapId: string; flowId: string }>()
  const navigate = useNavigate()
  const confirm = useConfirm()
  const { theme } = useUIStore()
  const { fitView } = useReactFlow()
  const { nodes, edges, loadFlow, clearFlow, addFlowToList, removeFlowFromList, updateFlowTitle } = useFlowStore()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [flowTitle, setFlowTitle] = useState('')
  const [parentFlowTitle, setParentFlowTitle] = useState<string | null>(null)
  const [parentFlowId, setParentFlowId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const titleInputRef = useRef<HTMLInputElement>(null)

  const isDirtyRef = useRef(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>()

  // Undo/Redo keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey
      if (!meta) return

      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        useFlowStore.getState().undo()
      } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault()
        useFlowStore.getState().redo()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  // Load flow data
  useEffect(() => {
    if (!mapId || !flowId) {
      navigate('/dashboard', { replace: true })
      return
    }
    let cancelled = false

    async function load() {
      setLoading(true)
      setError('')
      isDirtyRef.current = false
      try {
        const data = await fetchFlow(mapId!, flowId!)
        if (!cancelled) {
          loadFlow({ mapId: data.mapId, flowId: data.id, nodes: data.nodes, edges: data.edges })
          setFlowTitle(data.title)
          setParentFlowId(data.parentFlowId)

          // Fetch parent flow title if this is a derivative
          if (data.parentFlowId) {
            try {
              const parent = await fetchFlow(mapId!, data.parentFlowId)
              if (!cancelled) setParentFlowTitle(parent.title)
            } catch {
              if (!cancelled) setParentFlowTitle('Deleted flow')
            }
          }
        }
      } catch {
        if (!cancelled) {
          setError('Flow not found or you do not have access.')
          setTimeout(() => navigate(`/map/${mapId}`, { replace: true }), 2000)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
      clearFlow()
    }
  }, [mapId, flowId])

  // Auto-save on changes
  useEffect(() => {
    if (!isDirtyRef.current) { isDirtyRef.current = true; return }
    if (!mapId || !flowId) return
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveFlow(mapId, flowId, nodes, edges)
    }, SAVE_DEBOUNCE)
    return () => clearTimeout(saveTimerRef.current)
  }, [nodes, edges])

  const startTitleEdit = useCallback(() => {
    setTitleDraft(flowTitle)
    setEditingTitle(true)
    setTimeout(() => titleInputRef.current?.select(), 0)
  }, [flowTitle])

  const confirmTitleEdit = useCallback(async () => {
    if (!mapId || !flowId || !titleDraft.trim()) { setEditingTitle(false); return }
    const newTitle = titleDraft.trim()
    setFlowTitle(newTitle)
    setEditingTitle(false)
    updateFlowTitle(flowId, newTitle)
    await renameFlow(mapId, flowId, newTitle)
  }, [mapId, flowId, titleDraft, updateFlowTitle])

  const handleDerive = useCallback(async () => {
    if (!mapId || !flowId) return
    const newId = uuidv4()
    const newTitle = `${flowTitle} — Derivative`
    try {
      await duplicateFlow(mapId, flowId, newId, newTitle)
      addFlowToList({
        id: newId,
        mapId,
        title: newTitle,
        parentFlowId: flowId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      navigate(`/map/${mapId}/flow/${newId}`)
    } catch {
      // silent
    }
  }, [mapId, flowId, flowTitle, addFlowToList, navigate])

  const handleDelete = useCallback(async () => {
    if (!mapId || !flowId) return
    const ok = await confirm({
      title: `Delete "${flowTitle}"?`,
      description: 'This flow diagram will be permanently deleted. This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    try {
      await deleteFlow(mapId, flowId)
      removeFlowFromList(flowId)
      navigate(`/map/${mapId}`, { replace: true })
    } catch {
      // silent
    }
  }, [mapId, flowId, flowTitle, confirm, removeFlowFromList, navigate])

  if (loading) {
    return (
      <div className="w-screen h-screen flex items-center justify-center" style={{ background: 'var(--canvas-bg)' }}>
        <Loader2 size={28} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="w-screen h-screen flex items-center justify-center" style={{ background: 'var(--canvas-bg)' }}>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{error}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col w-screen h-screen overflow-hidden" style={{ background: 'var(--canvas-bg)' }}>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-2.5 border-b shrink-0"
        style={{ background: 'var(--panel-bg)', borderColor: 'var(--panel-border)' }}
      >
        <button
          onClick={() => navigate(`/map/${mapId}`)}
          className="p-1.5 rounded-md transition-colors hover:bg-black/5 dark:hover:bg-white/5"
          style={{ color: 'var(--text-secondary)' }}
          title="Back to mind map"
        >
          <ArrowLeft size={16} />
        </button>

        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0" style={{ background: '#6366f1', color: '#fff' }}>
            Flow
          </span>

          {editingTitle ? (
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <input
                ref={titleInputRef}
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') confirmTitleEdit()
                  if (e.key === 'Escape') setEditingTitle(false)
                }}
                autoFocus
                className="flex-1 text-sm font-medium bg-transparent outline-none border-b min-w-0"
                style={{ color: 'var(--text-primary)', borderColor: '#6366f1' }}
              />
              <button onClick={confirmTitleEdit} className="text-green-500 p-0.5"><Check size={13} /></button>
              <button onClick={() => setEditingTitle(false)} className="text-red-400 p-0.5"><X size={13} /></button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 min-w-0 group">
              <h1
                className="text-sm font-medium truncate cursor-pointer"
                style={{ color: 'var(--text-primary)' }}
                onClick={startTitleEdit}
                title="Click to rename"
              >
                {flowTitle}
              </h1>
              <button
                onClick={startTitleEdit}
                className="opacity-0 group-hover:opacity-60 hover:!opacity-100 p-0.5 rounded transition-opacity"
                style={{ color: 'var(--text-muted)' }}
              >
                <Edit2 size={11} />
              </button>
            </div>
          )}
        </div>

        {/* Derivation breadcrumb */}
        {parentFlowId && parentFlowTitle && (
          <button
            onClick={() => navigate(`/map/${mapId}/flow/${parentFlowId}`)}
            className="text-[10px] px-2 py-1 rounded-md border transition-colors hover:bg-black/5 dark:hover:bg-white/5 flex-shrink-0"
            style={{ borderColor: 'var(--panel-border)', color: 'var(--text-muted)' }}
            title="Go to parent flow"
          >
            Derived from: {parentFlowTitle}
          </button>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => fitView({ duration: 400, padding: 0.2 })}
            className="p-1.5 rounded-md transition-colors hover:bg-black/5 dark:hover:bg-white/5"
            style={{ color: 'var(--text-muted)' }}
            title="Fit to view"
          >
            <Maximize size={14} />
          </button>

          <div className="w-px h-5 mx-0.5" style={{ background: 'var(--panel-border)' }} />

          <FlowExportMenu title={flowTitle} />

          <div className="w-px h-5 mx-0.5" style={{ background: 'var(--panel-border)' }} />

          <button
            onClick={handleDerive}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors hover:bg-black/5 dark:hover:bg-white/5"
            style={{ borderColor: 'var(--panel-border)', color: 'var(--text-secondary)' }}
            title="Create a derivative copy of this flow"
          >
            <Copy size={12} />
            Derive
          </button>
          <button
            onClick={handleDelete}
            className="p-1.5 rounded-md transition-colors hover:bg-red-50 dark:hover:bg-red-900/20"
            style={{ color: 'var(--text-muted)' }}
            title="Delete flow"
          >
            <Trash2 size={14} />
          </button>

          <div className="w-px h-5 mx-0.5" style={{ background: 'var(--panel-border)' }} />

          <UserMenu align="right" />
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative overflow-hidden">
        <FlowCanvas />
      </div>
    </div>
  )
}

export default function FlowPage() {
  return (
    <ReactFlowProvider>
      <FlowPageInner />
    </ReactFlowProvider>
  )
}
