import { msalInstance } from '@/auth/AuthProvider'
import { Team, TeamDetail, InviteInfo } from '@/types'

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

// ─── Teams ────────────────────────────────────────────────────────────────────

export async function listTeams(): Promise<Team[]> {
  const headers = await authHeaders()
  const res = await fetch(`${API_BASE}/teams`, { headers })
  if (!res.ok) throw new Error('Failed to load teams')
  return res.json()
}

export async function createTeam(id: string, name: string): Promise<void> {
  const headers = await authHeaders()
  const res = await fetch(`${API_BASE}/teams`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ id, name }),
  })
  if (!res.ok) throw new Error('Failed to create team')
}

export async function fetchTeam(id: string): Promise<TeamDetail> {
  const headers = await authHeaders()
  const res = await fetch(`${API_BASE}/teams/${id}`, { headers })
  if (!res.ok) throw new Error('Team not found')
  return res.json()
}

export async function deleteTeam(id: string): Promise<void> {
  const headers = await authHeaders()
  await fetch(`${API_BASE}/teams/${id}`, { method: 'DELETE', headers })
}

export async function removeMember(teamId: string, userId: string): Promise<void> {
  const headers = await authHeaders()
  await fetch(`${API_BASE}/teams/${teamId}/members/${userId}`, { method: 'DELETE', headers })
}

// ─── Invites ──────────────────────────────────────────────────────────────────

export async function createInvite(teamId: string): Promise<{ token: string; expiresAt: string }> {
  const headers = await authHeaders()
  const res = await fetch(`${API_BASE}/teams/${teamId}/invites`, {
    method: 'POST',
    headers,
  })
  if (!res.ok) throw new Error('Failed to create invite')
  return res.json()
}

// No auth — anyone with the link can preview the invite
export async function fetchInvite(token: string): Promise<InviteInfo> {
  const res = await fetch(`${API_BASE}/invites/${token}`)
  if (!res.ok) throw new Error('Invite not found or expired')
  return res.json()
}

export async function acceptInvite(token: string): Promise<{ teamId: string }> {
  const headers = await authHeaders()
  const res = await fetch(`${API_BASE}/invites/${token}/accept`, {
    method: 'POST',
    headers,
  })
  if (!res.ok) throw new Error('Failed to accept invite')
  return res.json()
}
