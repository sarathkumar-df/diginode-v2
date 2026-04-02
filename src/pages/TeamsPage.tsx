import { useState, useEffect } from 'react'
import { useCurrentUser } from '@/auth/AuthProvider'
import { AppSidebar } from '@/components/Layout/AppSidebar'
import { useConfirm } from '@/components/UI/ConfirmModal'
import { Team, TeamDetail, TeamMember } from '@/types'
import {
  listTeams, createTeam, fetchTeam, deleteTeam,
  removeMember, createInvite,
} from '@/services/teamService'
import {
  Users, Plus, Trash2, Crown, X, UserMinus,
  Link, Loader2, Copy, Check, AlertCircle,
} from 'lucide-react'
import { v4 as uuidv4 } from 'uuid'

// ── Create team modal ─────────────────────────────────────────────────────────

function CreateTeamModal({ onClose, onCreate }: {
  onClose: () => void
  onCreate: (team: Team) => void
}) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const user = useCurrentUser()

  const handleCreate = async () => {
    if (!name.trim()) return
    setSaving(true)
    setError('')
    try {
      const id = uuidv4()
      await createTeam(id, name.trim())
      onCreate({
        id,
        name: name.trim(),
        ownerId: user?.id ?? '',
        role: 'owner',
        memberCount: 1,
        createdAt: new Date().toISOString(),
      })
      onClose()
    } catch {
      setError('Failed to create team. Please try again.')
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border p-6 mx-4"
        style={{ background: 'var(--panel-bg)', borderColor: 'var(--panel-border)', boxShadow: '0 8px 32px rgba(0,0,0,0.12)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Create a team</h2>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X size={16} /></button>
        </div>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
          placeholder="Team name"
          className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none mb-4"
          style={{ background: 'var(--canvas-bg)', borderColor: 'var(--panel-border)', color: 'var(--text-primary)' }}
        />
        {error && <p className="text-xs text-red-500 mb-3">{error}</p>}
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border text-sm font-medium"
            style={{ borderColor: 'var(--panel-border)', color: 'var(--text-secondary)' }}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={saving || !name.trim()}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-60 transition-opacity hover:opacity-90"
            style={{ background: 'var(--brand)', color: 'white' }}
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : null}
            Create team
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Invite link modal ─────────────────────────────────────────────────────────

function InviteLinkModal({ teamId, onClose }: { teamId: string; onClose: () => void }) {
  const [loading, setLoading] = useState(true)
  const [inviteUrl, setInviteUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    createInvite(teamId)
      .then(({ token }) => setInviteUrl(`${window.location.origin}/invite/${token}`))
      .catch(() => setError('Failed to generate invite link.'))
      .finally(() => setLoading(false))
  }, [teamId])

  const handleCopy = () => {
    navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border p-6 mx-4"
        style={{ background: 'var(--panel-bg)', borderColor: 'var(--panel-border)', boxShadow: '0 8px 32px rgba(0,0,0,0.12)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Link size={15} style={{ color: 'var(--brand)' }} />
            <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Invite link</h2>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X size={16} /></button>
        </div>
        <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
          Share this link to invite anyone. Expires in 7 days.
        </p>
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 size={20} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
          </div>
        ) : error ? (
          <p className="text-xs text-red-500 text-center py-2">{error}</p>
        ) : (
          <div className="flex gap-2">
            <input
              readOnly
              value={inviteUrl}
              className="flex-1 px-3 py-2 rounded-xl border text-xs outline-none truncate"
              style={{ background: 'var(--canvas-bg)', borderColor: 'var(--panel-border)', color: 'var(--text-secondary)' }}
            />
            <button
              onClick={handleCopy}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
              style={{ background: copied ? '#22c55e' : 'var(--brand)', color: 'white' }}
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Team detail panel (slide-in from right) ───────────────────────────────────

function TeamPanel({ teamId, currentUserId, onClose, onDeleted }: {
  teamId: string
  currentUserId: string
  onClose: () => void
  onDeleted: () => void
}) {
  const confirm = useConfirm()
  const [detail, setDetail] = useState<TeamDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [showInvite, setShowInvite] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)

  useEffect(() => {
    fetchTeam(teamId).then(setDetail).finally(() => setLoading(false))
  }, [teamId])

  const handleRemove = async (member: TeamMember) => {
    const ok = await confirm({
      title: `Remove ${member.name}?`,
      description: 'They will lose access to all shared maps.',
      confirmLabel: 'Remove',
      danger: true,
    })
    if (!ok) return
    setRemoving(member.id)
    try {
      await removeMember(teamId, member.id)
      setDetail((d) => d ? { ...d, members: d.members.filter((m) => m.id !== member.id), memberCount: d.memberCount - 1 } : d)
    } finally {
      setRemoving(null)
    }
  }

  const handleLeave = async () => {
    const ok = await confirm({
      title: 'Leave this team?',
      description: 'You will lose access to all maps shared with this team.',
      confirmLabel: 'Leave',
      danger: true,
    })
    if (!ok) return
    await removeMember(teamId, currentUserId)
    onDeleted()
  }

  const handleDelete = async () => {
    const ok = await confirm({
      title: `Delete "${detail?.name}"?`,
      description: 'This will remove the team and all its member access. This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    await deleteTeam(teamId)
    onDeleted()
  }

  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.25)' }} onClick={onClose} />
      <div
        className="fixed top-0 right-0 h-full w-full max-w-sm z-50 flex flex-col border-l"
        style={{ background: 'var(--panel-bg)', borderColor: 'var(--panel-border)', boxShadow: '-8px 0 32px rgba(0,0,0,0.10)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0" style={{ borderColor: 'var(--panel-border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'var(--brand-light)' }}>
              <Users size={16} style={{ color: 'var(--brand)' }} />
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                {loading ? '…' : detail?.name}
              </p>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                {detail ? `${detail.members.length} member${detail.members.length !== 1 ? 's' : ''}` : ''}
              </p>
            </div>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X size={16} /></button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 size={24} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
          </div>
        ) : detail ? (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Members</p>
                {detail.myRole === 'owner' && (
                  <button
                    onClick={() => setShowInvite(true)}
                    className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors"
                    style={{ background: 'var(--brand-light)', color: 'var(--brand)' }}
                  >
                    <Link size={11} /> Invite link
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-1">
                {detail.members.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl group"
                    style={{ background: member.id === currentUserId ? 'var(--brand-light)' : 'transparent' }}
                  >
                    <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                      {member.name?.charAt(0).toUpperCase() ?? '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                        {member.name}
                        {member.id === currentUserId && <span className="ml-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>(you)</span>}
                      </p>
                      <p className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>{member.email}</p>
                    </div>
                    {member.role === 'owner' ? (
                      <Crown size={13} style={{ color: '#f59e0b', flexShrink: 0 }} />
                    ) : detail.myRole === 'owner' ? (
                      <button
                        onClick={() => handleRemove(member)}
                        disabled={removing === member.id}
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Remove member"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {removing === member.id ? <Loader2 size={13} className="animate-spin" /> : <UserMinus size={13} />}
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
            <div className="px-5 py-4 border-t flex-shrink-0" style={{ borderColor: 'var(--panel-border)' }}>
              {detail.myRole === 'owner' ? (
                <button
                  onClick={handleDelete}
                  className="w-full py-2.5 rounded-xl border text-sm font-medium flex items-center justify-center gap-1.5 transition-colors hover:bg-red-50 dark:hover:bg-red-900/20"
                  style={{ borderColor: '#ef4444', color: '#ef4444' }}
                >
                  <Trash2 size={13} /> Delete team
                </button>
              ) : (
                <button
                  onClick={handleLeave}
                  className="w-full py-2.5 rounded-xl border text-sm font-medium flex items-center justify-center gap-1.5 transition-colors hover:bg-red-50 dark:hover:bg-red-900/20"
                  style={{ borderColor: '#ef4444', color: '#ef4444' }}
                >
                  Leave team
                </button>
              )}
            </div>
          </>
        ) : null}
      </div>
      {showInvite && <InviteLinkModal teamId={teamId} onClose={() => setShowInvite(false)} />}
    </>
  )
}

// ── Team card ─────────────────────────────────────────────────────────────────

function TeamCard({ team, onClick }: { team: Team; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group flex items-center gap-4 p-4 rounded-2xl border text-left transition-all duration-150 hover:shadow-md w-full"
      style={{ background: 'var(--panel-bg)', borderColor: 'var(--panel-border)' }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--brand)' }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--panel-border)' }}
    >
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--brand-light)' }}>
        <Users size={18} style={{ color: 'var(--brand)' }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{team.name}</p>
          {team.role === 'owner' && <Crown size={11} style={{ color: '#f59e0b', flexShrink: 0 }} />}
        </div>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
          {team.memberCount} member{team.memberCount !== 1 ? 's' : ''}
        </p>
      </div>
      <div
        className="text-xs font-medium px-2.5 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
        style={{ background: 'var(--brand-light)', color: 'var(--brand)' }}
      >
        Open
      </div>
    </button>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function TeamsPage() {
  const user = useCurrentUser()
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)

  useEffect(() => {
    listTeams().then(setTeams).finally(() => setLoading(false))
  }, [])

  const handleCreated = (team: Team) => setTeams((prev) => [team, ...prev])

  const handleTeamDeleted = () => {
    setSelectedTeamId(null)
    listTeams().then(setTeams)
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--canvas-bg)' }}>
      <AppSidebar activeTab="teams" />

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div
          className="flex items-center justify-between px-8 py-5 flex-shrink-0 border-b"
          style={{ borderColor: 'var(--panel-border)', background: 'var(--panel-bg)' }}
        >
          <div>
            <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Teams</h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {loading ? 'Loading…' : `${teams.length} team${teams.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity shadow-sm"
            style={{ background: 'var(--brand)', color: 'white' }}
          >
            <Plus size={14} /> New Team
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-8 py-8">
          {loading ? (
            <div className="flex items-center justify-center py-32">
              <Loader2 size={24} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
            </div>
          ) : teams.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-6">
              <div className="w-20 h-20 rounded-3xl flex items-center justify-center shadow-inner" style={{ background: 'var(--brand-light)' }}>
                <Users size={32} style={{ color: 'var(--brand)' }} />
              </div>
              <div className="text-center">
                <p className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>No teams yet</p>
                <p className="text-sm mt-1.5 max-w-xs" style={{ color: 'var(--text-muted)' }}>
                  Create a team and invite your colleagues to collaborate on shared maps.
                </p>
              </div>
              <button
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity shadow-sm"
                style={{ background: 'var(--brand)', color: 'white' }}
              >
                <Plus size={14} /> Create your first team
              </button>
            </div>
          ) : (
            <div className="max-w-2xl flex flex-col gap-3">
              {teams.map((team) => (
                <TeamCard key={team.id} team={team} onClick={() => setSelectedTeamId(team.id)} />
              ))}
            </div>
          )}
        </div>
      </div>

      {showCreate && (
        <CreateTeamModal
          onClose={() => setShowCreate(false)}
          onCreate={handleCreated}
        />
      )}

      {selectedTeamId && (
        <TeamPanel
          teamId={selectedTeamId}
          currentUserId={user?.id ?? ''}
          onClose={() => setSelectedTeamId(null)}
          onDeleted={handleTeamDeleted}
        />
      )}
    </div>
  )
}
