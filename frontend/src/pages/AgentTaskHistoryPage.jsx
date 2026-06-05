import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import useOrgStore from '../shared/stores/orgStore'
import useAgentStore from '../shared/stores/agentStore'

const STATUS_COLORS = {
  running: 'var(--status-warning)',
  done: 'var(--status-success)',
  failed: 'var(--status-danger)',
  cancelled: 'var(--color-neutral-500)',
  queued: 'var(--color-violet-500)',
}

const ROW_VARIANTS = {
  hidden:  { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 360, damping: 28 } },
}

const TABLE_VARIANTS = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.045, delayChildren: 0.04 } },
}

export default function AgentTaskHistoryPage() {
  const { t } = useTranslation()
  const nav = useNavigate()
  const { currentOrgId } = useOrgStore()
  const { tasks, fetchTasks } = useAgentStore()

  useEffect(() => {
    fetchTasks(currentOrgId)
  }, [currentOrgId])

  const dur = (task) => {
    if (!task.started_at || !task.finished_at) return '—'
    const ms = new Date(task.finished_at) - new Date(task.started_at)
    if (ms < 1000) return t('agents.durationMs', { ms })
    return t('agents.durationS', { s: (ms / 1000).toFixed(1) })
  }

  const statusStyle = (st) => ({
    padding: '2px 8px',
    borderRadius: 10,
    fontSize: 11,
    fontWeight: 600,
    background: `color-mix(in srgb, ${STATUS_COLORS[st] || 'var(--color-neutral-500)'} 15%, transparent)`,
    color: STATUS_COLORS[st] || 'var(--color-neutral-500)',
  })

  return (
    <div className="agents-page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '1.5rem' }}>
        <button className="agents-launch-btn" style={{ background: 'var(--bg-surface-2)' }} onClick={() => nav('/agents')}>
          {t('agents.backToAgents')}
        </button>
        <div className="agents-page__title" style={{ marginBottom: 0 }}>{t('agents.historyTitle')}</div>
      </div>

      {tasks.length === 0 ? (
        <div className="library-empty">
          <div className="library-empty__icon">🤖</div>
          <div>{t('agents.noHistory')}</div>
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {[t('agents.colId'), t('agents.colAgent'), t('agents.colStatus'), t('agents.colDuration'), t('agents.colCreated'), ''].map((h, i) => (
                <th key={i} style={{ textAlign: 'left', padding: '0.6rem 0.75rem', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-default)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <motion.tbody variants={TABLE_VARIANTS} initial="hidden" animate="visible">
            {tasks.map(task => (
              <motion.tr
                key={task.id}
                variants={ROW_VARIANTS}
                style={{ cursor: 'pointer' }}
                onClick={() => nav(`/agents/tasks/${task.id}`)}
                whileHover={{ backgroundColor: 'var(--tint-faint)' }}
              >
                <td style={{ padding: '0.75rem', fontSize: 13, borderBottom: '1px solid var(--border-subtle)' }}>{task.id}</td>
                <td style={{ padding: '0.75rem', fontSize: 13, borderBottom: '1px solid var(--border-subtle)' }}>{task.task_type}</td>
                <td style={{ padding: '0.75rem', fontSize: 13, borderBottom: '1px solid var(--border-subtle)' }}><span style={statusStyle(task.status)}>{task.status}</span></td>
                <td style={{ padding: '0.75rem', fontSize: 13, borderBottom: '1px solid var(--border-subtle)' }}>{dur(task)}</td>
                <td style={{ padding: '0.75rem', fontSize: 13, borderBottom: '1px solid var(--border-subtle)' }}>{task.created_at ? new Date(task.created_at).toLocaleString() : '—'}</td>
                <td style={{ padding: '0.75rem', fontSize: 13, borderBottom: '1px solid var(--border-subtle)' }}>
                  <button className="library-btn" onClick={e => { e.stopPropagation(); nav(`/agents/tasks/${task.id}`) }}>{t('agents.open')}</button>
                </td>
              </motion.tr>
            ))}
          </motion.tbody>
        </table>
      )}
    </div>
  )
}
