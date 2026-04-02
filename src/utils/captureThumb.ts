/**
 * captureThumb — captures a small JPEG thumbnail of the current React Flow canvas.
 * Returns a base64 data URL, or null if capture fails (non-fatal).
 *
 * Kept small (320×200, quality 0.7) so it's fast and cheap to store.
 */
export async function captureThumb(): Promise<string | null> {
  // Use the outer .react-flow container (no CSS transform applied) so html-to-image
  // can render it reliably. The viewport element has a pan/zoom transform that
  // confuses the library and causes silent failures.
  const flowEl = document.querySelector('.react-flow') as HTMLElement | null
  if (!flowEl) return null

  try {
    const { toJpeg } = await import('html-to-image')
    const canvasBg = getComputedStyle(document.documentElement)
      .getPropertyValue('--canvas-bg').trim() || '#F3F4F8'

    const w = flowEl.offsetWidth || 1200
    const h = flowEl.offsetHeight || 700
    const scale = Math.min(320 / w, 200 / h)

    return await toJpeg(flowEl, {
      canvasWidth: Math.round(w * scale),
      canvasHeight: Math.round(h * scale),
      quality: 0.72,
      backgroundColor: canvasBg,
      // Exclude controls, minimap, handles, panels
      filter: (node) => {
        if (!(node instanceof Element)) return true
        const excluded = [
          'react-flow__controls',
          'react-flow__minimap',
          'react-flow__panel',
          'react-flow__handle',
        ]
        return !excluded.some((cls) => node.classList?.contains(cls))
      },
    })
  } catch {
    return null
  }
}
