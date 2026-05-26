import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, MessageSquare, GitCompare, Presentation, Plus, FileText, Users, Database, Activity, Trash2 } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { MetricCard } from '@/shared/ui/metric-card'
import { Stack } from '@/shared/ui/stack'
import { Inline } from '@/shared/ui/inline'
import { getStoredUser, apiDeleteSession } from '../lib/api'

function formatRelTime(ts) {
  const diff = Date.now() - ts
  const h = Math.floor(diff / 3600000)
  const d = Math.floor(diff / 86400000)
  if (d >= 2) return `${d}д назад`
  if (d === 1) return 'вчера'
  if (h >= 1) return `${h}ч назад`
  return 'только что'
}

const FMT_COLORS = {
  PDF:  { bg: 'rgba(239,68,68,0.15)',   color: '#EF4444' },
  DOCX: { bg: 'rgba(59,130,246,0.15)',  color: '#3B82F6' },
  PPTX: { bg: 'rgba(245,158,11,0.15)',  color: '#F59E0B' },
  XLSX: { bg: 'rgba(34,197,94,0.15)',   color: '#22C55E' },
}

function SessionCard({ entry, onContinue, onDelete }) {
  const ext = entry.name?.includes('.') ? entry.name.split('.').pop().toUpperCase() : null
  const fmtStyle = ext && FMT_COLORS[ext] ? FMT_COLORS[ext] : { bg: 'rgba(148,163,184,0.15)', color: '#94a3b8' }

  return (
    <motion.div
      className="dashboard-session-card"
      whileHover={{ y: -1 }}
      transition={{ duration: 0.15 }}
      onClick={() => onContinue(entry)}
      role="button"
      tabIndex={0}
      aria-label={`Открыть сессию: ${entry.name}`}
      onKeyDown={(e) => e.key === 'Enter' && onContinue(entry)}
    >
      <span className="dashboard-session-card__icon" aria-hidden="true">
        <FileText size={16} />
      </span>
      {ext && (
        <span className="session-card__fmt" style={{ background: fmtStyle.bg, color: fmtStyle.color }}>
          {ext}
        </span>
      )}
      <div className="dashboard-session-card__info">
        <span className="dashboard-session-card__name" title={entry.name}>{entry.name}</span>
        <span className="dashboard-session-card__time">{formatRelTime(entry.at)}</span>
      </div>
      <button
        type="button"
        className="dashboard-session-card__delete"
        aria-label="Удалить сессию"
        onClick={(e) => { e.stopPropagation(); onDelete(entry.id) }}
      >
        <Trash2 size={14} />
      </button>
    </motion.div>
  )
}

export default function DashboardPage({ sessionHistory = [], currentUser, onNewSession, onRestoreSession }) {
  const navigate = useNavigate()
  const [stats, setStats] = useState(null)
  const [serverSessions, setServerSessions] = useState([])
  const [deletedIds, setDeletedIds] = useState(new Set())
  const isAdmin = currentUser?.role === 'admin'

  useEffect(() => {
    const token = localStorage.getItem('kence_token')
    if (!token) return
    fetch('/api/sessions', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.ok ? r.json() : [])
      .then((data) => Array.isArray(data) && setServerSessions(data))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!isAdmin) return
    const token = localStorage.getItem('kence_token')
    fetch('/api/auth/stats', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => data && setStats(data))
      .catch(() => {})
  }, [isAdmin])

  const handleDeleteSession = async (id) => {
    setDeletedIds((prev) => new Set([...prev, id]))
    await apiDeleteSession(id).catch(() => {})
  }

  // Merge server sessions with local history, deduplicate by session_id
  const mergedHistory = React.useMemo(() => {
    const localIds = new Set(sessionHistory.map((e) => e.id))
    const fromServer = serverSessions
      .filter((s) => !localIds.has(s.session_id))
      .map((s) => ({
        id: s.session_id,
        name: s.document_name || 'Untitled',
        at: s.last_activity ? new Date(s.last_activity).getTime() : Date.now(),
      }))
    return [...sessionHistory, ...fromServer]
      .filter((e) => !deletedIds.has(e.id))
      .sort((a, b) => b.at - a.at)
      .slice(0, 8)
  }, [sessionHistory, serverSessions, deletedIds])

  const today = new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })

  const quickActions = [
    { icon: Plus,         label: 'Новая сессия', action: onNewSession,                   variant: 'primary' },
    { icon: Upload,       label: 'Загрузить',    action: () => navigate('/upload'),       variant: 'secondary' },
    { icon: GitCompare,   label: 'Сравнение',    action: () => navigate('/compare'),      variant: 'secondary' },
    { icon: Presentation, label: 'Презентация',  action: () => navigate('/presentation'), variant: 'secondary' },
  ]

  return (
    <div className="dashboard-page">
      {/* Welcome header */}
      <div className="dashboard-page__header">
        <h1 className="dashboard-page__greeting">
          Добро пожаловать, <span className="dashboard-page__username">{currentUser?.username || 'User'}</span>
        </h1>
        <p className="dashboard-page__date">{today}</p>
      </div>

      {/* Quick actions */}
      <Stack gap="md">
        <h2 className="dashboard-page__section-title">Быстрые действия</h2>
        <Inline gap="sm" wrap>
          {quickActions.map(({ icon: Icon, label, action, variant }) => (
            <Button
              key={label}
              variant={variant}
              onClick={action}
              leadingIcon={<Icon size={15} />}
            >
              {label}
            </Button>
          ))}
        </Inline>
      </Stack>

      {/* Recent sessions */}
      {mergedHistory.length > 0 && (
        <Stack gap="md">
          <h2 className="dashboard-page__section-title">Недавние сессии</h2>
          <div className="dashboard-page__sessions">
            <AnimatePresence>
              {mergedHistory.map((entry) => (
                <motion.div key={entry.id} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.2 }}>
                  <SessionCard
                    entry={entry}
                    onContinue={(e) => {
                      if (onRestoreSession) onRestoreSession(e)
                      else navigate('/workspace')
                    }}
                    onDelete={handleDeleteSession}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </Stack>
      )}

      {/* Stats (admin only) */}
      {isAdmin && stats && (
        <Stack gap="md">
          <h2 className="dashboard-page__section-title">Статистика системы</h2>
          <div className="dashboard-page__stats">
            <MetricCard
              label="Users"
              value={String(stats.total_users ?? '—')}
              icon={<Users size={18} />}
            />
            <MetricCard
              label="Sessions"
              value={String(stats.total_sessions ?? '—')}
              icon={<Activity size={18} />}
            />
            <MetricCard
              label="Disk Used"
              value={stats.disk_usage ?? '—'}
              icon={<Database size={18} />}
            />
          </div>
        </Stack>
      )}
    </div>
  )
}
