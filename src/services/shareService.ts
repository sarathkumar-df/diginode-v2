import { msalInstance } from '@/auth/AuthProvider'
import { MapShare, SharedMapMeta, MapPermission } from '@/types'

const API_BASE = (import.meta.env.VITE_API_URL ?? '') + '/api'

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

// ─── Share management ─────────────────────────────────────────────────────────

// List teams this map is currently shared with (owner only)
export async function listShares(mapId: string): Promise<MapShare[]> {
  const headers = await authHeaders()
  const res = await fetch(`${API_BASE}/maps/${mapId}/shares`, { headers })
  if (!res.ok) throw new Error('Failed to load shares')
  return res.json()
}

// Share map with a team
export async function shareMap(mapId: string, teamId: string, permission: MapPermission): Promise<void> {
  const headers = await authHeaders()
  const res = await fetch(`${API_BASE}/maps/${mapId}/shares`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ teamId, permission }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error ?? 'Failed to share map')
  }
}

// Remove a share
export async function unshareMap(mapId: string, teamId: string): Promise<void> {
  const headers = await authHeaders()
  await fetch(`${API_BASE}/maps/${mapId}/shares/${teamId}`, { method: 'DELETE', headers })
}

// ─── Shared maps (maps shared WITH the current user) ─────────────────────────

export async function listSharedMaps(): Promise<SharedMapMeta[]> {
  const headers = await authHeaders()
  const res = await fetch(`${API_BASE}/shared-maps`, { headers })
  if (!res.ok) throw new Error('Failed to load shared maps')
  return res.json()
}

// Fetch a map the user has access to (owned or shared)
export async function fetchSharedMap(mapId: string) {
  const headers = await authHeaders()
  const res = await fetch(`${API_BASE}/maps/${mapId}/shared`, { headers })
  if (!res.ok) throw new Error('Access denied or map not found')
  return res.json() as Promise<{
    id: string; title: string
    nodes: any[]; edges: any[]
    permission: MapPermission
    createdAt: string; updatedAt: string
  }>
}
