import { msalInstance } from '@/auth/AuthProvider'
import { MapVersion, MapVersionData } from '@/types'

const API_BASE = (import.meta.env.VITE_API_URL ?? '') + '/api'

async function authHeaders(): Promise<Record<string, string>> {
  const account = msalInstance.getActiveAccount()
  if (!account) return { 'Content-Type': 'application/json' }
  try {
    const result = await msalInstance.acquireTokenSilent({
      scopes: ['openid', 'profile', 'email'],
      account,
    })
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${result.idToken}`,
    }
  } catch {
    return { 'Content-Type': 'application/json' }
  }
}

export async function listVersions(mapId: string): Promise<MapVersion[]> {
  const headers = await authHeaders()
  const res = await fetch(`${API_BASE}/maps/${mapId}/versions`, { headers })
  if (!res.ok) throw new Error('Failed to load version history')
  return res.json()
}

export async function restoreVersion(
  mapId: string,
  versionId: string
): Promise<MapVersionData> {
  const headers = await authHeaders()
  const res = await fetch(`${API_BASE}/maps/${mapId}/versions/${versionId}/restore`, {
    method: 'POST',
    headers,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error ?? 'Failed to restore version')
  }
  const data = await res.json()
  return { ...data, id: versionId, mapId, nodeCount: 0, edgeCount: 0, createdAt: '' }
}
