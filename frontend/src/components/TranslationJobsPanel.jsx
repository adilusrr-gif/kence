import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Languages, Loader2, Download, Trash2, CheckCircle2, XCircle, Clock, RefreshCw } from 'lucide-react'
import {
  apiCreateTranslation, apiListTranslations, apiDeleteTranslation,
  downloadTranslation, TRANSLATION_FORMATS,
} from '@/lib/api/translations'
import { useToast } from '@/shared/ui/toast'

const LANGS = [
  { code: 'kz', label: 'KZ' },
  { code: 'ru', label: 'RU' },
  { code: 'en', label: 'EN' },
]

const ACTIVE = new Set(['queued', 'processing'])

function StatusBadge({ status }) {
  const { t } = useTranslation()
  const map = {
    queued:     { icon: Clock,        color: '#64748b', label: t('translations.queued') },
    processing: { icon: Loader2,      color: '#2563eb', label: t('translations.processing'), spin: true },
    completed:  { icon: CheckCircle2, color: '#16a34a', label: t('translations.completed') },
    failed:     { icon: XCircle,      color: '#dc2626', label: t('translations.failed') },
  }
  const s = map[status] || map.queued
  const Icon = s.icon
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: s.color, fontSize: 11, fontWeight: 600 }}>
      <Icon size={12} className={s.spin ? 'animate-spin' : undefined} /> {s.label}
    </span>
  )
}

/**
 * Background document translation: start a job, watch live progress, and download
 * the result in any format. Survives refresh — state is loaded from the server.
 */
export default function TranslationJobsPanel({ sessionId, disabled = false }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [jobs, setJobs] = useState([])
  const [creatingLang, setCreatingLang] = useState(null)
  const prevStatuses = useRef({})

  const refresh = useCallback(async () => {
    try {
      const list = await apiListTranslations(50)
      // Notify on status transitions to a terminal state.
      list.forEach(j => {
        const prev = prevStatuses.current[j.id]
        if (prev && ACTIVE.has(prev) && !ACTIVE.has(j.status)) {
          if (j.status === 'completed') toast.success(t('translations.doneToast', { name: j.document_name || '', lang: j.target_language.toUpperCase() }))
          else if (j.status === 'failed') toast.error(t('translations.failToast', { name: j.document_name || '' }))
        }
        prevStatuses.current[j.id] = j.status
      })
      setJobs(list)
    } catch (e) { /* silent — polling */ }
  }, [t, toast])

  // Initial load + polling while any job is active.
  useEffect(() => { refresh() }, [refresh])
  useEffect(() => {
    const hasActive = jobs.some(j => ACTIVE.has(j.status))
    if (!hasActive) return
    const id = setInterval(refresh, 2500)
    return () => clearInterval(id)
  }, [jobs, refresh])

  const handleStart = async (lang) => {
    if (!sessionId) return
    setCreatingLang(lang)
    try {
      await apiCreateTranslation(sessionId, lang)
      toast.info(t('translations.startedToast', { lang: lang.toUpperCase() }))
      await refresh()
    } catch (e) {
      toast.error(e.message || t('translations.startError'))
    } finally {
      setCreatingLang(null)
    }
  }

  const handleDelete = async (jobId) => {
    try {
      await apiDeleteTranslation(jobId)
      delete prevStatuses.current[jobId]
      setJobs(j => j.filter(x => x.id !== jobId))
    } catch (e) { toast.error(e.message) }
  }

  const handleDownload = async (jobId, fmt) => {
    try { await downloadTranslation(jobId, fmt) }
    catch (e) { toast.error(e.message || t('translations.downloadError')) }
  }

  return (
    <div className="tj-panel" style={{ padding: '8px 10px', borderTop: '1px solid var(--border-subtle, #e2e8f0)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <Languages size={13} style={{ color: 'var(--accent-primary)' }} />
        <span style={{ fontSize: 12, fontWeight: 700 }}>{t('translations.title')}</span>
        <button
          onClick={refresh}
          title={t('translations.refresh')}
          style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted,#64748b)' }}
        >
          <RefreshCw size={12} />
        </button>
      </div>

      {/* Start buttons */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted,#64748b)', alignSelf: 'center' }}>
          {t('translations.translateTo')}
        </span>
        {LANGS.map(l => (
          <button
            key={l.code}
            disabled={disabled || !sessionId || !!creatingLang}
            onClick={() => handleStart(l.code)}
            className="tj-start-btn"
            style={{
              fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 6,
              border: '1px solid var(--border-subtle,#cbd5e1)', cursor: 'pointer',
              background: 'var(--bg-elevated,#fff)',
              opacity: (disabled || !sessionId) ? 0.5 : 1,
            }}
          >
            {creatingLang === l.code ? <Loader2 size={10} className="animate-spin" /> : l.label}
          </button>
        ))}
      </div>

      {/* History */}
      {jobs.length === 0 ? (
        <div style={{ fontSize: 11, color: 'var(--text-muted,#94a3b8)' }}>{t('translations.empty')}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
          {jobs.map(job => (
            <div key={job.id} style={{
              border: '1px solid var(--border-subtle,#e2e8f0)', borderRadius: 8, padding: '6px 8px',
              fontSize: 11, background: 'var(--bg-subtle,#f8fafc)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  {job.document_name || `#${job.id}`} → {job.target_language?.toUpperCase()}
                </span>
                <StatusBadge status={job.status} />
                <button onClick={() => handleDelete(job.id)} title={t('translations.delete')}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                  <Trash2 size={12} />
                </button>
              </div>

              {/* Progress bar */}
              {ACTIVE.has(job.status) && (
                <div style={{ marginTop: 5 }}>
                  <div style={{ height: 5, borderRadius: 3, background: '#e2e8f0', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${job.progress || 0}%`, background: '#2563eb', transition: 'width .4s' }} />
                  </div>
                  <span style={{ fontSize: 10, color: '#64748b' }}>
                    {job.progress || 0}% · {job.done_chunks}/{job.total_chunks}
                  </span>
                </div>
              )}

              {job.status === 'failed' && job.error && (
                <div style={{ marginTop: 4, color: '#dc2626', fontSize: 10 }}>{job.error}</div>
              )}

              {/* Download menu */}
              {job.status === 'completed' && (
                <div style={{ marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                  <Download size={11} style={{ color: '#64748b' }} />
                  {TRANSLATION_FORMATS.map(fmt => (
                    <button key={fmt} onClick={() => handleDownload(job.id, fmt)}
                      style={{
                        fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 5,
                        border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer',
                      }}>
                      {fmt.toUpperCase()}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
