import { createClient } from '@liveblocks/client'
import { createRoomContext } from '@liveblocks/react'
import { msalInstance } from '@/auth/AuthProvider'

const API_URL = import.meta.env.VITE_API_URL ?? ''

// ── Presence: ephemeral per-user state (cursors, display info) ────────────────
// Must only contain JSON primitives — no complex React types.

export type UserPresence = {
  cursor: { x: number; y: number } | null
  name: string
  color: string
}

// ── Deterministic color from user ID ─────────────────────────────────────────

const PRESENCE_COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981',
  '#3b82f6', '#8b5cf6', '#ef4444', '#14b8a6',
]

export function presenceColor(userId: string): string {
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0
  }
  return PRESENCE_COLORS[hash % PRESENCE_COLORS.length]
}

// ── Liveblocks client (auth via our Express backend) ─────────────────────────

const client = createClient({
  authEndpoint: async (room) => {
    const account = msalInstance.getActiveAccount()
    if (!account) throw new Error('Not authenticated')

    const result = await msalInstance.acquireTokenSilent({
      scopes: ['openid', 'profile', 'email'],
      account,
    })

    const res = await fetch(`${API_URL}/api/liveblocks-auth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${result.idToken}`,
      },
      body: JSON.stringify({ room }),
    })

    if (!res.ok) throw new Error('Liveblocks auth failed')
    return res.json()
  },
})

// ── Room context ──────────────────────────────────────────────────────────────
// Storage is typed as `any` because MindMapNode/MindMapEdge extend React Flow
// types that include CSSProperties — these are valid JSON at runtime but
// TypeScript can't verify that against Liveblocks' strict LsonObject constraint.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const {
  RoomProvider,
  useStorage,
  useMutation,
  useOthers,
  useSelf,
  useUpdateMyPresence,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} = createRoomContext<UserPresence, any>(client)
