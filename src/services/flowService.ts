import { msalInstance } from '@/auth/AuthProvider'
import { FlowMeta, FullFlow, FlowNode, FlowEdge } from '@/types'

const API_BASE = (import.meta.env.VITE_API_URL ?? '') + '/api'

// ─── Auth helpers (same pattern as mapService) ───────────────────────────────

async function getAuthToken(): Promise<string | null> {
  const account = msalInstance.getActiveAccount()
  if (!account) return null
  try {
    const result = await msalInstance.acquireTokenSilent({
      scopes: ['openid', 'profile', 'email'],
      account,
    })
    return result.idToken
  } catch {
    return null
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAuthToken()
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

// ─── Flow CRUD ───────────────────────────────────────────────────────────────

export async function listFlows(mapId: string): Promise<FlowMeta[]> {
  const headers = await authHeaders()
  const res = await fetch(`${API_BASE}/maps/${mapId}/flows`, { headers })
  if (!res.ok) throw new Error('Failed to load flows')
  return res.json()
}

export async function createFlow(
  mapId: string,
  id: string,
  title: string,
  nodes: FlowNode[],
  edges: FlowEdge[],
  parentFlowId?: string | null
): Promise<void> {
  const headers = await authHeaders()
  const res = await fetch(`${API_BASE}/maps/${mapId}/flows`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ id, title, parentFlowId: parentFlowId || null, data: { nodes, edges } }),
  })
  if (!res.ok) throw new Error('Failed to create flow')
}

export async function fetchFlow(mapId: string, flowId: string): Promise<FullFlow> {
  const headers = await authHeaders()
  const res = await fetch(`${API_BASE}/maps/${mapId}/flows/${flowId}`, { headers })
  if (!res.ok) throw new Error('Flow not found')
  return res.json()
}

export async function saveFlow(
  mapId: string,
  flowId: string,
  nodes: FlowNode[],
  edges: FlowEdge[]
): Promise<void> {
  const headers = await authHeaders()
  await fetch(`${API_BASE}/maps/${mapId}/flows/${flowId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ data: { nodes, edges } }),
  }).catch(() => {/* silent — auto-save failures are non-fatal */})
}

export async function renameFlow(mapId: string, flowId: string, title: string): Promise<void> {
  const headers = await authHeaders()
  await fetch(`${API_BASE}/maps/${mapId}/flows/${flowId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ title }),
  })
}

export async function deleteFlow(mapId: string, flowId: string): Promise<void> {
  const headers = await authHeaders()
  await fetch(`${API_BASE}/maps/${mapId}/flows/${flowId}`, {
    method: 'DELETE',
    headers,
  })
}

// Duplicate a flow as a derivative (copies data, sets parentFlowId)
export async function duplicateFlow(
  mapId: string,
  sourceFlowId: string,
  newId: string,
  newTitle: string
): Promise<void> {
  // Fetch the source flow's full data
  const source = await fetchFlow(mapId, sourceFlowId)
  // Create a new flow with parentFlowId pointing to the source
  await createFlow(mapId, newId, newTitle, source.nodes, source.edges, sourceFlowId)
}
