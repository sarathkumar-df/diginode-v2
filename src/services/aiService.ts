import { MindMapExport, AINodeSuggestion, AIConnectionSuggestion, FlowNode, FlowEdge, MapAdvisor } from '@/types'
import { useSettingsStore } from '@/store/settingsStore'
import { useMindMapStore } from '@/store/mindmapStore'
import { findAdvisor } from '@/data/advisors'
import { msalInstance } from '@/auth/AuthProvider'

const API_BASE = (import.meta.env.VITE_API_URL ?? '') + '/api/ai'

// Resolve a stored MapAdvisor reference into the full payload sent to the
// server (with systemFragment). Custom advisors carry their own fragment on
// the stored object; curated entries get theirs from the local catalog so we
// can extend the library without redeploying the server.
function resolveAdvisor(a: MapAdvisor | null | undefined) {
  if (!a) return null
  if (a.custom) {
    return {
      id: a.id,
      label: a.label,
      role: a.role,
      systemFragment: a.systemFragment ?? '',
      custom: true,
    }
  }
  const curated = findAdvisor(a.id)
  if (curated) {
    return { id: curated.id, label: curated.label, role: curated.role, systemFragment: curated.systemFragment }
  }
  // Stored as curated but no longer in catalog (legacy). Fall back to the
  // label/role we have; server's withAdvisor will short-circuit on empty
  // fragment so it ends up as a no-op rather than a generic-but-misleading lens.
  return { id: a.id, label: a.label, role: a.role, systemFragment: '' }
}

function getAIConfig() {
  const { provider, model } = useSettingsStore.getState()
  const { advisor } = useMindMapStore.getState()
  return { provider, model, advisor: resolveAdvisor(advisor) }
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
    const err = await response.json().catch(() => null)
    throw new Error(err?.error ?? `HTTP ${response.status} ${response.statusText || ''}`.trim())
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
    const err = await response.json().catch(() => null)
    throw new Error(err?.error ?? `HTTP ${response.status} ${response.statusText || ''}`.trim())
  }

  return response.json()
}

// ─── AI Features ─────────────────────────────────────────────────────────────

export interface GeneratedMapTree {
  title: string
  nodes: Array<{
    label: string
    icon?: string
    color?: string
    children?: Array<{
      label: string
      icon?: string
      children?: Array<{ label: string; icon?: string }>
    }>
  }>
}

export async function generateMapFromText(text: string): Promise<GeneratedMapTree> {
  return jsonPost('/generate-from-text', { text })
}

export async function generateMapFromTopic(topic: string): Promise<GeneratedMapTree> {
  return jsonPost('/generate-map', { topic })
}

// ─── Advisor suggestions ────────────────────────────────────────────────────

export interface AdvisorSuggestion {
  id: string
  reason: string
}

// Suggest 3 advisors for a brand-new map. The client ships the curated catalog
// so the server can stay stateless — adding new advisors needs no deploy.
export async function suggestAdvisors(
  title: string,
  text?: string,
): Promise<AdvisorSuggestion[]> {
  const { ADVISORS } = await import('@/data/advisors')
  const catalog = ADVISORS.map((a) => ({ id: a.id, label: a.label, blurb: a.blurb, role: a.role }))
  const result = await jsonPost<{ suggestions: AdvisorSuggestion[] }>(
    '/suggest-advisors',
    { title, text, catalog },
  )
  return result.suggestions ?? []
}

export type ExpandStyle = 'concrete' | 'ambitious'

export interface ExpandOptions {
  count?: number
  style?: ExpandStyle
  excludeLabels?: string[]
  // Per-node advisor override. When provided, this advisor is used instead of
  // the map-level default for this single call. Pass undefined (or omit) to
  // inherit the map-level advisor.
  advisor?: MapAdvisor | null
}

function buildExpandBody(extra: Record<string, unknown>, advisor: MapAdvisor | null | undefined) {
  const body: Record<string, unknown> = { ...extra }
  if (advisor !== undefined) body.advisor = resolveAdvisor(advisor)
  return body
}

export async function expandNode(
  nodeLabel: string,
  mapContext: MindMapExport,
  opts: ExpandOptions = {},
): Promise<AINodeSuggestion[]> {
  const { advisor, ...rest } = opts
  return jsonPost('/expand-node', buildExpandBody({ nodeLabel, mapContext, ...rest }, advisor))
}

export async function expandNodeWithPrompt(
  nodeLabel: string,
  userPrompt: string,
  mapContext: MindMapExport,
  opts: ExpandOptions = {},
): Promise<AINodeSuggestion[]> {
  const { advisor, ...rest } = opts
  return jsonPost('/expand-node-with-prompt', buildExpandBody({ nodeLabel, userPrompt, mapContext, ...rest }, advisor))
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
  signal?: AbortSignal,
  selectedNodeLabel?: string,
): Promise<void> {
  return streamPost('/chat', { userMessage, mapContext, history, selectedNodeLabel }, onChunk, signal)
}

export async function findConnections(
  mapContext: MindMapExport
): Promise<AIConnectionSuggestion[]> {
  return jsonPost('/connections', { mapContext })
}

// ─── Flow Diagram Generation ────────────────────────────────────────────────

interface AIFlowNode {
  id: string
  type: 'process' | 'decision' | 'label' | 'group' | 'bulletList' | 'swimlane'
  label: string
  subtitle?: string
  color?: string
  layer: number
  column: number
  width?: number | null
  height?: number | null
  parentId?: string | null
  items?: string[]
}

interface AIFlowResponse {
  title: string
  nodes: AIFlowNode[]
  edges: Array<{
    source: string
    target: string
    label?: string
    edgeStyle?: 'solid' | 'dashed'
    bidirectional?: boolean
  }>
}

export async function generateFlowFromMap(
  mapContext: MindMapExport
): Promise<{ title: string; nodes: FlowNode[]; edges: FlowEdge[] }> {
  const raw = await jsonPost<AIFlowResponse>('/generate-flow', { mapContext })

  // Ensure all 4 fixed swimlanes are always present
  const FIXED_LANES: AIFlowNode[] = [
    { id: 'lane-capture', type: 'swimlane', label: 'CAPTURE LAYER', layer: 0, column: 0, width: 1100, height: 160, color: '#6366f1' },
    { id: 'lane-core', type: 'swimlane', label: 'CORE SYSTEM', layer: 1, column: 0, width: 1100, height: 160, color: '#6366f1' },
    { id: 'lane-reporting', type: 'swimlane', label: 'REPORTING & FINANCE', layer: 2, column: 0, width: 1100, height: 160, color: '#6366f1' },
    { id: 'lane-manual', type: 'swimlane', label: 'MANUAL WORKAROUND LAYER', layer: 3, column: 0, width: 1100, height: 160, color: '#6366f1' },
  ]
  const existingLaneLayers = new Set(raw.nodes.filter(n => n.type === 'swimlane').map(n => n.layer))
  for (const lane of FIXED_LANES) {
    if (!existingLaneLayers.has(lane.layer)) {
      raw.nodes.push(lane)
    }
  }

  // ── Layout constants ──────────────────────────────────────────────────────
  const NODE_W = 160       // estimated width of a process node
  const NODE_H = 60        // estimated height of a process node
  const COL_GAP = 200      // horizontal gap between columns
  const LANE_PAD_LEFT = 60 // left padding inside swimlane (after label)
  const LANE_PAD_TOP = 50  // top padding inside swimlane
  const LANE_PAD_BOTTOM = 30
  const LANE_GAP = 30      // vertical gap between swimlanes
  const GROUP_PAD = 20     // padding inside group containers
  const GROUP_CHILD_GAP = 180 // horizontal gap between children in a group

  // ── Analyze node relationships ────────────────────────────────────────────

  // Group children by parent
  const childrenOf = new Map<string, AIFlowNode[]>()
  for (const n of raw.nodes) {
    if (n.parentId) {
      const siblings = childrenOf.get(n.parentId) || []
      siblings.push(n)
      childrenOf.set(n.parentId, siblings)
    }
  }

  // Top-level content nodes per layer (not children of groups, not swimlanes)
  const topLevelPerLayer = new Map<number, AIFlowNode[]>()
  for (const n of raw.nodes) {
    if (n.type === 'swimlane' || n.parentId) continue
    const list = topLevelPerLayer.get(n.layer) || []
    list.push(n)
    topLevelPerLayer.set(n.layer, list)
  }

  // ── Calculate group sizes ─────────────────────────────────────────────────
  const groupSizes = new Map<string, { w: number; h: number }>()
  for (const n of raw.nodes) {
    if (n.type !== 'group') continue
    const kids = childrenOf.get(n.id) || []
    const cols = Math.max(kids.length, 1)
    const w = GROUP_PAD * 2 + cols * NODE_W + (cols - 1) * (GROUP_CHILD_GAP - NODE_W)
    const h = 50 + NODE_H + GROUP_PAD // header + one row of children + padding
    groupSizes.set(n.id, { w: Math.max(w, 250), h: Math.max(h, 130) })
  }

  // ── Calculate swimlane heights ────────────────────────────────────────────
  const laneHeights = new Map<number, number>()
  for (let layer = 0; layer <= 3; layer++) {
    const topNodes = topLevelPerLayer.get(layer) || []
    if (topNodes.length === 0) {
      laneHeights.set(layer, 100) // empty lane — compact
      continue
    }
    // Find the tallest element in this layer
    let maxNodeH = NODE_H
    for (const n of topNodes) {
      if (n.type === 'group') {
        const gs = groupSizes.get(n.id)
        if (gs) maxNodeH = Math.max(maxNodeH, gs.h)
      } else if (n.type === 'bulletList') {
        const itemCount = (n.items || []).length
        maxNodeH = Math.max(maxNodeH, 60 + itemCount * 22)
      }
    }
    laneHeights.set(layer, LANE_PAD_TOP + maxNodeH + LANE_PAD_BOTTOM)
  }

  // ── Calculate swimlane width based on widest layer ────────────────────────
  let maxLaneW = 800
  for (let layer = 0; layer <= 3; layer++) {
    const topNodes = topLevelPerLayer.get(layer) || []
    let totalW = LANE_PAD_LEFT
    for (const n of topNodes) {
      const gs = groupSizes.get(n.id)
      totalW += (gs ? gs.w : NODE_W) + COL_GAP - NODE_W
    }
    totalW += 60 // right padding
    maxLaneW = Math.max(maxLaneW, totalW)
  }
  const LANE_W = Math.max(maxLaneW, 1100)

  // ── Calculate cumulative Y offsets per layer ──────────────────────────────
  const laneY = new Map<number, number>()
  let cumY = 0
  for (let layer = 0; layer <= 3; layer++) {
    laneY.set(layer, cumY)
    cumY += (laneHeights.get(layer) || 160) + LANE_GAP
  }

  // ── Position all nodes ────────────────────────────────────────────────────
  const nodes: FlowNode[] = []

  // 1. Swimlanes
  for (const n of raw.nodes) {
    if (n.type !== 'swimlane') continue
    const height = laneHeights.get(n.layer) || 160
    nodes.push({
      id: n.id,
      type: 'swimlane',
      position: { x: 0, y: laneY.get(n.layer) || 0 },
      data: {
        label: n.label,
        subtitle: n.subtitle,
        color: n.color || '#6366f1',
        type: 'swimlane' as const,
      },
      style: { width: LANE_W, height },
      zIndex: -2,
    })
  }

  // 2. Top-level content nodes (groups, processes, bulletLists, decisions)
  for (let layer = 0; layer <= 3; layer++) {
    const topNodes = topLevelPerLayer.get(layer) || []
    const layerTop = laneY.get(layer) || 0
    let xCursor = LANE_PAD_LEFT

    for (const n of topNodes) {
      const gs = groupSizes.get(n.id)
      const nodeW = gs ? gs.w : NODE_W
      const y = layerTop + LANE_PAD_TOP

      const flowNode: FlowNode = {
        id: n.id,
        type: n.type,
        position: { x: xCursor, y },
        data: {
          label: n.label,
          subtitle: n.subtitle,
          color: n.color || '#6366f1',
          type: n.type,
          items: n.items,
        },
      }

      if (n.type === 'group' && gs) {
        flowNode.style = { width: gs.w, height: gs.h }
        flowNode.zIndex = -1
      }

      nodes.push(flowNode)
      xCursor += nodeW + (COL_GAP - NODE_W)
    }
  }

  // 3. Children inside groups (positioned relative to parent)
  for (const n of raw.nodes) {
    if (!n.parentId) continue
    const siblings = childrenOf.get(n.parentId) || []
    const idx = siblings.indexOf(n)

    nodes.push({
      id: n.id,
      type: n.type,
      position: { x: GROUP_PAD + idx * GROUP_CHILD_GAP, y: 45 },
      data: {
        label: n.label,
        subtitle: n.subtitle,
        color: n.color || '#6366f1',
        type: n.type,
        items: n.items,
      },
      parentNode: n.parentId,
      extent: 'parent' as const,
    })
  }

  const edges: FlowEdge[] = raw.edges.map((e, i) => ({
    id: `fe-${i}`,
    source: e.source,
    target: e.target,
    type: 'flow',
    data: {
      label: e.label,
      edgeStyle: e.edgeStyle || 'solid',
      bidirectional: e.bidirectional || false,
    },
  }))

  return { title: raw.title, nodes, edges }
}

export async function writeFromMap(
  mapContext: MindMapExport,
  format: 'essay' | 'outline' | 'bullets',
  onChunk: (text: string) => void,
  signal?: AbortSignal
): Promise<void> {
  return streamPost('/write', { mapContext, format }, onChunk, signal)
}

// ─── Multi-advisor debate ───────────────────────────────────────────────────

// Resolve an array of stored MapAdvisors into the full payload sent to the
// debate endpoint. Includes `emoji` (from the curated catalog) so the server
// can render a recognisable section header per advisor.
function resolveDebateAdvisors(advisors: MapAdvisor[]) {
  return advisors.map((a) => {
    const base = resolveAdvisor(a)
    if (!base) return null
    const curated = a.custom ? null : findAdvisor(a.id)
    return { ...base, emoji: curated?.emoji ?? (a.custom ? '🧠' : '🎯') }
  }).filter((x): x is NonNullable<typeof x> => x !== null)
}

export async function debateMap(
  question: string,
  advisors: MapAdvisor[],
  mapContext: MindMapExport,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
  selectedNodeLabel?: string,
): Promise<void> {
  return streamPost(
    '/debate',
    {
      question,
      advisors: resolveDebateAdvisors(advisors),
      mapContext,
      selectedNodeLabel,
      // Debate uses its own per-round advisor; explicitly null the map-level
      // one so it doesn't confuse the server's withAdvisor wrapper.
      advisor: null,
    },
    onChunk,
    signal,
  )
}

// ─── Brainstorming primitives ───────────────────────────────────────────────

export async function challengeMap(
  mapContext: MindMapExport,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
  selectedNodeLabel?: string,
): Promise<void> {
  return streamPost('/challenge', { mapContext, selectedNodeLabel }, onChunk, signal)
}

export async function prioritizeMap(
  mapContext: MindMapExport,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
  selectedNodeLabel?: string,
): Promise<void> {
  return streamPost('/prioritize', { mapContext, selectedNodeLabel }, onChunk, signal)
}

export async function findGaps(
  nodeLabel: string,
  mapContext: MindMapExport,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
  advisor?: MapAdvisor | null,
): Promise<void> {
  return streamPost('/find-gaps', buildExpandBody({ mapContext, nodeLabel }, advisor), onChunk, signal)
}

export async function compressBranch(
  nodeLabel: string,
  mapContext: MindMapExport,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
  advisor?: MapAdvisor | null,
): Promise<void> {
  return streamPost('/compress', buildExpandBody({ mapContext, nodeLabel }, advisor), onChunk, signal)
}
