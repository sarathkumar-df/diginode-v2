import { useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, X } from 'lucide-react'
import { useUIStore } from '@/store/uiStore'
import { useMindMapStore } from '@/store/mindmapStore'
import { useReactFlow } from 'reactflow'

export function SearchPanel() {
  const { searchOpen, searchQuery, searchResults, toggleSearch, setSearchQuery, setSearchResults } = useUIStore()
  const { nodes } = useMindMapStore()
  const { setCenter } = useReactFlow()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (searchOpen) inputRef.current?.focus()
  }, [searchOpen])

  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return }
    const q = searchQuery.toLowerCase()
    setSearchResults(
      nodes
        .filter((n) => n.data.label.toLowerCase().includes(q))
        .map((n, i) => ({ nodeId: n.id, label: n.data.label, matchIndex: i }))
    )
  }, [searchQuery, nodes, setSearchResults])

  const handleSelect = useCallback((nodeId: string) => {
    const node = nodes.find((n) => n.id === nodeId)
    if (node) {
      setCenter(node.position.x, node.position.y, { duration: 500, zoom: 1.3 })
      useUIStore.getState().setSelectedNodes([nodeId])
      useUIStore.getState().setInspectorNode(nodeId)
    }
    toggleSearch()
  }, [nodes, setCenter, toggleSearch])

  return (
    <AnimatePresence>
      {searchOpen && (
        <>
          <motion.div
            key="search-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50"
            onClick={toggleSearch}
          />
          <motion.div
            key="search-panel"
            initial={{ opacity: 0, y: -12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute top-16 left-1/2 -translate-x-1/2 z-50 w-96 rounded-2xl border shadow-lg overflow-hidden"
            style={{ background: 'var(--panel-bg)', borderColor: 'var(--panel-border)' }}
          >
            <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: 'var(--panel-border)' }}>
              <Search size={16} style={{ color: 'var(--text-muted)' }} />
              <input
                ref={inputRef}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && toggleSearch()}
                placeholder="Search nodes..."
                className="flex-1 bg-transparent outline-none text-sm"
                style={{ color: 'var(--text-primary)' }}
              />
              <button onClick={toggleSearch} style={{ color: 'var(--text-muted)' }}><X size={14} /></button>
            </div>

            {searchResults.length > 0 ? (
              <div className="max-h-64 overflow-y-auto py-1">
                {searchResults.map((result) => {
                  const q = searchQuery.toLowerCase()
                  const label = result.label
                  const idx = label.toLowerCase().indexOf(q)
                  return (
                    <button
                      key={result.nodeId}
                      onClick={() => handleSelect(result.nodeId)}
                      className="w-full px-4 py-2.5 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {idx >= 0 ? (
                        <>
                          {label.slice(0, idx)}
                          <mark className="bg-yellow-200 dark:bg-yellow-700 text-inherit rounded px-0.5">
                            {label.slice(idx, idx + q.length)}
                          </mark>
                          {label.slice(idx + q.length)}
                        </>
                      ) : label}
                    </button>
                  )
                })}
              </div>
            ) : searchQuery.trim() ? (
              <div className="px-4 py-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                No nodes found for "{searchQuery}"
              </div>
            ) : null}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
