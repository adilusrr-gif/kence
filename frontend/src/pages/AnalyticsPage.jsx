import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { SkeletonStats, SkeletonCard } from '../shared/ui/skeleton/Skeleton'
import { useTranslation } from 'react-i18next'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import {
  Upload, MessageSquare, Globe, GitCompare, Presentation,
  RefreshCw, Activity, Users, TrendingUp, Eye, Info,
} from 'lucide-react'
import { apiAnalyticsOverview, apiAnalyticsTimeline, apiAnalyticsFormats, apiAnalyticsEvents } from '../lib/api'

const EVENT_ICONS = {
  upload: Upload, chat: MessageSquare, translate: Globe,
  compare: GitCompare, presentation: Presentation, convert: RefreshCw, visual_chat: Eye,
}
const EVENT_COLORS = {
  upload: 'var(--accent-primary)', chat: 'var(--color-violet-500)',
  translate: 'var(--status-warning)', compare: 'var(--status-success)',
  presentation: '#a855f7', convert: '#fb923c', visual_chat: '#ec4899',
}
const FMT_COLORS = ['#22d3ee','#6366f1','#f59e0b','#22c55e','#a855f7','#fb923c','#ec4899','#94a3b8']

const STAT_STAGGER = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
}
const STAT_ITEM = {
  hidden:  { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 340, damping: 26 } },
}

function StatCard({ icon: Icon, label, value, sub, color }) {
  return (
    <motion.div className="analytics-stat-card" variants={STAT_ITEM}>
      <div className="analytics-stat-card__icon" style={{ background: `color-mix(in srgb, ${color} 15%, transparent)`, color }}>
        <Icon size={18} />
      </div>
      <div className="analytics-stat-card__body">
        <span className="analytics-stat-card__value">{value ?? '—'}</span>
        <span className="analytics-stat-card__label">{label}</span>
        {sub && <span className="analytics-stat-card__sub">{sub}</span>}
      </div>
    </motion.div>
  )
}

function shortDay(dateStr, days) {
  const d = new Date(dateStr)
  const idx = d.getDay() === 0 ? 6 : d.getDay() - 1
  return days[String(idx)] || String(idx)
}

function formatTs(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) +
    ' ' + d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
}

export default function AnalyticsPage() {
  const { t } = useTranslation()
  const [overview, setOverview] = useState(null)
  const [timeline, setTimeline] = useState([])
  const [formats, setFormats] = useState([])
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const days = {
    '0': t('analytics.days.0'),
    '1': t('analytics.days.1'),
    '2': t('analytics.days.2'),
    '3': t('analytics.days.3'),
    '4': t('analytics.days.4'),
    '5': t('analytics.days.5'),
    '6': t('analytics.days.6'),
  }

  useEffect(() => {
    async function load() {
      try {
        const [ov, tl, fmt, ev] = await Promise.all([
          apiAnalyticsOverview(),
          apiAnalyticsTimeline(7),
          apiAnalyticsFormats(),
          apiAnalyticsEvents(15),
        ])
        setOverview(ov)
        setTimeline((tl.data || []).filter(d => d?.date).map(d => ({ ...d, day: shortDay(d.date, days) })))
        setFormats(fmt.data || [])
        setEvents(ev.data || [])
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const byType = overview?.by_type || {}

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    return (
      <div className="analytics-tooltip">
        <span className="analytics-tooltip__label">{label}</span>
        <span className="analytics-tooltip__value">{t('analytics.tooltipEvents', { count: payload[0].value })}</span>
      </div>
    )
  }

  const PieTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null
    return (
      <div className="analytics-tooltip">
        <span className="analytics-tooltip__label">{payload[0].name}</span>
        <span className="analytics-tooltip__value">{t('analytics.tooltipUploads', { count: payload[0].value })}</span>
      </div>
    )
  }

  const typeRows = Object.entries(EVENT_ICONS).map(([key, Icon]) => ({
    key, Icon, label: t(`analytics.eventTypes.${key}`), color: EVENT_COLORS[key] || 'var(--color-neutral-400)', count: byType[key] || 0,
  })).filter(r => r.count > 0)

  if (loading) {
    return (
      <div className="analytics-page">
        <div className="analytics-header">
          <div style={{ height: '1.875rem', width: 200, borderRadius: 8, background: 'var(--glass-bg)', marginBottom: 8 }} />
          <div style={{ height: '0.82rem', width: 140, borderRadius: 6, background: 'var(--bg-surface-2)' }} />
        </div>
        <SkeletonStats count={4} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16 }}>
          <SkeletonCard rows={6} />
          <SkeletonCard rows={6} />
        </div>
        <SkeletonCard rows={5} style={{ marginTop: 12 }} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="analytics-page analytics-page--error">
        <Info size={20} />
        <span>{t('analytics.loadError', { msg: error })}</span>
      </div>
    )
  }

  return (
    <div className="analytics-page">
      <div className="analytics-header">
        <h1 className="analytics-title">{t('analytics.title')}</h1>
        <span className="analytics-subtitle">{t('analytics.subtitle')}</span>
      </div>

      <motion.div
        className="analytics-stats-row"
        variants={STAT_STAGGER}
        initial="hidden"
        animate="visible"
      >
        <StatCard icon={Activity}   label={t('analytics.statTotalEvents')} value={overview?.total_events} color="var(--accent-primary)" />
        <StatCard icon={TrendingUp} label={t('analytics.statWeekEvents')}  value={overview?.week_events}  color="var(--color-violet-500)" />
        <StatCard icon={Upload}     label={t('analytics.statUploads')}     value={byType.upload || 0}     color="var(--status-warning)" />
        <StatCard icon={Users}      label={t('analytics.statUsers')}       value={overview?.unique_users} color="var(--status-success)" />
      </motion.div>

      <div className="analytics-charts-row">
        <div className="analytics-chart-card">
          <span className="analytics-chart-card__title">{t('analytics.chartActivity')}</span>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={timeline} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <XAxis dataKey="day" tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--bg-surface-3)' }} />
              <Bar dataKey="count" fill="var(--accent-primary)" radius={[4, 4, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="analytics-chart-card">
          <span className="analytics-chart-card__title">{t('analytics.chartFormats')}</span>
          {formats.length === 0 ? (
            <div className="analytics-empty">{t('analytics.noData')}</div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={formats} dataKey="count" nameKey="format" cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={2}>
                  {formats.map((_, i) => (
                    <Cell key={i} fill={FMT_COLORS[i % FMT_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<PieTooltip />} />
                <Legend iconType="circle" iconSize={8} formatter={(v) => <span style={{ color: 'var(--text-secondary)', fontSize: '0.7rem' }}>{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {typeRows.length > 0 && (
        <div className="analytics-chart-card analytics-chart-card--full">
          <span className="analytics-chart-card__title">{t('analytics.chartByType')}</span>
          <div className="analytics-type-list">
            {typeRows.sort((a, b) => b.count - a.count).map(({ key, label, Icon, color, count }) => {
              const maxCount = Math.max(...typeRows.map(r => r.count), 1)
              const pct = (count / maxCount) * 100
              return (
                <div key={key} className="analytics-type-row">
                  <span className="analytics-type-row__icon" style={{ color }}>
                    <Icon size={14} />
                  </span>
                  <span className="analytics-type-row__label">{label}</span>
                  <div className="analytics-type-row__bar-wrap">
                    <div className="analytics-type-row__bar" style={{ width: `${pct}%`, background: color }} />
                  </div>
                  <span className="analytics-type-row__count">{count}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="analytics-chart-card analytics-chart-card--full">
        <span className="analytics-chart-card__title">{t('analytics.recentEvents')}</span>
        {events.length === 0 ? (
          <div className="analytics-empty">{t('analytics.noEvents')}</div>
        ) : (
          <div className="analytics-events-list">
            {events.map((ev) => {
              const Icon = EVENT_ICONS[ev.event_type] || Info
              const color = EVENT_COLORS[ev.event_type] || 'var(--color-neutral-400)'
              const label = ev.event_type ? t(`analytics.eventTypes.${ev.event_type}`, { defaultValue: ev.event_type }) : ev.event_type
              return (
                <div key={ev.id} className="analytics-event-row">
                  <span className="analytics-event-row__icon" style={{ color }}>
                    <Icon size={13} />
                  </span>
                  <span className="analytics-event-row__type">{label}</span>
                  {ev.username && <span className="analytics-event-row__user">{ev.username}</span>}
                  {ev.file_format && <span className="analytics-event-row__fmt">{ev.file_format}</span>}
                  <span className="analytics-event-row__time">{formatTs(ev.created_at)}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
