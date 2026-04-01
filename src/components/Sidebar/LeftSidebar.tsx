import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Trash2, Edit2, Check, X, Loader2 } from 'lucide-react'
import { useMindMapStore, createDefaultMapData } from '@/store/mindmapStore'
import { useUIStore } from '@/store/uiStore'
import { createMap, deleteMap, renameMap } from '@/services/mapService'
import { MapMeta } from '@/types'

export function LeftSidebar() {
  const { leftPanelOpen } = useUIStore()
  const { maps, activeMapId, addMapToList, updateMapMeta, removeMap } = useMindMapStore()
  const navigate = useNavigate()
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
    if (!confirm('Delete this map? This cannot be undone.')) return
    await deleteMap(id)
    removeMap(id)
    if (activeMapId === id) navigate('/dashboard', { replace: true })
  }, [activeMapId, removeMap, navigate])

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
    <AnimatePresence>
      {leftPanelOpen && (
        <motion.div
          key="left-panel"
          initial={{ x: -280, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -280, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 35 }}
          className="absolute top-0 left-0 h-full w-60 z-40 flex flex-col border-r"
          style={{
            background: 'var(--panel-bg)',
            borderColor: 'var(--panel-border)',
            boxShadow: 'var(--panel-shadow)',
          }}
        >
          <div
            className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0"
            style={{ borderColor: 'var(--panel-border)' }}
          >
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              My Maps
            </h2>
            <button
              onClick={handleCreate}
              disabled={creating}
              className="w-7 h-7 rounded-lg flex items-center justify-center bg-indigo-500 text-white hover:bg-indigo-600 transition-colors disabled:opacity-60"
            >
              {creating ? <Loader2 size={13} className="animate-spin" /> : <Plus size={14} />}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto py-2">
            {maps.map((map) => (
              <div
                key={map.id}
                className={`mx-2 mb-1 rounded-lg flex items-center gap-2 px-3 py-2 cursor-pointer group transition-colors ${
                  map.id === activeMapId
                    ? 'bg-indigo-50 dark:bg-indigo-900/30'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                }`}
                onClick={() => navigate(`/map/${map.id}`)}
              >
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: map.rootColor ?? '#6366f1' }}
                />

                {editingId === map.id ? (
                  <div className="flex-1 flex items-center gap-1">
                    <input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') confirmEdit()
                        if (e.key === 'Escape') setEditingId(null)
                        e.stopPropagation()
                      }}
                      autoFocus
                      className="flex-1 text-sm bg-transparent outline-none border-b"
                      style={{ color: 'var(--text-primary)', borderColor: '#6366f1' }}
                    />
                    <button onClick={confirmEdit} className="text-green-500"><Check size={12} /></button>
                    <button onClick={() => setEditingId(null)} className="text-red-400"><X size={12} /></button>
                  </div>
                ) : (
                  <>
                    <span
                      className="flex-1 text-sm truncate"
                      style={{
                        color: map.id === activeMapId ? '#6366f1' : 'var(--text-primary)',
                        fontWeight: map.id === activeMapId ? 600 : 400,
                      }}
                    >
                      {map.title}
                    </span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => startEdit(map.id, map.title, e)}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                      >
                        <Edit2 size={11} />
                      </button>
                      <button
                        onClick={(e) => handleDelete(map.id, e)}
                        className="text-gray-400 hover:text-red-500"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>

          <div
            className="px-4 py-3 border-t text-xs"
            style={{ borderColor: 'var(--panel-border)', color: 'var(--text-muted)' }}
          >
            {maps.length} map{maps.length !== 1 ? 's' : ''}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
