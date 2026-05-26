import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import useOrgStore from '../shared/stores/orgStore'
import useAgentStore from '../shared/stores/agentStore'
import useToastStore from '../shared/stores/toastStore'
import { apiGetAgentTypes } from '../lib/api'

const ICONS = {
  document_analyst: '🔍',
  summary: '📝',
  comparison: '⚖️',
  report_generator: '📄',
  research: '🔬',
}

export default function AgentLauncherPage({ currentUser }) {
  const nav = useNavigate()
  const { currentOrgId } = useOrgStore()
  const { createTask } = useAgentStore()
  const addToast = useToastStore(s => s.addToast)
  const [agentTypes, setAgentTypes] = useState({})
  const [selected, setSelected] = useState(null)
  const [form, setForm] = useState({})
  const [launching, setLaunching] = useState(false)

  const sessionId = localStorage.getItem('docai_session')

  useEffect(() => {
    apiGetAgentTypes().then(setAgentTypes).catch(() => {})
  }, [])

  const handleLaunch = async () => {
    if (!selected) return
    setLaunching(true)
    try {
      const payload = {
        task_type: selected,
        org_id: currentOrgId,
        session_id: form.session_id || sessionId,
        question: form.question || '',
        instructions: form.instructions || '',
      }
      const taskId = await createTask(payload)
      nav(`/agents/tasks/${taskId}`)
    } catch (e) {
      addToast('error', e.message || 'Ошибка запуска агента')
      setLaunching(false)
    }
  }

  const s = {
    page: { padding: '2rem', maxWidth: 900, margin: '0 auto', color: 'var(--text-primary)' },
    title: { fontSize: 22, fontWeight: 700, marginBottom: '0.5rem' },
    subtitle: { fontSize: 14, color: 'var(--text-secondary)', marginBottom: '2rem' },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: '2rem' },
    card: (active) => ({ background: 'var(--bg-surface)', border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 10, padding: '1.25rem', cursor: 'pointer', transition: 'border-color 0.2s', outline: active ? '2px solid var(--accent)44' : 'none' }),
    cardIcon: { fontSize: 28, marginBottom: 8 },
    cardTitle: { fontWeight: 600, fontSize: 14, marginBottom: 4 },
    cardDesc: { fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 },
    config: { background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '1.5rem' },
    label: { fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 },
    input: { width: '100%', padding: '0.5rem 0.75rem', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box', marginBottom: 12 },
    btn: { padding: '0.6rem 1.5rem', background: 'var(--accent)', border: 'none', borderRadius: 8, cursor: 'pointer', color: '#fff', fontSize: 14, fontWeight: 600 },
    historyLink: { display: 'inline-block', marginTop: 12, fontSize: 13, color: 'var(--accent)', cursor: 'pointer', textDecoration: 'underline' },
  }

  return (
    <div style={s.page}>
      <div style={s.title}>AI Агенты</div>
      <div style={s.subtitle}>Выберите агента для интеллектуального анализа документов</div>

      <div style={s.grid}>
        {Object.entries(agentTypes).map(([type, info]) => (
          <div key={type} style={s.card(selected === type)} onClick={() => { setSelected(type); setForm({}) }}>
            <div style={s.cardIcon}>{ICONS[type] || '🤖'}</div>
            <div style={s.cardTitle}>{info.label}</div>
            <div style={s.cardDesc}>{info.description}</div>
          </div>
        ))}
      </div>

      {selected && agentTypes[selected] && (
        <div style={s.config}>
          <div style={{ fontWeight: 600, marginBottom: '1rem' }}>
            {ICONS[selected]} {agentTypes[selected].label}
          </div>

          {agentTypes[selected].input_schema?.session_id !== undefined && (
            <div>
              <label style={s.label}>Session ID (оставьте пустым для текущей сессии)</label>
              <input style={s.input} placeholder={sessionId || 'нет активной сессии'} value={form.session_id || ''} onChange={e => setForm(p => ({ ...p, session_id: e.target.value }))} />
            </div>
          )}

          {agentTypes[selected].input_schema?.question !== undefined && (
            <div>
              <label style={s.label}>Вопрос / Задание</label>
              <textarea style={{ ...s.input, height: 80, resize: 'vertical' }} placeholder="Что нужно проанализировать?" value={form.question || ''} onChange={e => setForm(p => ({ ...p, question: e.target.value }))} />
            </div>
          )}

          {agentTypes[selected].input_schema?.instructions !== undefined && (
            <div>
              <label style={s.label}>Инструкции (опционально)</label>
              <textarea style={{ ...s.input, height: 60, resize: 'vertical' }} placeholder="Особые требования к отчёту..." value={form.instructions || ''} onChange={e => setForm(p => ({ ...p, instructions: e.target.value }))} />
            </div>
          )}

          <button style={s.btn} onClick={handleLaunch} disabled={launching}>
            {launching ? 'Запускаю...' : 'Запустить агента'}
          </button>
        </div>
      )}

      <div style={s.historyLink} onClick={() => nav('/agents/history')}>История заданий →</div>
    </div>
  )
}
