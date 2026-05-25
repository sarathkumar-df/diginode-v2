import { msalInstance } from '@/auth/AuthProvider'
import { MapMeta, MindMapNode, MindMapEdge, MapAdvisor, AIMessage } from '@/types'

// Soft cap on persisted chat history. Keeps the JSONB column from growing
// unbounded for chatty maps while still preserving the bulk of recent context.
const CHAT_HISTORY_CAP = 100

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
  chatHistory: AIMessage[]
  advisor: MapAdvisor | null
  createdAt: string
  updatedAt: string
}

// List all maps for the current user (metadata only — no nodes/edges).
export async function listMaps(): Promise<MapMeta[]> {
  const headers = await authHeaders()
  const res = await fetch(`${API_BASE}/maps`, { headers })
  if (!res.ok) throw new Error('Failed to load maps')
  const data = await res.json()
  // Defensive check: ensure response is an array, fallback to empty array
  return Array.isArray(data) ? data : []
}

// Create a new map in the DB. The client generates the UUID.
export async function createMap(
  id: string,
  title: string,
  nodes: MindMapNode[],
  edges: MindMapEdge[],
  advisor?: MapAdvisor | null,
): Promise<void> {
  const headers = await authHeaders()
  const res = await fetch(`${API_BASE}/maps`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ id, title, data: { nodes, edges }, advisor: advisor ?? null }),
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
// `advisor: null` clears the advisor; omit the key to leave it untouched.
// `chatHistory` is capped to the most recent N messages to keep the JSONB
// payload bounded for long sessions.
export async function saveMap(
  id: string,
  nodes: MindMapNode[],
  edges: MindMapEdge[],
  thumbnail?: string | null,
  advisor?: MapAdvisor | null | undefined,
  chatHistory?: AIMessage[],
): Promise<void> {
  const headers = await authHeaders()
  const data: Record<string, unknown> = { nodes, edges }
  if (chatHistory !== undefined) data.chatHistory = chatHistory.slice(-CHAT_HISTORY_CAP)
  const body: Record<string, unknown> = { data }
  if (thumbnail) body.thumbnail = thumbnail
  if (advisor !== undefined) body.advisor = advisor
  await fetch(`${API_BASE}/maps/${id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  }).catch(() => {/* silent — auto-save failures are non-fatal */})
}

// Update just the advisor on a map. Used when the user changes the advisor
// from the toolbar — independent of the auto-save debounce so the change
// applies to the very next AI call.
export async function updateMapAdvisor(id: string, advisor: MapAdvisor | null): Promise<void> {
  const headers = await authHeaders()
  await fetch(`${API_BASE}/maps/${id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ advisor }),
  }).catch(() => {/* silent */})
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
