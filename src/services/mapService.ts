import { msalInstance } from '@/auth/AuthProvider'
import { MapMeta, MindMapNode, MindMapEdge } from '@/types'

const API_BASE = (import.meta.env.VITE_API_URL ?? '') + '/api'

// ─── Auth helpers (same pattern as aiService) ─────────────────────────────────

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

// ─── User ─────────────────────────────────────────────────────────────────────

// Register / update the current user in the DB (call once on Dashboard mount).
export async function upsertUser(): Promise<void> {
  const headers = await authHeaders()
  await fetch(`${API_BASE}/users/me`, { method: 'POST', headers })
}

// ─── Maps ─────────────────────────────────────────────────────────────────────

export interface FullMap {
  id: string
  title: string
  nodes: MindMapNode[]
  edges: MindMapEdge[]
  createdAt: string
  updatedAt: string
}

// List all maps for the current user (metadata only — no nodes/edges).
export async function listMaps(): Promise<MapMeta[]> {
  const headers = await authHeaders()
  const res = await fetch(`${API_BASE}/maps`, { headers })
  if (!res.ok) throw new Error('Failed to load maps')
  return res.json()
}

// Create a new map in the DB. The client generates the UUID.
export async function createMap(
  id: string,
  title: string,
  nodes: MindMapNode[],
  edges: MindMapEdge[]
): Promise<void> {
  const headers = await authHeaders()
  const res = await fetch(`${API_BASE}/maps`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ id, title, data: { nodes, edges } }),
  })
  if (!res.ok) throw new Error('Failed to create map')
}

// Fetch the full map data (nodes + edges) for the editor.
export async function fetchMap(id: string): Promise<FullMap> {
  const headers = await authHeaders()
  const res = await fetch(`${API_BASE}/maps/${id}`, { headers })
  if (!res.ok) throw new Error('Map not found')
  return res.json()
}

// Save the current node/edge state to the DB. Silently ignores network errors
// so transient failures don't interrupt the user's editing session.
export async function saveMap(
  id: string,
  nodes: MindMapNode[],
  edges: MindMapEdge[],
  thumbnail?: string | null
): Promise<void> {
  const headers = await authHeaders()
  const body: Record<string, unknown> = { data: { nodes, edges } }
  if (thumbnail) body.thumbnail = thumbnail
  await fetch(`${API_BASE}/maps/${id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  }).catch(() => {/* silent — auto-save failures are non-fatal */})
}

// Update just the title (called from rename UI).
export async function renameMap(id: string, title: string): Promise<void> {
  const headers = await authHeaders()
  await fetch(`${API_BASE}/maps/${id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ title }),
  })
}

// Duplicate a map — server copies data and returns new id + title.
export async function duplicateMap(id: string): Promise<{ id: string; title: string }> {
  const headers = await authHeaders()
  const res = await fetch(`${API_BASE}/maps/${id}/duplicate`, { method: 'POST', headers })
  if (!res.ok) throw new Error('Failed to duplicate map')
  return res.json()
}

// Delete a map permanently.
export async function deleteMap(id: string): Promise<void> {
  const headers = await authHeaders()
  await fetch(`${API_BASE}/maps/${id}`, { method: 'DELETE', headers })
}
