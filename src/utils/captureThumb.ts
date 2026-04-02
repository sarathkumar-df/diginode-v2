/**
 * captureThumb — captures a small JPEG thumbnail of the current React Flow canvas.
 * Returns a base64 data URL, or null if capture fails (non-fatal).
 *
 * Kept small (320×200, quality 0.7) so it's fast and cheap to store.
 */
export async function captureThumb(): Promise<string | null> {
  const flowEl = document.querySelector('.react-flow__viewport') as HTMLElement | null
  if (!flowEl) return null

  try {
    const { toJpeg } = await import('html-to-image')
    const canvasBg = getComputedStyle(document.documentElement)
      .getPropertyValue('--canvas-bg').trim() || '#F3F4F8'

    return await toJpeg(flowEl, {
      width: 320,
      height: 200,
      canvasWidth: 320,
      canvasHeight: 200,
      quality: 0.72,
      backgroundColor: canvasBg,
      pixelRatio: 1,
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
