import React, { useEffect, useState, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import {
  Upload, MessageSquare, GitCompare, Presentation, Plus, FileText,
  Trash2, RefreshCw, Bot, Activity, TrendingUp, Search, FolderOpen, ArrowRight, Brain,
} from 'lucide-react'
import { BarChart, Bar, ResponsiveContainer, Tooltip as RTooltip } from 'recharts'
import { Button } from '@/shared/ui/button'
import { Stack } from '@/shared/ui/stack'
import { useToast } from '@/shared/ui/toast'
import { apiDeleteSession, apiAnalyticsOverview, apiAnalyticsTimeline } from '../lib/api'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRelTime(ts, t) {
  const diff = Date.now() - ts
  const d = Math.floor(diff / 86400000)
  const h = Math.floor(diff / 3600000)
  if (d >= 2) return t('dashboard.time.days_other', { count: d })
  if (d === 1) return t('dashboard.time.yesterday')
  if (h >= 1) return t('dashboard.time.hours_other', { count: h })
  return t('dashboard.time.justNow')
}

const FMT_COLORS = {
  PDF:  { bg: 'var(--color-fmt-pdf-bg)',   color: 'var(--color-fmt-pdf)' },
  DOCX: { bg: 'var(--color-fmt-docx-bg)',  color: 'var(--color-fmt-docx)' },
  PPTX: { bg: 'var(--color-fmt-pptx-bg)',  color: 'var(--color-fmt-pptx)' },
  XLSX: { bg: 'var(--color-fmt-xlsx-bg)',  color: 'var(--color-fmt-xlsx)' },
}

function shortDay(dateStr) {
  return new Date(dateStr).toLocaleDateString(undefined, { weekday: 'short' })
}

function useCountUp(target, duration = 700) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!target) return
    let frame = 0
    const steps = Math.ceil(duration / 16)
    const id = setInterval(() => {
      frame++
      setCount(Math.round((frame / steps) * target))
      if (frame >= steps) clearInterval(id)
    }, 16)
    return () => clearInterval(id)
  }, [target, duration])
  return count
}

// ── Animation variants ────────────────────────────────────────────────────────

const CONTAINER_VARIANTS = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.055, delayChildren: 0.06 } },
}

const ITEM_VARIANTS = {
  hidden:  { opacity: 0, y: 12, scale: 0.94 },
  visible: { opacity: 1, y: 0,  scale: 1,
    transition: { type: 'spring', stiffness: 400, damping: 28 } },
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MiniStat({ icon: Icon, label, value, color }) {
  const displayed = useCountUp(value ?? 0)
  return (
    <div className="dashboard-mini-stat">
      <div className="dashboard-mini-stat__icon" style={{ color, background: `${color}1a` }}>
        <Icon size={15} />
      </div>
      <div className="dashboard-mini-stat__body">
        <span className="dashboard-mini-stat__value">{displayed}</span>
        <span className="dashboard-mini-stat__label">{label}</span>
      </div>
    </div>
  )
}

function FeatureTile({ feature, onClick }) {
  const { icon: Icon, label, desc, accent } = feature
  return (
    <motion.button
      type="button"
      className={`dashboard-feature-tile${accent ? ' dashboard-feature-tile--accent' : ''}`}
      onClick={onClick}
      variants={ITEM_VARIANTS}
      whileHover={{ y: -3, transition: { duration: 0.14 } }}
      whileTap={{ scale: 0.96 }}
    >
      <div className="dashboard-feature-tile__icon"><Icon size={20} /></div>
      <span className="dashboard-feature-tile__label">{label}</span>
      <span className="dashboard-feature-tile__desc">{desc}</span>
    </motion.button>
  )
}

const SparkTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="dashboard-spark-tip">
      <span>{label}</span>
      <strong>{payload[0].value}</strong>
    </div>
  )
}

function SessionCard({ entry, onContinue, onDelete, isDeleting, t }) {
  const ext = entry.name?.includes('.') ? entry.name.split('.').pop().toUpperCase() : null
  const fmtStyle = ext && FMT_COLORS[ext] ? FMT_COLORS[ext] : { bg: 'var(--color-fmt-other-bg)', color: 'var(--color-fmt-other)' }
  return (
    <motion.div
      className="dashboard-session-card"
      variants={ITEM_VARIANTS}
      whileHover={{ x: 3, transition: { duration: 0.12 } }}
      onClick={() => onContinue(entry)}
      role="button"
      tabIndex={0}
      aria-label={t('dashboard.open', { name: entry.name })}
      onKeyDown={(e) => e.key === 'Enter' && onContinue(entry)}
    >
      <span className="dashboard-session-card__icon" aria-hidden="true">
        <FileText size={15} />
      </span>
      {ext && (
        <span className="session-card__fmt" style={{ background: fmtStyle.bg, color: fmtStyle.color }}>
          {ext}
        </span>
      )}
      <div className="dashboard-session-card__info">
        <span className="dashboard-session-card__name" title={entry.name}>{entry.name}</span>
        <span className="dashboard-session-card__time">{formatRelTime(entry.at, t)}</span>
      </div>
      <ArrowRight size={13} className="dashboard-session-card__chevron" aria-hidden="true" />
      <button
        type="button"
        className="dashboard-session-card__delete"
        aria-label={t('dashboard.delete')}
        disabled={isDeleting}
        onClick={(e) => { e.stopPropagation(); onDelete(entry.id) }}
        style={{ opacity: isDeleting ? 0.4 : undefined }}
      >
        <Trash2 size={13} />
      </button>
    </motion.div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function DashboardPage({ sessionHistory = [], currentUser, onNewSession, onRestoreSession, onDeleteSession }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const toast = useToast()
  const [serverSessions, setServerSessions] = useState([])
  const [deletedIds, setDeletedIds] = useState(new Set())
  const [deletingIds, setDeletingIds] = useState(new Set())
  const [overview, setOverview] = useState(null)
  const [timeline, setTimeline] = useState([])
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const debounceRef = useRef(null)

  const FEATURES = [
    { icon: Plus,         label: t('dashboard.features.new'),          desc: t('dashboard.features.newDesc'),          action: 'new',           accent: true },
    { icon: Upload,       label: t('dashboard.features.upload'),        desc: t('dashboard.features.uploadDesc'),        path: '/upload'                       },
    { icon: GitCompare,   label: t('dashboard.features.compare'),       desc: t('dashboard.features.compareDesc'),       path: '/compare'                      },
    { icon: Presentation, label: t('dashboard.features.presentation'),  desc: t('dashboard.features.presentationDesc'),  path: '/presentation'                 },
    { icon: RefreshCw,    label: t('dashboard.features.convert'),       desc: t('dashboard.features.convertDesc'),       path: '/convert'                      },
    { icon: Brain,        label: t('dashboard.features.insights'),       desc: t('dashboard.features.insightsDesc'),      path: '/insights'                     },
  ]

  useEffect(() => {
    const token = localStorage.getItem('kence_token')
    if (!token) return

    fetch('/api/sessions', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then(data => Array.isArray(data) && setServerSessions(data))
      .catch(() => toast.error(t('common.loadError')))

    Promise.allSettled([apiAnalyticsOverview(), apiAnalyticsTimeline(7)])
      .then(([ovResult, tlResult]) => {
        if (ovResult.status === 'fulfilled') setOverview(ovResult.value)
        if (tlResult.status === 'fulfilled')
          setTimeline((tlResult.value?.data || []).filter(d => d?.date).map(d => ({ day: shortDay(d.date), count: d.count })))
      })
  }, [])

  const handleDelete = async (id) => {
    if (deletingIds.has(id)) return
    setDeletingIds(prev => new Set([...prev, id]))
    setDeletedIds(prev => new Set([...prev, id]))
    setServerSessions(prev => prev.filter(s => s.session_id !== id))
    onDeleteSession?.(id)
    await apiDeleteSession(id).catch(() => {})
    setDeletingIds(prev => { const n = new Set(prev); n.delete(id); return n })
  }

  const mergedHistory = useMemo(() => {
    const localIds = new Set(sessionHistory.map(e => e.id))
    const fromServer = serverSessions
      .filter(s => !localIds.has(s.session_id))
      .map(s => ({
        id: s.session_id,
        name: s.document_name || t('common.untitled'),
        at: s.last_activity ? new Date(s.last_activity).getTime() : Date.now(),
      }))
    return [...sessionHistory, ...fromServer]
      .filter(e => !deletedIds.has(e.id))
      .sort((a, b) => b.at - a.at)
      .slice(0, 12)
  }, [sessionHistory, serverSessions, deletedIds, t])

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 200)
    return () => clearTimeout(debounceRef.current)
  }, [search])

  const filteredHistory = useMemo(() =>
    debouncedSearch ? mergedHistory.filter(e => e.name.toLowerCase().includes(debouncedSearch.toLowerCase())) : mergedHistory,
    [mergedHistory, debouncedSearch]
  )

  const handleFeature = (feature) => {
    if (feature.action === 'new') onNewSession?.()
    else if (feature.path) navigate(feature.path)
  }

  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
  const byType = overview?.by_type || {}

  return (
    <div className="dashboard-page">

      {/* Header */}
      <motion.div
        className="dashboard-page__header"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28 }}
      >
        <h1 className="dashboard-page__greeting">
          {t('dashboard.greeting')},{' '}
          <span className="dashboard-page__username">{currentUser?.username || 'User'}</span>
        </h1>
        <p className="dashboard-page__date">{today}</p>
      </motion.div>

      {/* Bento grid: stats + sparkline */}
      <motion.div
        className="dashboard-bento"
        variants={CONTAINER_VARIANTS}
        initial="hidden"
        animate="visible"
      >
        {overview && (
          <>
            <motion.div className="dashboard-bento__stat" variants={ITEM_VARIANTS}>
              <MiniStat icon={Activity}      label={t('dashboard.stats.totalEvents')} value={overview.total_events} color="var(--accent-primary)" />
            </motion.div>
            <motion.div className="dashboard-bento__stat" variants={ITEM_VARIANTS}>
              <MiniStat icon={TrendingUp}    label={t('dashboard.stats.week')}        value={overview.week_events}  color="#6366f1" />
            </motion.div>
            <motion.div className="dashboard-bento__stat" variants={ITEM_VARIANTS}>
              <MiniStat icon={Upload}        label={t('dashboard.stats.uploads')}     value={byType.upload || 0}    color="var(--color-fmt-pptx)" />
            </motion.div>
            <motion.div className="dashboard-bento__stat" variants={ITEM_VARIANTS}>
              <MiniStat icon={MessageSquare} label={t('dashboard.stats.chats')}       value={byType.chat   || 0}    color="var(--color-fmt-xlsx)" />
            </motion.div>
          </>
        )}

        {timeline.length > 0 && (
          <motion.div className="dashboard-bento__spark" variants={ITEM_VARIANTS}>
            <div className="dashboard-sparkline">
              <div className="dashboard-sparkline__header">
                <span className="dashboard-page__section-title">{t('dashboard.activity')}</span>
                <button type="button" className="dashboard-sparkline__link" onClick={() => navigate('/analytics')}>
                  {t('dashboard.more')} <ArrowRight size={11} />
                </button>
              </div>
              <ResponsiveContainer width="100%" height={72}>
                <BarChart data={timeline} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                  <Bar dataKey="count" fill="var(--accent-primary)" radius={[3, 3, 0, 0]} maxBarSize={32} />
                  <RTooltip content={<SparkTip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </motion.div>
        )}
      </motion.div>

      {/* Feature grid */}
      <Stack gap="sm">
        <h2 className="dashboard-page__section-title">{t('dashboard.tools')}</h2>
        <motion.div
          className="dashboard-features"
          variants={CONTAINER_VARIANTS}
          initial="hidden"
          animate="visible"
        >
          {FEATURES.map((f) => (
            <FeatureTile key={f.label} feature={f} onClick={() => handleFeature(f)} />
          ))}
        </motion.div>
      </Stack>

      {/* Recent sessions */}
      <Stack gap="sm">
        <div className="dashboard-sessions-header">
          <h2 className="dashboard-page__section-title">{t('dashboard.recentSessions')}</h2>
          {mergedHistory.length > 3 && (
            <div className="dashboard-search">
              <Search size={12} className="dashboard-search__icon" />
              <input
                type="text"
                className="dashboard-search__input"
                placeholder={t('dashboard.search')}
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          )}
        </div>

        {mergedHistory.length === 0 ? (
          <motion.div
            className="dashboard-empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
          >
            <FolderOpen size={30} strokeWidth={1.4} />
            <span>{t('dashboard.noSessions')}</span>
            <Button variant="secondary" leadingIcon={<Upload size={14} />} onClick={() => navigate('/upload')}>
              {t('dashboard.uploadFirst')}
            </Button>
          </motion.div>
        ) : (
          <motion.div
            className="dashboard-page__sessions"
            variants={CONTAINER_VARIANTS}
            initial="hidden"
            animate="visible"
          >
            <AnimatePresence>
              {filteredHistory.map((entry) => (
                <motion.div
                  key={entry.id}
                  exit={{ opacity: 0, x: 20, transition: { duration: 0.18 } }}
                >
                  <SessionCard
                    entry={entry}
                    t={t}
                    onContinue={e => { if (onRestoreSession) onRestoreSession(e); else navigate('/workspace') }}
                    onDelete={handleDelete}
                    isDeleting={deletingIds.has(entry.id)}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
            {filteredHistory.length === 0 && search && (
              <p className="dashboard-empty-search">{t('dashboard.noResults', { query: search })}</p>
            )}
          </motion.div>
        )}
      </Stack>

    </div>
  )
}
