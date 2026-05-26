import React, { useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import {
  Upload, MessageSquare, Globe, GitCompare, Presentation,
  RefreshCw, Activity, Users, TrendingUp, Eye, Info,
} from 'lucide-react'
import { apiAnalyticsOverview, apiAnalyticsTimeline, apiAnalyticsFormats, apiAnalyticsEvents } from '../lib/api'

const EVENT_META = {
  upload:       { label: 'Загрузка',     icon: Upload,       color: '#22d3ee' },
  chat:         { label: 'Чат',          icon: MessageSquare, color: '#6366f1' },
  translate:    { label: 'Перевод',      icon: Globe,        color: '#f59e0b' },
  compare:      { label: 'Сравнение',    icon: GitCompare,   color: '#22c55e' },
  presentation: { label: 'Презентация',  icon: Presentation, color: '#a855f7' },
  convert:      { label: 'Конвертация',  icon: RefreshCw,    color: '#fb923c' },
  visual_chat:  { label: 'Визуал. чат', icon: Eye,          color: '#ec4899' },
}

const FMT_COLORS = ['#22d3ee','#6366f1','#f59e0b','#22c55e','#a855f7','#fb923c','#ec4899','#94a3b8']

function StatCard({ icon: Icon, label, value, sub, color }) {
  return (
    <div className="analytics-stat-card">
      <div className="analytics-stat-card__icon" style={{ background: `${color}18`, color }}>
        <Icon size={18} />
      </div>
      <div className="analytics-stat-card__body">
        <span className="analytics-stat-card__value">{value ?? '—'}</span>
        <span className="analytics-stat-card__label">{label}</span>
        {sub && <span className="analytics-stat-card__sub">{sub}</span>}
      </div>
    </div>
  )
}

const SHORT_DAYS = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс']

function shortDay(dateStr) {
  const d = new Date(dateStr)
  return SHORT_DAYS[d.getDay() === 0 ? 6 : d.getDay() - 1]
}

function formatTs(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) +
    ' ' + d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="analytics-tooltip">
      <span className="analytics-tooltip__label">{label}</span>
      <span className="analytics-tooltip__value">{payload[0].value} событий</span>
    </div>
  )
}

const PieTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="analytics-tooltip">
      <span className="analytics-tooltip__label">{payload[0].name}</span>
      <span className="analytics-tooltip__value">{payload[0].value} загрузок</span>
    </div>
  )
}

export default function AnalyticsPage() {
  const [overview, setOverview] = useState(null)
  const [timeline, setTimeline] = useState([])
  const [formats, setFormats] = useState([])
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

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
        setTimeline((tl.data || []).map(d => ({ ...d, day: shortDay(d.date) })))
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
  const typeRows = Object.entries(EVENT_META).map(([key, meta]) => ({
    key, ...meta, count: byType[key] || 0,
  })).filter(r => r.count > 0)

  if (loading) {
    return (
      <div className="analytics-page analytics-page--loading">
        <div className="analytics-loader" />
        <span>Загрузка аналитики…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="analytics-page analytics-page--error">
        <Info size={20} />
        <span>Ошибка загрузки: {error}</span>
      </div>
    )
  }

  return (
    <div className="analytics-page">
      <div className="analytics-header">
        <h1 className="analytics-title">Аналитика</h1>
        <span className="analytics-subtitle">Статистика использования системы</span>
      </div>

      {/* Stat cards */}
      <div className="analytics-stats-row">
        <StatCard icon={Activity}     label="Всего событий"  value={overview?.total_events} color="#22d3ee" />
        <StatCard icon={TrendingUp}   label="За 7 дней"      value={overview?.week_events}  color="#6366f1" />
        <StatCard icon={Upload}       label="Загрузок"       value={byType.upload || 0}     color="#f59e0b" />
        <StatCard icon={Users}        label="Пользователей"  value={overview?.unique_users} color="#22c55e" />
      </div>

      {/* Charts */}
      <div className="analytics-charts-row">
        {/* Timeline bar chart */}
        <div className="analytics-chart-card">
          <span className="analytics-chart-card__title">Активность (7 дней)</span>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={timeline} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <XAxis dataKey="day" tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--bg-surface-3)' }} />
              <Bar dataKey="count" fill="#22d3ee" radius={[4, 4, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Format pie */}
        <div className="analytics-chart-card">
          <span className="analytics-chart-card__title">Форматы файлов</span>
          {formats.length === 0 ? (
            <div className="analytics-empty">Нет данных</div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={formats}
                  dataKey="count"
                  nameKey="format"
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={75}
                  paddingAngle={2}
                >
                  {formats.map((_, i) => (
                    <Cell key={i} fill={FMT_COLORS[i % FMT_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<PieTooltip />} />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  formatter={(v) => <span style={{ color: 'var(--text-secondary)', fontSize: '0.7rem' }}>{v}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* By event type */}
      {typeRows.length > 0 && (
        <div className="analytics-chart-card analytics-chart-card--full">
          <span className="analytics-chart-card__title">По типу операции</span>
          <div className="analytics-type-list">
            {typeRows.sort((a, b) => b.count - a.count).map(({ key, label, icon: Icon, color, count }) => {
              const maxCount = Math.max(...typeRows.map(r => r.count), 1)
              const pct = (count / maxCount) * 100
              return (
                <div key={key} className="analytics-type-row">
                  <span className="analytics-type-row__icon" style={{ color }}>
                    <Icon size={14} />
                  </span>
                  <span className="analytics-type-row__label">{label}</span>
                  <div className="analytics-type-row__bar-wrap">
                    <div
                      className="analytics-type-row__bar"
                      style={{ width: `${pct}%`, background: color }}
                    />
                  </div>
                  <span className="analytics-type-row__count">{count}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Recent events */}
      <div className="analytics-chart-card analytics-chart-card--full">
        <span className="analytics-chart-card__title">Последние события</span>
        {events.length === 0 ? (
          <div className="analytics-empty">Событий пока нет. Загрузите документ и начните работу.</div>
        ) : (
          <div className="analytics-events-list">
            {events.map((ev) => {
              const meta = EVENT_META[ev.event_type] || { label: ev.event_type, icon: Info, color: '#94a3b8' }
              const Icon = meta.icon
              return (
                <div key={ev.id} className="analytics-event-row">
                  <span className="analytics-event-row__icon" style={{ color: meta.color }}>
                    <Icon size={13} />
                  </span>
                  <span className="analytics-event-row__type">{meta.label}</span>
                  {ev.username && (
                    <span className="analytics-event-row__user">{ev.username}</span>
                  )}
                  {ev.file_format && (
                    <span className="analytics-event-row__fmt">{ev.file_format}</span>
                  )}
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
