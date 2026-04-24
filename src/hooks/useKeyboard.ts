import { useEffect, useCallback } from 'react'
import { useMindMapStore } from '@/store/mindmapStore'
import { useUIStore } from '@/store/uiStore'
import { useReactFlow } from 'reactflow'

export function useKeyboard() {
  const {
    addNode,
    addSiblingNode,
    deleteNode,
    deleteEdges,
    undo,
    redo,
  } = useMindMapStore()

  const {
    selectedNodeIds,
    selectedEdgeIds,
    toggleSearch,
    toggleFocusMode,
  } = useUIStore()

  const { fitView } = useReactFlow()

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const isEditing =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable

      const meta = e.metaKey || e.ctrlKey

      // Global shortcuts (work even while editing)
      if (meta && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
        return
      }
      if (meta && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault()
        redo()
        return
      }

      // Don't intercept if user is typing in an input
      if (isEditing) return

      const selectedId = selectedNodeIds[0]

      switch (e.key) {
        case 'Tab':
          e.preventDefault()
          if (selectedId) addNode(selectedId)
          break

        case 'Enter':
          e.preventDefault()
          if (selectedId) addSiblingNode(selectedId)
          break

        case 'Backspace':
        case 'Delete':
          e.preventDefault()
          if (selectedEdgeIds.length > 0) {
            deleteEdges(selectedEdgeIds)
            useUIStore.getState().setSelectedEdges([])
          } else if (selectedId) {
            deleteNode(selectedId)
          }
          break

        case 'f':
        case 'F':
          if (!meta) {
            e.preventDefault()
            toggleFocusMode()
          }
          break

        case 'Escape':
          useUIStore.getState().clearSelection()
          if (useUIStore.getState().focusMode) toggleFocusMode()
          break
      }

      if (meta) {
        switch (e.key) {
          case 'f':
            e.preventDefault()
            toggleSearch()
            break

          case '0':
            e.preventDefault()
            fitView({ duration: 400 })
            break

          case 'k':
            if (selectedNodeIds.length === 1) {
              e.preventDefault()
              window.dispatchEvent(new Event('digo:focus-ai-popover'))
            }
            break
        }
      }
    },
    [selectedNodeIds, selectedEdgeIds, addNode, addSiblingNode, deleteNode, deleteEdges, undo, redo, toggleSearch, toggleFocusMode, fitView]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
}
