/**
 * Pure builder that turns the AI tree response into nodes + edges, ready to
 * persist via createMap() or load into the store. No side effects.
 */
import { v4 as uuidv4 } from 'uuid'
import { BRANCH_PALETTE } from '@/store/mindmapStore'
import { MindMapNode, MindMapEdge } from '@/types'

export interface AINodeTree {
  label: string
  icon?: string
  color?: string
  children?: AINodeTree[]
}

export interface AIMapResponse {
  title?: string
  nodes?: AINodeTree[]
}

export interface BuiltMap {
  id: string
  title: string
  rootColor: string
  nodes: MindMapNode[]
  edges: MindMapEdge[]
}

const ROOT_COLOR = '#6366f1'

function buildNodesFromTree(
  items: AINodeTree[],
  parentId: string,
  parentPos: { x: number; y: number },
  level: number,
  branchColor?: string,
): { nodes: MindMapNode[]; edges: MindMapEdge[] } {
  const nodes: MindMapNode[] = []
  const edges: MindMapEdge[] = []
  const count = items.length

  items.forEach((item, i) => {
    const id = uuidv4()
    const color =
      item.color ??
      branchColor ??
      (level === 1 ? BRANCH_PALETTE[i % BRANCH_PALETTE.length] : '#54A0FF')
    let x: number, y: number

    if (level === 1) {
      const angle = (i / count) * 2 * Math.PI - Math.PI / 2
      x = parentPos.x + Math.cos(angle) * 260
      y = parentPos.y + Math.sin(angle) * 180
    } else {
      const spread = 120
      const startY = parentPos.y - (spread * (count - 1)) / 2
      x = parentPos.x + 200
      y = startY + i * spread
    }

    nodes.push({
      id,
      type: 'mindmap',
      position: { x, y },
      data: {
        label: item.icon ? `${item.icon} ${item.label}` : item.label,
        color,
        shape: 'rounded',
        level,
      },
    })

    edges.push({
      id: `e-${parentId}-${id}`,
      source: parentId,
      target: id,
      sourceHandle: 'right',
      targetHandle: 'left',
      type: 'custom',
      style: { stroke: color, strokeWidth: 2 },
    })

    if (item.children?.length) {
      const sub = buildNodesFromTree(item.children, id, { x, y }, level + 1, color)
      nodes.push(...sub.nodes)
      edges.push(...sub.edges)
    }
  })

  return { nodes, edges }
}

export function buildAIMap(parsed: AIMapResponse, fallbackTitle: string): BuiltMap {
  const rootId = uuidv4()
  const title = parsed.title ?? fallbackTitle
  const rootNode: MindMapNode = {
    id: rootId,
    type: 'mindmap',
    position: { x: 0, y: 0 },
    data: { label: title, color: ROOT_COLOR, shape: 'rounded', level: 0 },
  }
  const { nodes: childNodes, edges } = buildNodesFromTree(
    parsed.nodes ?? [],
    rootId,
    { x: 0, y: 0 },
    1,
  )

  return {
    id: uuidv4(),
    title,
    rootColor: ROOT_COLOR,
    nodes: [rootNode, ...childNodes],
    edges,
  }
}
