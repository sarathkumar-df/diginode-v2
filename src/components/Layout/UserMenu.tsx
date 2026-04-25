/**
 * UserMenu — two variants for two contexts:
 *
 *   - "card"  (sidebar): passive user info card with a visible Sign-out
 *             icon button on the right. One click → confirm → sign out.
 *
 *   - "avatar" (toolbars): compact circle avatar that opens a dropdown
 *             containing a Sign-out item. Used where horizontal space is
 *             tight (TopToolbar, FlowPage header).
 */
import { useEffect, useRef, useState } from 'react'
import { LogOut } from 'lucide-react'
import { useCurrentUser, useSignOut } from '@/auth/AuthProvider'
import { useConfirm } from '@/components/UI/ConfirmModal'

type Variant = 'card' | 'avatar'

interface Props {
  variant?: Variant
  align?: 'left' | 'right'
}

export function UserMenu({ variant = 'avatar', align = 'right' }: Props) {
  const user = useCurrentUser()
  const signOut = useSignOut()
  const confirm = useConfirm()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!user) return null

  const handleSignOut = async () => {
    setOpen(false)
    const ok = await confirm({
      title: 'Sign out of DigiNode?',
      description: 'You will be returned to the sign-in page.',
      confirmLabel: 'Sign out',
    })
    if (ok) await signOut()
  }

  const initial = user.name?.charAt(0).toUpperCase() ?? user.email.charAt(0).toUpperCase()

  // ── Card variant: passive info + always-visible Sign-out icon ──────────────
  if (variant === 'card') {
    return (
      <div
        className="flex items-center gap-3 px-3 py-3 rounded-2xl"
        style={{ background: 'var(--canvas-bg)' }}
      >
        <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
          {initial}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
            {user.name}
          </p>
          <p className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>
            {user.email}
          </p>
        </div>
        <button
          onClick={handleSignOut}
          title="Sign out"
          aria-label="Sign out"
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors hover:bg-red-50 dark:hover:bg-red-900/20"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)' }}
        >
          <LogOut size={14} />
        </button>
      </div>
    )
  }

  // ── Avatar variant: compact dropdown for tight toolbar spaces ──────────────
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title={user.name || user.email}
        className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-bold transition-transform hover:scale-105"
        style={{ outline: open ? '2px solid var(--brand)' : 'none', outlineOffset: 2 }}
      >
        {initial}
      </button>

      {open && (
        <div
          className="absolute z-50 rounded-xl border shadow-xl overflow-hidden"
          style={{
            background: 'var(--panel-bg)',
            borderColor: 'var(--panel-border)',
            minWidth: 220,
            top: 'calc(100% + 8px)',
            [align]: 0,
          }}
        >
          <div className="px-3.5 py-3 border-b" style={{ borderColor: 'var(--panel-border)' }}>
            <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
              {user.name}
            </p>
            <p className="text-[11px] truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {user.email}
            </p>
          </div>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs font-medium transition-colors hover:bg-red-50 dark:hover:bg-red-900/20"
            style={{ color: '#ef4444' }}
          >
            <LogOut size={13} />
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
