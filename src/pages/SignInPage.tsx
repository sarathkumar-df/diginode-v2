import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useIsAuthenticated } from '@azure/msal-react'
import { motion } from 'framer-motion'
import { Layers, Loader2, Sparkles, Workflow, Users, ArrowRight } from 'lucide-react'
import { loginRequest } from '@/auth/msalConfig'
import { msalInstance } from '@/auth/AuthProvider'

// ── Decorative mind-map preview (abstract — purely cosmetic) ─────────────────

function MapPreview() {
  return (
    <svg
      viewBox="0 0 480 320"
      className="w-full h-full"
      fill="none"
      stroke="currentColor"
      style={{ color: 'rgba(99, 102, 241, 0.18)' }}
    >
      <defs>
        <linearGradient id="edge" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#6366f1" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#a855f7" stopOpacity="0.2" />
        </linearGradient>
      </defs>
      {/* edges */}
      {[
        ['M 240 160 Q 180 120 100 80', 0.0],
        ['M 240 160 Q 180 200 100 240', 0.1],
        ['M 240 160 Q 320 110 400 60', 0.2],
        ['M 240 160 Q 330 160 400 160', 0.3],
        ['M 240 160 Q 330 220 400 260', 0.4],
      ].map(([d, delay], i) => (
        <motion.path
          key={i}
          d={d as string}
          stroke="url(#edge)"
          strokeWidth="1.5"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ delay: delay as number, duration: 0.9, ease: 'easeOut' }}
        />
      ))}
      {/* root */}
      <motion.circle
        cx={240}
        cy={160}
        r={26}
        fill="#6366f1"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
      />
      {/* leaves */}
      {[
        { cx: 100, cy: 80, fill: '#10b981', d: 0.2 },
        { cx: 100, cy: 240, fill: '#f59e0b', d: 0.3 },
        { cx: 400, cy: 60, fill: '#ec4899', d: 0.4 },
        { cx: 400, cy: 160, fill: '#06b6d4', d: 0.5 },
        { cx: 400, cy: 260, fill: '#8b5cf6', d: 0.6 },
      ].map((n, i) => (
        <motion.circle
          key={i}
          cx={n.cx}
          cy={n.cy}
          r={14}
          fill={n.fill}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: n.d, type: 'spring', stiffness: 260, damping: 22 }}
        />
      ))}
    </svg>
  )
}

// ── Feature bullet ───────────────────────────────────────────────────────────

function Feature({
  icon: Icon,
  title,
  body,
  delay,
}: {
  icon: React.ElementType
  title: string
  body: string
  delay: number
}) {
  return (
    <motion.div
      className="flex items-start gap-3"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4, ease: 'easeOut' }}
    >
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: 'var(--brand-light)' }}
      >
        <Icon size={16} style={{ color: 'var(--brand)' }} />
      </div>
      <div>
        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          {title}
        </p>
        <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          {body}
        </p>
      </div>
    </motion.div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function SignInPage() {
  const isAuthenticated = useIsAuthenticated()
  const navigate = useNavigate()
  const location = useLocation()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isAuthenticated) {
      const from = (location.state as { from?: string })?.from ?? '/dashboard'
      navigate(from, { replace: true })
    }
  }, [isAuthenticated, navigate, location.state])

  const handleSignIn = async () => {
    if (loading) return
    setLoading(true)
    setError('')
    try {
      await msalInstance.loginRedirect(loginRequest)
    } catch (err: any) {
      console.error('Sign in failed', err)
      setError('Sign in failed. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen w-full grid lg:grid-cols-[1.05fr_1fr]"
      style={{ background: 'var(--canvas-bg)' }}
    >
      {/* ── Left: marketing pane ─────────────────────────────────────────── */}
      <div
        className="relative hidden lg:flex flex-col justify-between px-14 py-12 overflow-hidden"
        style={{
          background:
            'radial-gradient(1200px 600px at -10% -10%, rgba(99,102,241,0.18), transparent 60%), radial-gradient(800px 600px at 110% 110%, rgba(168,85,247,0.14), transparent 60%), var(--panel-bg)',
          borderRight: '1px solid var(--panel-border)',
        }}
      >
        {/* Top: brand */}
        <motion.div
          className="flex items-center gap-2.5 relative z-10"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="w-8 h-8 rounded-xl bg-indigo-500 flex items-center justify-center shadow-md">
            <Layers size={16} color="white" />
          </div>
          <span className="font-bold text-base tracking-tight" style={{ color: 'var(--text-primary)' }}>
            DigiNode
          </span>
        </motion.div>

        {/* Middle: pitch + abstract preview */}
        <div className="relative z-10 flex flex-col gap-8">
          <div>
            <motion.div
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium mb-5"
              style={{ background: 'var(--brand-light)', color: 'var(--brand)' }}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05, duration: 0.4 }}
            >
              <Sparkles size={12} />
              AI-powered mind mapping
            </motion.div>
            <motion.h1
              className="text-4xl font-bold leading-[1.1] tracking-tight"
              style={{ color: 'var(--text-primary)' }}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.5 }}
            >
              Think out loud.<br />
              <span style={{ color: 'var(--brand)' }}>Map it instantly.</span>
            </motion.h1>
            <motion.p
              className="text-sm mt-4 max-w-sm leading-relaxed"
              style={{ color: 'var(--text-secondary)' }}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.4 }}
            >
              DigiNode turns ideas into structured mind maps and flows — generated, refined, and presented with AI by your side.
            </motion.p>
          </div>

          {/* Abstract animated preview */}
          <motion.div
            className="relative h-52 rounded-2xl overflow-hidden border"
            style={{
              borderColor: 'var(--panel-border)',
              background:
                'linear-gradient(180deg, var(--canvas-bg) 0%, var(--panel-bg) 100%)',
            }}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.25, duration: 0.5 }}
          >
            <MapPreview />
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  'radial-gradient(circle at 50% 50%, transparent 50%, var(--panel-bg) 100%)',
              }}
            />
          </motion.div>

          {/* Features */}
          <div className="grid gap-4 max-w-md">
            <Feature
              icon={Sparkles}
              title="Generate from a single topic"
              body="Type one prompt and watch a full mind map appear node by node."
              delay={0.35}
            />
            <Feature
              icon={Workflow}
              title="Mind maps & flow diagrams"
              body="Switch between branching ideas and step-by-step process flows."
              delay={0.42}
            />
            <Feature
              icon={Users}
              title="Built for teams"
              body="Share, present, and export — Microsoft sign-in included."
              delay={0.49}
            />
          </div>
        </div>

        {/* Footer */}
        <motion.div
          className="relative z-10 text-[11px]"
          style={{ color: 'var(--text-muted)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          © {new Date().getFullYear()} DigiNode. All rights reserved.
        </motion.div>
      </div>

      {/* ── Right: sign-in pane ──────────────────────────────────────────── */}
      <div className="flex flex-col items-center justify-center px-6 py-12 relative">
        {/* Mobile-only brand header (left pane is hidden on small screens) */}
        <div className="lg:hidden flex items-center gap-2.5 mb-10">
          <div className="w-9 h-9 rounded-xl bg-indigo-500 flex items-center justify-center shadow-md">
            <Layers size={18} color="white" />
          </div>
          <span className="font-bold text-base tracking-tight" style={{ color: 'var(--text-primary)' }}>
            DigiNode
          </span>
        </div>

        <motion.div
          className="w-full max-w-sm"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          <h2 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Welcome back
          </h2>
          <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>
            Sign in with your Microsoft account to continue.
          </p>

          <button
            onClick={handleSignIn}
            disabled={loading}
            className="group mt-8 w-full flex items-center justify-center gap-2.5 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
            style={{
              background: 'var(--text-primary)',
              color: 'var(--panel-bg)',
              boxShadow: '0 6px 20px rgba(26,29,46,0.18)',
            }}
            onMouseEnter={(e) => { if (!loading) e.currentTarget.style.transform = 'translateY(-1px)' }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)' }}
          >
            {loading ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                Redirecting to Microsoft…
              </>
            ) : (
              <>
                <svg width="15" height="15" viewBox="0 0 21 21" aria-hidden>
                  <rect x="1" y="1" width="9" height="9" fill="#F25022" />
                  <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
                  <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
                  <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
                </svg>
                Continue with Microsoft
                <ArrowRight
                  size={14}
                  className="opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200"
                />
              </>
            )}
          </button>

          {error && (
            <p className="text-xs text-center mt-4" style={{ color: '#ef4444' }}>
              {error}
            </p>
          )}

          {/* Divider with text */}
          <div className="flex items-center gap-3 my-7" aria-hidden>
            <div className="flex-1 h-px" style={{ background: 'var(--panel-border)' }} />
            <span className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
              Secure SSO
            </span>
            <div className="flex-1 h-px" style={{ background: 'var(--panel-border)' }} />
          </div>

          <p className="text-xs text-center leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            Single sign-on with Microsoft Entra ID. No passwords to manage.
            By continuing you agree to our{' '}
            <span style={{ color: 'var(--text-secondary)' }}>terms</span> and{' '}
            <span style={{ color: 'var(--text-secondary)' }}>privacy policy</span>.
          </p>
        </motion.div>
      </div>
    </div>
  )
}
