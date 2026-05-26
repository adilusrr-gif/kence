import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from 'recharts'
import useOrgStore from '../shared/stores/orgStore'
import { apiGetKPI, apiGetKPITrend, apiExportReport } from '../lib/api'

const PERIODS = [{ value: 'day', label: 'День' }, { value: 'week', label: 'Неделя' }, { value: 'month', label: 'Месяц' }]

export default function ExecutiveDashboardPage({ currentUser }) {
  const { currentOrgId, currentOrgName } = useOrgStore()
  const [period, setPeriod] = useState('day')
  const [kpi, setKpi] = useState(null)
  const [trend, setTrend] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!currentOrgId) return
    setLoading(true)
    Promise.all([apiGetKPI(currentOrgId, period), apiGetKPITrend(currentOrgId, period, 7)])
      .then(([k, t]) => { setKpi(k); setTrend(t) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [currentOrgId, period])

  const handleExport = (fmt) => {
    const url = apiExportReport(currentOrgId, period, fmt)
    window.open(url, '_blank')
  }

  const s = {
    page: { padding: '2rem', maxWidth: 1100, margin: '0 auto', color: 'var(--text-primary)' },
    header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' },
    title: { fontSize: 22, fontWeight: 700 },
    toolbar: { display: 'flex', gap: 8 },
    periodBtn: (a) => ({ padding: '0.4rem 0.85rem', background: a ? 'var(--accent)' : 'var(--bg-hover)', border: 'none', borderRadius: 6, cursor: 'pointer', color: a ? '#fff' : 'var(--text-primary)', fontSize: 13 }),
    exportBtn: { padding: '0.4rem 0.85rem', background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', color: 'var(--text-primary)', fontSize: 13 },
    cards: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16, marginBottom: '2rem' },
    card: { background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '1.25rem' },
    cardVal: { fontSize: 32, fontWeight: 700, color: 'var(--accent)' },
    cardLabel: { fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 },
    section: { background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '1.5rem', marginBottom: '1.5rem' },
    sectionTitle: { fontWeight: 600, marginBottom: '1rem', fontSize: 15 },
  }

  if (!currentOrgId) return <div style={{ padding: '2rem', color: 'var(--text-secondary)' }}>Выберите организацию</div>

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div style={s.title}>Executive Dashboard — {currentOrgName}</div>
        <div style={s.toolbar}>
          {PERIODS.map(p => (
            <button key={p.value} style={s.periodBtn(period === p.value)} onClick={() => setPeriod(p.value)}>{p.label}</button>
          ))}
          <button style={s.exportBtn} onClick={() => handleExport('pdf')}>Экспорт PDF</button>
          <button style={s.exportBtn} onClick={() => handleExport('xlsx')}>Экспорт Excel</button>
        </div>
      </div>

      {loading && <div style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>Загрузка данных...</div>}

      {kpi && (
        <>
          <div style={s.cards}>
            {[
              ['total_events', 'Всего событий'],
              ['total_sessions', 'Сессий'],
              ['unique_users', 'Активных пользователей'],
              ['library_docs', 'Документов в библиотеке'],
              ['uploads', 'Загрузок'],
              ['chats', 'Чат-запросов'],
            ].map(([key, label]) => (
              <div key={key} style={s.card}>
                <div style={s.cardVal}>{kpi[key] ?? 0}</div>
                <div style={s.cardLabel}>{label}</div>
              </div>
            ))}
          </div>

          {trend.length > 0 && (
            <div style={s.section}>
              <div style={s.sectionTitle}>Активность по периодам</div>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="snapshot_at" tickFormatter={v => v.slice(0, 10)} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                  <Tooltip contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }} />
                  <Line type="monotone" dataKey="total_events" stroke="var(--accent)" strokeWidth={2} dot={false} name="События" />
                  <Line type="monotone" dataKey="total_sessions" stroke="#a855f7" strokeWidth={2} dot={false} name="Сессии" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {kpi.by_type && (
            <div style={s.section}>
              <div style={s.sectionTitle}>Типы событий</div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={Object.entries(kpi.by_type).map(([name, value]) => ({ name, value }))}>
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                  <Tooltip contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }} />
                  <Bar dataKey="value" fill="var(--accent)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  )
}
