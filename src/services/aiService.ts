import { MindMapExport, AINodeSuggestion, AIConnectionSuggestion } from '@/types'
import { useSettingsStore } from '@/store/settingsStore'
import { msalInstance } from '@/auth/AuthProvider'

const API_BASE = (import.meta.env.VITE_API_URL ?? '') + '/api/ai'

function getAIConfig() {
  const { provider, apiKey, model } = useSettingsStore.getState()
  return { provider, apiKey, model }
}

// Fetch a fresh Microsoft ID token to authenticate requests against the backend.
// Falls back to null if the user is not signed in (e.g. local dev with SKIP_AUTH=true).
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

async function streamPost(
  endpoint: string,
  body: unknown,
  onChunk: (text: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ ...getAIConfig(), ...(body as object) }),
    signal,
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(err.error ?? `HTTP ${response.status}`)
  }

  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') return
      try {
        const parsed = JSON.parse(data)
        if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
          onChunk(parsed.delta.text)
        }
      } catch {
        // ignore parse errors
      }
    }
  }
}

async function jsonPost<T>(endpoint: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ ...getAIConfig(), ...(body as object) }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(err.error ?? `HTTP ${response.status}`)
  }

  return response.json()
}

// ─── AI Features ─────────────────────────────────────────────────────────────

export async function generateMapFromText(
  text: string,
  onChunk: (text: string) => void,
  signal?: AbortSignal
): Promise<void> {
  return streamPost('/generate-from-text', { text }, onChunk, signal)
}

export async function generateMapFromTopic(
  topic: string,
  onChunk: (text: string) => void,
  signal?: AbortSignal
): Promise<void> {
  return streamPost('/generate-map', { topic }, onChunk, signal)
}

export async function expandNode(
  nodeLabel: string,
  mapContext: MindMapExport,
  count = 5
): Promise<AINodeSuggestion[]> {
  return jsonPost('/expand-node', { nodeLabel, mapContext, count })
}

export async function summarizeMap(
  mapContext: MindMapExport,
  onChunk: (text: string) => void,
  signal?: AbortSignal
): Promise<void> {
  return streamPost('/summarize', { mapContext }, onChunk, signal)
}

export async function chatWithMap(
  userMessage: string,
  mapContext: MindMapExport,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  onChunk: (text: string) => void,
  signal?: AbortSignal
): Promise<void> {
  return streamPost('/chat', { userMessage, mapContext, history }, onChunk, signal)
}

export async function findConnections(
  mapContext: MindMapExport
): Promise<AIConnectionSuggestion[]> {
  return jsonPost('/connections', { mapContext })
}

export async function writeFromMap(
  mapContext: MindMapExport,
  format: 'essay' | 'outline' | 'bullets',
  onChunk: (text: string) => void,
  signal?: AbortSignal
): Promise<void> {
  return streamPost('/write', { mapContext, format }, onChunk, signal)
}
