/**
 * LoadingShell — shadow-render skeleton primitive.
 *
 * Wraps the real component tree (rendered with placeholder data) and tags
 * it with [data-skeleton]. CSS in src/index.css masks all text/icons/media
 * into pulsing grey blocks so the skeleton stays in sync with whatever the
 * real components render.
 *
 * When `loading` is false this is a passthrough — no extra DOM, no styling.
 */
import { ReactNode } from 'react'

interface Props {
  loading: boolean
  children: ReactNode
  className?: string
}

export function LoadingShell({ loading, children, className }: Props) {
  if (!loading) return <>{children}</>

  return (
    <div data-skeleton aria-busy="true" aria-live="polite" className={className}>
      {children}
    </div>
  )
}
