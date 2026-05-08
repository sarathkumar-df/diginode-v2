/**
 * VersionHistoryPanel — slide-in panel showing a map's version snapshots.
 * Owners can restore any version. View-only users can inspect but not restore.
 */
import { useState, useEffect } from 'react'
import { History, RotateCcw, X, Loader2, Clock, AlertCircle } from 'lucide-react'
import { MapVersion, MapPermission } from '@/types'
import { listVersions, restoreVersion } from '@/services/versionService'
import { useMindMapStore } from '@/store/mindmapStore'
import { useConfirm } from '@/components/UI/ConfirmModal'
import { toast } from '@/store/toastStore'

interface Props {
  mapId: string
  permission: MapPermission
  onClose: () => void
}

function formatVersionDate(iso: string): { date: string; time: string } {
  const d = new Date(iso)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const isYesterday = d.toDateString() === yesterday.toDateString()

  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (isToday) return { date: 'Today', time }
  if (isYesterday) return { date: 'Yesterday', time }
  return {
    date: d.toLocaleDateString([], { month: 'short', day: 'numeric' }),
    time,
  }
}

export function VersionHistoryPanel({ mapId, permission, onClose }: Props) {
  const { applyRemoteSnapshot } = useMindMapStore()
  const confirm = useConfirm()
  const [versions, setVersions] = useState<MapVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [restoredId, setRestoredId] = useState<string | null>(null)

  useEffect(() => {
    listVersions(mapId)
      .then(setVersions)
      .catch(() => setError('Failed to load version history.'))
      .finally(() => setLoading(false))
  }, [mapId])

  const handleRestore = async (version: MapVersion) => {
    const ok = await confirm({
      title: 'Restore this version?',
      description: 'Your current map will be saved as a new version first, so you can always undo this.',
      confirmLabel: 'Restore',
    })
    if (!ok) return
    setRestoringId(version.id)
    setError('')
    try {
      const data = await restoreVersion(mapId, version.id)
      applyRemoteSnapshot(mapId, data.nodes, data.edges)
      setRestoredId(version.id)
      // Refresh the list (restoring creates a new snapshot)
      const updated = await listVersions(mapId)
      setVersions(updated)
      setRestoredId(null)
      toast.success({ title: 'Version restored', description: 'Your previous state was saved as a new version.' })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Restore failed.'
      setError(msg)
      toast.error({ title: 'Restore failed', description: msg })
    } finally {
      setRestoringId(null)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.3)' }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="fixed top-0 right-0 h-full w-full max-w-sm z-50 flex flex-col border-l"
        style={{
          background: 'var(--panel-bg)',
          borderColor: 'var(--panel-border)',
          boxShadow: '-8px 0 32px rgba(0,0,0,0.10)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0"
          style={{ borderColor: 'var(--panel-border)' }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: 'var(--brand-light)' }}
            >
              <History size={15} style={{ color: 'var(--brand)' }} />
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                Version History
              </p>
              {!loading && versions.length > 0 && (
                <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  {versions.length} snapshot{versions.length !== 1 ? 's' : ''}
                </p>
              )}
            </div>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={22} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-3 py-16 px-6 text-center">
              <AlertCircle size={24} style={{ color: '#ef4444' }} />
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{error}</p>
            </div>
          ) : versions.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 px-6 text-center">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center"
                style={{ background: 'var(--brand-light)' }}
              >
                <Clock size={20} style={{ color: 'var(--brand)' }} />
              </div>
              <p className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>
                No versions yet
              </p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Versions are saved automatically as you edit. Come back after making some changes.
              </p>
            </div>
          ) : (
            <div className="flex flex-col px-4 py-3 gap-1.5">
              {error && (
                <p className="text-xs text-red-500 px-1 mb-2">{error}</p>
              )}
              {versions.map((version, i) => {
                const { date, time } = formatVersionDate(version.createdAt)
                const isRestoring = restoringId === version.id
                const isRestored = restoredId === version.id
                const isLatest = i === 0

                return (
                  <div
                    key={version.id}
                    className="flex items-center gap-3 px-3 py-3 rounded-xl group transition-colors"
                    style={{ background: isLatest ? 'var(--brand-light)' : 'transparent' }}
                    onMouseEnter={(e) => {
                      if (!isLatest) e.currentTarget.style.background = 'var(--canvas-bg)'
                    }}
                    onMouseLeave={(e) => {
                      if (!isLatest) e.currentTarget.style.background = 'transparent'
                    }}
                  >
                    {/* Timeline dot */}
                    <div className="flex flex-col items-center flex-shrink-0">
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ background: isLatest ? 'var(--brand)' : 'var(--panel-border)' }}
                      />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                          {date} at {time}
                        </p>
                        {isLatest && (
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                            style={{ background: 'var(--brand)', color: 'white' }}
                          >
                            Latest
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        {version.nodeCount} node{version.nodeCount !== 1 ? 's' : ''}
                        {version.edgeCount > 0 && ` · ${version.edgeCount} connection${version.edgeCount !== 1 ? 's' : ''}`}
                      </p>
                    </div>

                    {/* Restore button — owner only, not for latest */}
                    {permission === 'edit' && !isLatest && (
                      <button
                        onClick={() => handleRestore(version)}
                        disabled={restoringId !== null}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium opacity-0 group-hover:opacity-100 transition-all disabled:opacity-40"
                        style={{ background: 'var(--brand-light)', color: 'var(--brand)' }}
                        title="Restore this version"
                      >
                        {isRestoring ? (
                          <Loader2 size={11} className="animate-spin" />
                        ) : isRestored ? (
                          '✓'
                        ) : (
                          <RotateCcw size={11} />
                        )}
                        Restore
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer note */}
        <div
          className="px-5 py-3 border-t flex-shrink-0"
          style={{ borderColor: 'var(--panel-border)' }}
        >
          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {permission === 'edit'
              ? 'Snapshots are auto-saved every 5 minutes while editing. Up to 30 versions are kept.'
              : 'You have view-only access — only the map owner can restore versions.'}
          </p>
        </div>
      </div>
    </>
  )
}
