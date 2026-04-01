import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Users, Trash2, Loader2, Share2, ChevronDown } from 'lucide-react'
import { listShares, shareMap, unshareMap } from '@/services/shareService'
import { listTeams } from '@/services/teamService'
import { MapShare, Team, MapPermission } from '@/types'

interface Props {
  mapId: string
  mapTitle: string
  open: boolean
  onClose: () => void
}

export function ShareModal({ mapId, mapTitle, open, onClose }: Props) {
  const [shares, setShares] = useState<MapShare[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTeamId, setSelectedTeamId] = useState('')
  const [permission, setPermission] = useState<MapPermission>('view')
  const [sharing, setSharing] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError('')
    Promise.all([listShares(mapId), listTeams()])
      .then(([s, t]) => { setShares(s); setTeams(t) })
      .catch(() => setError('Failed to load sharing info.'))
      .finally(() => setLoading(false))
  }, [open, mapId])

  // Teams the map is NOT yet shared with
  const shareableTeams = teams.filter((t) => !shares.find((s) => s.teamId === t.id))

  useEffect(() => {
    setSelectedTeamId(shareableTeams[0]?.id ?? '')
  }, [shares, teams])

  const handleShare = async () => {
    if (!selectedTeamId) return
    setSharing(true)
    setError('')
    try {
      await shareMap(mapId, selectedTeamId, permission)
      const team = teams.find((t) => t.id === selectedTeamId)!
      setShares((prev) => [
        ...prev,
        { teamId: selectedTeamId, teamName: team.name, permission, sharedAt: new Date().toISOString() },
      ])
    } catch (err: any) {
      setError(err.message ?? 'Failed to share.')
    } finally {
      setSharing(false)
    }
  }

  const handleRemove = async (teamId: string) => {
    setRemovingId(teamId)
    try {
      await unshareMap(mapId, teamId)
      setShares((prev) => prev.filter((s) => s.teamId !== teamId))
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="share-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.45)' }}
          onClick={onClose}
        >
          <motion.div
            key="share-modal"
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 12 }}
            transition={{ type: 'spring', stiffness: 500, damping: 35 }}
            className="w-full max-w-md rounded-2xl border shadow-lg p-6 mx-4"
            style={{ background: 'var(--panel-bg)', borderColor: 'var(--panel-border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-500 flex items-center justify-center">
                  <Share2 size={16} color="white" />
                </div>
                <div>
                  <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                    Share map
                  </h2>
                  <p className="text-xs truncate max-w-[200px]" style={{ color: 'var(--text-secondary)' }}>
                    {mapTitle}
                  </p>
                </div>
              </div>
              <button onClick={onClose} style={{ color: 'var(--text-muted)' }}>
                <X size={18} />
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={22} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
              </div>
            ) : (
              <>
                {/* Share with a team */}
                {shareableTeams.length > 0 ? (
                  <div className="mb-5">
                    <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                      Share with a team
                    </label>
                    <div className="flex gap-2">
                      {/* Team select */}
                      <div className="relative flex-1">
                        <select
                          value={selectedTeamId}
                          onChange={(e) => setSelectedTeamId(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border text-sm outline-none appearance-none pr-7"
                          style={{ background: 'var(--canvas-bg)', borderColor: 'var(--panel-border)', color: 'var(--text-primary)' }}
                        >
                          {shareableTeams.map((t) => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </select>
                        <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
                      </div>
                      {/* Permission select */}
                      <div className="relative">
                        <select
                          value={permission}
                          onChange={(e) => setPermission(e.target.value as MapPermission)}
                          className="px-3 py-2 rounded-xl border text-sm outline-none appearance-none pr-7"
                          style={{ background: 'var(--canvas-bg)', borderColor: 'var(--panel-border)', color: 'var(--text-primary)' }}
                        >
                          <option value="view">View</option>
                          <option value="edit">Edit</option>
                        </select>
                        <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
                      </div>
                      <button
                        onClick={handleShare}
                        disabled={sharing || !selectedTeamId}
                        className="px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-1.5 disabled:opacity-60 flex-shrink-0"
                        style={{ background: 'var(--brand)', color: 'white' }}
                      >
                        {sharing ? <Loader2 size={13} className="animate-spin" /> : null}
                        Share
                      </button>
                    </div>
                  </div>
                ) : teams.length === 0 ? (
                  <div
                    className="mb-5 px-4 py-3 rounded-xl text-xs flex items-center gap-2"
                    style={{ background: 'var(--canvas-bg)', color: 'var(--text-muted)' }}
                  >
                    <Users size={14} />
                    You're not in any teams yet. Create a team first to share maps.
                  </div>
                ) : null}

                {error && (
                  <p className="text-xs text-red-500 mb-3">{error}</p>
                )}

                {/* Current shares */}
                {shares.length > 0 && (
                  <div>
                    <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                      Shared with
                    </p>
                    <div className="flex flex-col gap-1.5">
                      {shares.map((share) => (
                        <div
                          key={share.teamId}
                          className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                          style={{ background: 'var(--canvas-bg)' }}
                        >
                          <div
                            className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{ background: 'var(--brand-light)' }}
                          >
                            <Users size={13} style={{ color: 'var(--brand)' }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                              {share.teamName}
                            </p>
                            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                              {share.permission === 'edit' ? 'Can edit' : 'Can view'}
                            </p>
                          </div>
                          <button
                            onClick={() => handleRemove(share.teamId)}
                            disabled={removingId === share.teamId}
                            className="flex-shrink-0 transition-colors hover:text-red-500"
                            style={{ color: 'var(--text-muted)' }}
                            title="Remove share"
                          >
                            {removingId === share.teamId
                              ? <Loader2 size={13} className="animate-spin" />
                              : <Trash2 size={13} />}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {shares.length === 0 && shareableTeams.length === 0 && teams.length > 0 && (
                  <p className="text-xs text-center py-2" style={{ color: 'var(--text-muted)' }}>
                    Shared with all your teams.
                  </p>
                )}
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
