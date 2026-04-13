import { MindMapNode, MindMapEdge } from '@/types'

export function exportToJSON(
  nodes: MindMapNode[],
  edges: MindMapEdge[],
  title: string
): void {
  const data = {
    title,
    version: '1.0',
    exportedAt: new Date().toISOString(),
    nodes: nodes.map((n) => ({
      id: n.id,
      label: n.data.label,
      color: n.data.color,
      icon: n.data.icon,
      shape: n.data.shape,
      checked: n.data.checked,
      position: n.position,
      level: n.data.level,
      notes: n.data.notes,
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
    })),
  }

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  downloadBlob(blob, `${title.replace(/\s+/g, '-')}.json`)
}

export async function exportToPng(title: string): Promise<void> {
  const flowEl = document.querySelector('.react-flow') as HTMLElement
  if (!flowEl) return

  try {
    const { toPng } = await import('html-to-image')
    const canvasBg = getComputedStyle(document.documentElement)
      .getPropertyValue('--canvas-bg').trim() || '#FEFCF3'

    const dataUrl = await toPng(flowEl, {
      pixelRatio: 2,
      backgroundColor: canvasBg,
      filter: (node) => {
        if (!(node instanceof Element)) return true
        const exclude = ['react-flow__controls', 'react-flow__minimap', 'react-flow__panel']
        return !exclude.some((cls) => node.classList.contains(cls))
      },
    })

    downloadBlob(dataUrlToBlob(dataUrl), `${title.replace(/\s+/g, '-')}.png`)
  } catch (err) {
    console.error('PNG export failed:', err)
  }
}

export function exportToMarkdown(
  nodes: MindMapNode[],
  edges: MindMapEdge[],
  title: string
): void {
  const childrenMap = new Map<string, string[]>()
  edges.forEach((e) => {
    if (!childrenMap.has(e.source)) childrenMap.set(e.source, [])
    childrenMap.get(e.source)!.push(e.target)
  })

  const nodeMap = new Map(nodes.map((n) => [n.id, n]))
  const root = nodes.find((n) => n.data.level === 0)
  if (!root) return

  const lines: string[] = [`# ${title}\n`]

  function renderNode(nodeId: string, depth: number) {
    const node = nodeMap.get(nodeId)
    if (!node) return
    const indent = '  '.repeat(Math.max(0, depth - 1))
    const bullet = depth === 0 ? '' : indent + '- '
    const check =
      node.data.checked !== undefined ? (node.data.checked ? '[x] ' : '[ ] ') : ''
    const icon = node.data.icon ? node.data.icon + ' ' : ''
    if (depth === 0) {
      lines.push(`## ${icon}${node.data.label}\n`)
    } else {
      lines.push(`${bullet}${check}${icon}${node.data.label}`)
    }
    const children = childrenMap.get(nodeId) ?? []
    children.forEach((childId) => renderNode(childId, depth + 1))
  }

  renderNode(root.id, 0)
  const children = childrenMap.get(root.id) ?? []
  children.forEach((childId) => renderNode(childId, 1))

  const blob = new Blob([lines.join('\n')], { type: 'text/markdown' })
  downloadBlob(blob, `${title.replace(/\s+/g, '-')}.md`)
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, data] = dataUrl.split(',')
  const mime = header.match(/:(.*?);/)?.[1] ?? 'image/png'
  const binary = atob(data)
  const arr = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i)
  return new Blob([arr], { type: mime })
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ── Flow diagram exports ──────────────────────────────────────────────────────

const flowExportFilter = (node: HTMLElement | Element) => {
  if (!(node instanceof Element)) return true
  const exclude = ['react-flow__controls', 'react-flow__minimap', 'react-flow__panel']
  return !exclude.some((cls) => node.classList.contains(cls))
}

export async function exportFlowToPng(title: string): Promise<void> {
  const flowEl = document.querySelector('.react-flow') as HTMLElement
  if (!flowEl) return

  try {
    const { toPng } = await import('html-to-image')
    const canvasBg = getComputedStyle(document.documentElement)
      .getPropertyValue('--canvas-bg').trim() || '#FEFCF3'

    const dataUrl = await toPng(flowEl, {
      pixelRatio: 2,
      backgroundColor: canvasBg,
      filter: flowExportFilter,
    })

    downloadBlob(dataUrlToBlob(dataUrl), `${title.replace(/\s+/g, '-')}-flow.png`)
  } catch (err) {
    console.error('Flow PNG export failed:', err)
  }
}

export async function exportFlowToSvg(title: string): Promise<void> {
  const flowEl = document.querySelector('.react-flow') as HTMLElement
  if (!flowEl) return

  try {
    const { toSvg } = await import('html-to-image')
    const canvasBg = getComputedStyle(document.documentElement)
      .getPropertyValue('--canvas-bg').trim() || '#FEFCF3'

    const dataUrl = await toSvg(flowEl, {
      backgroundColor: canvasBg,
      filter: flowExportFilter,
    })

    downloadBlob(dataUrlToBlob(dataUrl), `${title.replace(/\s+/g, '-')}-flow.svg`)
  } catch (err) {
    console.error('Flow SVG export failed:', err)
  }
}

export async function exportFlowToPdf(title: string): Promise<void> {
  const flowEl = document.querySelector('.react-flow') as HTMLElement
  if (!flowEl) return

  try {
    const { toPng } = await import('html-to-image')
    const canvasBg = getComputedStyle(document.documentElement)
      .getPropertyValue('--canvas-bg').trim() || '#FEFCF3'

    const dataUrl = await toPng(flowEl, {
      pixelRatio: 2,
      backgroundColor: canvasBg,
      filter: flowExportFilter,
    })

    // Create a printable page with the image and trigger browser print
    const printWindow = window.open('', '_blank')
    if (!printWindow) return

    const img = new Image()
    img.src = dataUrl
    await new Promise<void>((resolve) => { img.onload = () => resolve() })

    const landscape = img.width > img.height

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${title} — Flow Diagram</title>
        <style>
          @page { size: ${landscape ? 'landscape' : 'portrait'}; margin: 0.5in; }
          body { margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: white; }
          img { max-width: 100%; max-height: 100vh; object-fit: contain; }
        </style>
      </head>
      <body>
        <img src="${dataUrl}" />
      </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => printWindow.print(), 300)
  } catch (err) {
    console.error('Flow PDF export failed:', err)
  }
}
