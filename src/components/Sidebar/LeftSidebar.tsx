import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Plus, Trash2, Edit2, Check, X, Loader2,
  Layers, Map as MapIcon, ChevronLeft, ChevronRight, PanelLeftClose, PanelLeftOpen,
} from 'lucide-react'
import { useMindMapStore, createDefaultMapData } from '@/store/mindmapStore'
import { createMap, deleteMap, renameMap } from '@/services/mapService'
import { useConfirm } from '@/components/UI/ConfirmModal'
import { FlowsPanel } from '@/components/Flow/FlowsPanel'
import { MapMeta } from '@/types'

interface Props {
  collapsed: boolean
  onToggle: () => void
}

export function LeftSidebar({ collapsed, onToggle }: Props) {
  const { maps, activeMapId, addMapToList, updateMapMeta, removeMap } = useMindMapStore()
  const navigate = useNavigate()
  const confirm = useConfirm()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [creating, setCreating] = useState(false)

  const handleCreate = useCallback(async () => {
    if (creating) return
    setCreating(true)
    try {
      const { id, title, nodes, edges } = createDefaultMapData()
      await createMap(id, title, nodes, edges)
      const meta: MapMeta = {
        id,
        title,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        rootColor: '#6366f1',
      }
      addMapToList(meta)
      navigate(`/map/${id}`)
    } finally {
      setCreating(false)
    }
  }, [creating, addMapToList, navigate])

  const handleDelete = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const ok = await confirm({
      title: 'Delete map?',
      description: 'This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    await deleteMap(id)
    removeMap(id)
    if (activeMapId === id) navigate('/dashboard', { replace: true })
  }, [activeMapId, removeMap, navigate, confirm])

  const startEdit = useCallback((id: string, title: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingId(id)
    setEditTitle(title)
  }, [])

  const confirmEdit = useCallback(async () => {
    if (!editingId || !editTitle.trim()) { setEditingId(null); return }
    await renameMap(editingId, editTitle.trim())
    updateMapMeta(editingId, editTitle.trim())
    setEditingId(null)
  }, [editingId, editTitle, updateMapMeta])

  return (
    <motion.aside
      animate={{ width: collapsed ? 56 : 220 }}
      transition={{ type: 'spring', stiffness: 400, damping: 35 }}
      className="flex flex-col h-full flex-shrink-0 border-r overflow-hidden"
      style={{ background: 'var(--panel-bg)', borderColor: 'var(--panel-border)' }}
    >
      {/* Brand row */}
      <div className="flex items-center h-14 flex-shrink-0 border-b px-3.5" style={{ borderColor: 'var(--panel-border)' }}>
        <div className="w-7 h-7 rounded-lg bg-indigo-500 flex items-center justify-center flex-shrink-0 shadow-sm">
          <Layers size={14} color="white" />
        </div>
        <AnimatePresence>
          {!collapsed && (
            <motion.span
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.15 }}
              className="ml-2.5 font-bold text-sm tracking-tight whitespace-nowrap overflow-hidden"
              style={{ color: 'var(--text-primary)' }}
            >
              DigiNode
            </motion.span>
          )}
        </AnimatePresence>
        <div className="flex-1" />
        <button
          onClick={onToggle}
          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
          style={{ color: 'var(--text-muted)' }}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
        </button>
      </div>

      {/* Maps header */}
      <div className="flex items-center h-10 px-3.5 flex-shrink-0 gap-2">
        <MapIcon size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <AnimatePresence>
          {!collapsed && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.1 }}
              className="text-xs font-semibold uppercase tracking-widest flex-1 whitespace-nowrap overflow-hidden"
              style={{ color: 'var(--text-muted)' }}
            >
              My Maps
            </motion.span>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {!collapsed && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleCreate}
              disabled={creating}
              className="w-6 h-6 rounded-md flex items-center justify-center bg-indigo-500 text-white hover:bg-indigo-600 transition-colors disabled:opacity-60 flex-shrink-0"
            >
              {creating ? <Loader2 size={11} className="animate-spin" /> : <Plus size={12} />}
            </motion.button>
          )}
        </AnimatePresence>
        {collapsed && (
          <button
            onClick={handleCreate}
            disabled={creating}
            title="New map"
            className="w-7 h-7 rounded-md flex items-center justify-center bg-indigo-500 text-white hover:bg-indigo-600 transition-colors disabled:opacity-60"
          >
            {creating ? <Loader2 size={11} className="animate-spin" /> : <Plus size={12} />}
          </button>
        )}
      </div>

      {/* Maps list */}
      <div className="flex-1 overflow-y-auto py-1">
        {maps.map((map) => {
          const isActive = map.id === activeMapId
          return (
            <div
              key={map.id}
              title={collapsed ? map.title : undefined}
              className="mx-2 mb-0.5 rounded-xl flex items-center gap-2 px-2.5 py-2 cursor-pointer group transition-all duration-150"
              style={{
                background: isActive ? 'var(--brand-light)' : 'transparent',
              }}
              onClick={() => navigate(`/map/${map.id}`)}
              onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'var(--canvas-bg)' }}
              onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
            >
              <div
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: map.rootColor ?? '#6366f1' }}
              />
              <AnimatePresence>
                {!collapsed && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.1 }}
                    className="flex-1 flex items-center gap-1 min-w-0"
                  >
                    {editingId === map.id ? (
                      <>
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
                        <button onClick={confirmEdit} className="text-green-500 flex-shrink-0"><Check size={11} /></button>
                        <button onClick={() => setEditingId(null)} className="text-red-400 flex-shrink-0"><X size={11} /></button>
                      </>
                    ) : (
                      <>
                        <span
                          className="flex-1 text-xs truncate"
                          style={{
                            color: isActive ? 'var(--brand)' : 'var(--text-primary)',
                            fontWeight: isActive ? 600 : 400,
                          }}
                        >
                          {map.title}
                        </span>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                          <button
                            onClick={(e) => startEdit(map.id, map.title, e)}
                            className="w-5 h-5 rounded flex items-center justify-center transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            <Edit2 size={10} />
                          </button>
                          <button
                            onClick={(e) => handleDelete(map.id, e)}
                            className="w-5 h-5 rounded flex items-center justify-center transition-colors hover:bg-red-50 dark:hover:bg-red-900/20"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            <Trash2 size={10} />
                          </button>
                        </div>
                      </>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })}
      </div>

      {/* Flows section — shown when a map is active */}
      {!collapsed && activeMapId && (
        <div className="flex-shrink-0 border-t" style={{ borderColor: 'var(--panel-border)' }}>
          <FlowsPanel mapId={activeMapId} />
        </div>
      )}

      {/* Footer */}
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="px-4 py-3 border-t text-[11px] flex-shrink-0"
            style={{ borderColor: 'var(--panel-border)', color: 'var(--text-muted)' }}
          >
            {maps.length} map{maps.length !== 1 ? 's' : ''}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.aside>
  )
}
