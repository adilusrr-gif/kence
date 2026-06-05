import { useState, useEffect } from 'react'
import { SkeletonStats, SkeletonCard } from '../shared/ui/skeleton/Skeleton'
import { useTranslation } from 'react-i18next'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from 'recharts'
import useOrgStore from '../shared/stores/orgStore'
import { apiGetKPI, apiGetKPITrend, apiExportReport } from '../lib/api'

export default function ExecutiveDashboardPage() {
  const { t } = useTranslation()
  const { currentOrgId, currentOrgName } = useOrgStore()
  const [period, setPeriod] = useState('day')
  const [kpi, setKpi] = useState(null)
  const [trend, setTrend] = useState([])
  const [loading, setLoading] = useState(false)

  const PERIODS = [
    { value: 'day',   label: t('executive.periodDay') },
    { value: 'week',  label: t('executive.periodWeek') },
    { value: 'month', label: t('executive.periodMonth') },
  ]

  useEffect(() => {
    if (!currentOrgId) return
    setLoading(true)
    Promise.all([apiGetKPI(currentOrgId, period), apiGetKPITrend(currentOrgId, period, 7)])
      .then(([k, tr]) => { setKpi(k); setTrend(tr) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [currentOrgId, period])

  const handleExport = (fmt) => {
    const url = apiExportReport(currentOrgId, period, fmt)
    window.open(url, '_blank')
  }

  const KPI_ROWS = [
    ['total_events',   t('executive.kpiTotalEvents')],
    ['total_sessions', t('executive.kpiTotalSessions')],
    ['unique_users',   t('executive.kpiUniqueUsers')],
    ['library_docs',   t('executive.kpiLibraryDocs')],
    ['uploads',        t('executive.kpiUploads')],
    ['chats',          t('executive.kpiChats')],
  ]

  if (!currentOrgId) {
    return <div style={{ padding: '2rem', color: 'var(--text-secondary)' }}>{t('executive.noOrg')}</div>
  }

  return (
    <div className="exec-page">
      <div className="exec-header">
        <div className="exec-title">{t('executive.title', { org: currentOrgName })}</div>
        <div className="exec-toolbar">
          {PERIODS.map(p => (
            <button
              key={p.value}
              className={`exec-period-btn${period === p.value ? ' exec-period-btn--active' : ''}`}
              onClick={() => setPeriod(p.value)}
            >
              {p.label}
            </button>
          ))}
          <button className="exec-export-btn" onClick={() => handleExport('pdf')}>{t('executive.exportPdf')}</button>
          <button className="exec-export-btn" onClick={() => handleExport('xlsx')}>{t('executive.exportExcel')}</button>
        </div>
      </div>

      {loading && (
        <div style={{ marginBottom: 16 }}>
          <SkeletonStats count={6} />
          <div style={{ marginTop: 12 }}><SkeletonCard rows={5} /></div>
          <div style={{ marginTop: 12 }}><SkeletonCard rows={4} /></div>
        </div>
      )}

      {kpi && (
        <>
          <div className="exec-kpi-grid">
            {KPI_ROWS.map(([key, label]) => (
              <div key={key} className="exec-kpi-card">
                <div className="exec-kpi-card__value">{kpi[key] ?? 0}</div>
                <div className="exec-kpi-card__label">{label}</div>
              </div>
            ))}
          </div>

          {trend.length > 0 && (
            <div className="exec-section">
              <div className="exec-section__title">{t('executive.activityTitle')}</div>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
                  <XAxis dataKey="snapshot_at" tickFormatter={v => v.slice(0, 10)} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                  <Tooltip contentStyle={{ background: 'var(--bg-surface-1)', border: '1px solid var(--border-default)' }} />
                  <Line type="monotone" dataKey="total_events"   stroke="var(--accent-primary)"      strokeWidth={2} dot={false} name={t('executive.kpiTotalEvents')} />
                  <Line type="monotone" dataKey="total_sessions" stroke="var(--color-violet-500)"    strokeWidth={2} dot={false} name={t('executive.kpiTotalSessions')} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {kpi.by_type && (
            <div className="exec-section">
              <div className="exec-section__title">{t('executive.eventTypeTitle')}</div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={Object.entries(kpi.by_type).map(([name, value]) => ({ name, value }))}>
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                  <Tooltip contentStyle={{ background: 'var(--bg-surface-1)', border: '1px solid var(--border-default)' }} />
                  <Bar dataKey="value" fill="var(--accent-primary)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  )
}
