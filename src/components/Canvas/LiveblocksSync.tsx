/**
 * LiveblocksSync — invisible component that bridges Zustand ↔ Liveblocks storage.
 *
 * Strategy:
 *  • On first storage load: if the room already has data (another user is in it),
 *    apply it to Zustand so this client sees the live state.
 *  • On every Zustand change: push updated nodes/edges to Liveblocks (150 ms debounce).
 *  • On every remote storage change: apply it to Zustand.
 *  • Loop prevention: set lastSyncedRef BEFORE applying remote data to Zustand, so
 *    the subsequent "Zustand changed" effect sees no diff and skips the push.
 */
import { useRef, useEffect } from 'react'
import { LiveList, LiveObject } from '@liveblocks/client'
import { useMindMapStore } from '@/store/mindmapStore'
import { useStorage, useMutation } from '@/liveblocks.config'
import { MindMapNode, MindMapEdge } from '@/types'

interface Props {
  mapId: string
}

export function LiveblocksSync({ mapId }: Props) {
  const { nodes, edges, loadMap } = useMindMapStore()

  // `any` storage — safe because nodes/edges are valid JSON at runtime
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const liveNodes: any = useStorage((root: any) => root.nodes)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const liveEdges: any = useStorage((root: any) => root.edges)

  // Mutation: replace entire nodes + edges lists in-place (set/push/delete)
  const syncToLive = useMutation(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ({ storage }: any, newNodes: MindMapNode[], newEdges: MindMapEdge[]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nodesList: any = storage.get('nodes')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const edgesList: any = storage.get('edges')

      for (let i = 0; i < newNodes.length; i++) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const obj = new LiveObject({ ...newNodes[i] } as any)
        if (i < nodesList.length) {
          nodesList.set(i, obj)
        } else {
          nodesList.push(obj)
        }
      }
      while (nodesList.length > newNodes.length) {
        nodesList.delete(nodesList.length - 1)
      }

      for (let i = 0; i < newEdges.length; i++) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const obj = new LiveObject({ ...newEdges[i] } as any)
        if (i < edgesList.length) {
          edgesList.set(i, obj)
        } else {
          edgesList.push(obj)
        }
      }
      while (edgesList.length > newEdges.length) {
        edgesList.delete(edgesList.length - 1)
      }
    },
    []
  )

  // Refs tracking last synced state (prevents push/pull loops)
  const lastSyncedNodesRef = useRef('')
  const lastSyncedEdgesRef = useRef('')
  const storageLoadedRef = useRef(false)
  const syncTimerRef = useRef<ReturnType<typeof setTimeout>>()

  // ── Liveblocks → Zustand ────────────────────────────────────────────────────
  useEffect(() => {
    if (!liveNodes || !liveEdges) return

    // Convert immutable Liveblocks snapshot to plain mutable arrays
    const nodesArr = JSON.parse(JSON.stringify([...liveNodes])) as MindMapNode[]
    const edgesArr = JSON.parse(JSON.stringify([...liveEdges])) as MindMapEdge[]
    const nodesJson = JSON.stringify(nodesArr)
    const edgesJson = JSON.stringify(edgesArr)

    if (!storageLoadedRef.current) {
      // First time storage is ready — seed lastSynced and check for live divergence
      storageLoadedRef.current = true
      lastSyncedNodesRef.current = nodesJson
      lastSyncedEdgesRef.current = edgesJson

      const localNodesJson = JSON.stringify(nodes)
      const localEdgesJson = JSON.stringify(edges)
      if (nodesJson !== localNodesJson || edgesJson !== localEdgesJson) {
        // Another user was already editing — adopt the live state
        loadMap({ id: mapId, nodes: nodesArr, edges: edgesArr })
      }
      return
    }

    // Skip if this is data we pushed (echo)
    if (nodesJson === lastSyncedNodesRef.current && edgesJson === lastSyncedEdgesRef.current) return

    // Mark as synced BEFORE calling loadMap so the Zustand→Liveblocks effect skips it
    lastSyncedNodesRef.current = nodesJson
    lastSyncedEdgesRef.current = edgesJson
    loadMap({ id: mapId, nodes: nodesArr, edges: edgesArr })
  }, [liveNodes, liveEdges]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Zustand → Liveblocks ────────────────────────────────────────────────────
  useEffect(() => {
    // Wait until storage is loaded (avoids overwriting an active room on join)
    if (!storageLoadedRef.current) return

    const nodesJson = JSON.stringify(nodes)
    const edgesJson = JSON.stringify(edges)

    // Skip if nothing changed since last sync
    if (nodesJson === lastSyncedNodesRef.current && edgesJson === lastSyncedEdgesRef.current) return

    // Debounce: batch rapid changes (dragging, typing) into one broadcast
    clearTimeout(syncTimerRef.current)
    syncTimerRef.current = setTimeout(() => {
      lastSyncedNodesRef.current = nodesJson
      lastSyncedEdgesRef.current = edgesJson
      syncToLive(nodes, edges)
    }, 150)

    return () => clearTimeout(syncTimerRef.current)
  }, [nodes, edges, syncToLive]) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}
