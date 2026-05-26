import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import useOrgStore from '../shared/stores/orgStore'
import useAgentStore from '../shared/stores/agentStore'

const STATUS_COLORS = { running: '#f59e0b', done: '#22c55e', failed: '#ef4444', cancelled: '#6b7280', queued: '#6366f1' }
const TYPE_ICONS = { document_analyst: '🔍', summary: '📝', comparison: '⚖️', report_generator: '📄', research: '🔬' }

export default function AgentTaskHistoryPage({ currentUser }) {
  const nav = useNavigate()
  const { currentOrgId } = useOrgStore()
  const { tasks, fetchTasks } = useAgentStore()

  useEffect(() => {
    fetchTasks(currentOrgId)
  }, [currentOrgId])

  const dur = (t) => {
    if (!t.started_at || !t.finished_at) return '—'
    const ms = new Date(t.finished_at) - new Date(t.started_at)
    if (ms < 1000) return `${ms}мс`
    return `${(ms / 1000).toFixed(1)}с`
  }

  const s = {
    page: { padding: '2rem', maxWidth: 900, margin: '0 auto', color: 'var(--text-primary)' },
    header: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: '1.5rem' },
    title: { fontSize: 22, fontWeight: 700 },
    table: { width: '100%', borderCollapse: 'collapse' },
    th: { textAlign: 'left', padding: '0.6rem 0.75rem', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' },
    td: { padding: '0.75rem', fontSize: 13, borderBottom: '1px solid var(--border)' },
    row: { cursor: 'pointer', transition: 'background 0.15s' },
    status: (st) => ({ padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: `${STATUS_COLORS[st] || '#888'}22`, color: STATUS_COLORS[st] || '#888' }),
    btn: { padding: '0.35rem 0.85rem', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, background: 'var(--accent)22', color: 'var(--accent)' },
    empty: { textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' },
  }

  return (
    <div style={s.page}>
      <div style={s.header}>
        <button style={{ padding: '0.35rem 0.85rem', background: 'var(--bg-hover)', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, color: 'var(--text-primary)' }} onClick={() => nav('/agents')}>← Агенты</button>
        <div style={s.title}>История заданий</div>
      </div>

      {tasks.length === 0 ? (
        <div style={s.empty}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🤖</div>
          <div>Нет выполненных заданий. Запустите агента!</div>
        </div>
      ) : (
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>#</th>
              <th style={s.th}>Агент</th>
              <th style={s.th}>Статус</th>
              <th style={s.th}>Длительность</th>
              <th style={s.th}>Создано</th>
              <th style={s.th}></th>
            </tr>
          </thead>
          <tbody>
            {tasks.map(t => (
              <tr key={t.id} style={s.row} onClick={() => nav(`/agents/tasks/${t.id}`)}>
                <td style={s.td}>{t.id}</td>
                <td style={s.td}>{TYPE_ICONS[t.task_type] || '🤖'} {t.task_type}</td>
                <td style={s.td}><span style={s.status(t.status)}>{t.status}</span></td>
                <td style={s.td}>{dur(t)}</td>
                <td style={s.td}>{t.created_at ? new Date(t.created_at).toLocaleString() : '—'}</td>
                <td style={s.td}><button style={s.btn} onClick={e => { e.stopPropagation(); nav(`/agents/tasks/${t.id}`) }}>Открыть</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
