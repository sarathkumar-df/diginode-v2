import { v4 as uuidv4 } from 'uuid'
import { MindMapNode, MindMapEdge } from '@/types'

const DEFAULT_COLORS = [
  '#6366f1', '#FF6B6B', '#FF9F43', '#1DD1A1',
  '#54A0FF', '#5F27CD', '#FF9FF3', '#FECA57',
]

const H_GAP_L1 = 230
const H_GAP_DEEP = 190
const NODE_HEIGHT = 44

// ── JSON import ───────────────────────────────────────────────────────────────
// Accepts our own export format: { title, nodes: [...], edges: [...] }

export function parseJSON(raw: string): { title: string; nodes: MindMapNode[]; edges: MindMapEdge[] } | null {
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null

    // Our export format
    if (Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)) {
      const idMap = new Map<string, string>()
      const nodes: MindMapNode[] = parsed.nodes.map((n: any) => {
        const newId = uuidv4()
        idMap.set(n.id, newId)
        return {
          id: newId,
          type: 'mindmap',
          position: n.position ?? { x: 0, y: 0 },
          data: {
            label: n.label ?? n.data?.label ?? 'Node',
            color: n.color ?? n.data?.color ?? DEFAULT_COLORS[0],
            shape: n.shape ?? n.data?.shape ?? 'rounded',
            level: n.level ?? n.data?.level ?? 1,
            icon: n.icon ?? n.data?.icon,
            checked: n.checked ?? n.data?.checked,
            notes: n.notes ?? n.data?.notes,
          },
        } as MindMapNode
      })
      const edges: MindMapEdge[] = parsed.edges.map((e: any) => ({
        id: uuidv4(),
        source: idMap.get(e.source) ?? e.source,
        target: idMap.get(e.target) ?? e.target,
        sourceHandle: 'right',
        targetHandle: 'left',
        type: 'mindmapEdge',
      }))
      return { title: parsed.title ?? 'Imported Map', nodes, edges }
    }
    return null
  } catch {
    return null
  }
}

// ── Markdown import ───────────────────────────────────────────────────────────
// Accepts indented Markdown as produced by exportToMarkdown:
//
//   # Map Title
//
//   ## Root Node
//   - Child
//     - Grandchild
//   - Child 2

export function parseMarkdown(raw: string): { title: string; nodes: MindMapNode[]; edges: MindMapEdge[] } | null {
  const lines = raw.split('\n')
  let title = 'Imported Map'
  let rootLabel = 'Central Topic'

  // Extract title from first # heading
  for (const line of lines) {
    const h1 = line.match(/^#\s+(.+)/)
    if (h1) { title = h1[1].trim(); break }
  }

  // Extract root node label from first ## heading
  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+)/)
    if (h2) { rootLabel = h2[1].trim(); break }
  }

  // Parse bullet list items into a tree
  type ParsedNode = { label: string; indent: number; children: ParsedNode[] }
  const stack: ParsedNode[] = []
  const roots: ParsedNode[] = []

  for (const line of lines) {
    const match = line.match(/^(\s*)[-*]\s+(?:\[[ x]\]\s+)?(?:\S+\s+)?(.+)/)
    if (!match) continue
    const indent = match[1].length
    const rawLabel = match[2].trim()
    // Strip leading emoji if present (e.g. "🚀 label" → "🚀 label" keep as is)
    const label = rawLabel

    const node: ParsedNode = { label, indent, children: [] }

    // Find parent: last stack item with smaller indent
    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
      stack.pop()
    }
    if (stack.length === 0) {
      roots.push(node)
    } else {
      stack[stack.length - 1].children.push(node)
    }
    stack.push(node)
  }

  // Convert tree to nodes + edges with column-based layout
  const nodes: MindMapNode[] = []
  const edges: MindMapEdge[] = []

  const rootId = uuidv4()
  nodes.push({
    id: rootId,
    type: 'mindmap',
    position: { x: 0, y: 0 },
    data: { label: rootLabel, color: DEFAULT_COLORS[0], shape: 'rounded', level: 0 },
  } as MindMapNode)

  function subtreeSize(node: ParsedNode): number {
    if (node.children.length === 0) return 1
    return node.children.reduce((sum, c) => sum + subtreeSize(c), 0)
  }

  function placeChildren(
    parentId: string,
    children: ParsedNode[],
    depth: number,
    startY: number,
  ): number {
    const hGap = depth === 1 ? H_GAP_L1 : H_GAP_DEEP
    const x = depth * hGap
    let y = startY

    children.forEach((child, i) => {
      const size = subtreeSize(child)
      const nodeY = y + ((size * NODE_HEIGHT) / 2) - NODE_HEIGHT / 2
      const id = uuidv4()
      const color = DEFAULT_COLORS[depth % DEFAULT_COLORS.length]
      nodes.push({
        id,
        type: 'mindmap',
        position: { x, y: nodeY },
        data: { label: child.label, color, shape: 'rounded', level: depth },
      } as MindMapNode)
      edges.push({ id: uuidv4(), source: parentId, target: id, sourceHandle: 'right', targetHandle: 'left', type: 'mindmapEdge' } as MindMapEdge)
      if (child.children.length > 0) {
        placeChildren(id, child.children, depth + 1, y)
      }
      y += size * NODE_HEIGHT
    })
    return y
  }

  placeChildren(rootId, roots, 1, -(roots.reduce((s, c) => s + subtreeSize(c), 0) * NODE_HEIGHT) / 2)

  return { title, nodes, edges }
}
