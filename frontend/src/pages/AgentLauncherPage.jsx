import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import useOrgStore from '../shared/stores/orgStore'
import useAgentStore from '../shared/stores/agentStore'
import { useToastStore } from '../shared/stores/toastStore'
import { apiGetAgentTypes } from '../lib/api'
import { SkeletonCard } from '../shared/ui/skeleton/Skeleton'

export default function AgentLauncherPage() {
  const { t } = useTranslation()
  const nav = useNavigate()
  const { currentOrgId } = useOrgStore()
  const { createTask } = useAgentStore()
  const addToast = useToastStore(s => s.addToast)
  const [agentTypes, setAgentTypes] = useState(null)
  const [agentTypesError, setAgentTypesError] = useState(false)
  const [selected, setSelected] = useState(null)
  const [form, setForm] = useState({})
  const [launching, setLaunching] = useState(false)

  const sessionId = localStorage.getItem('docai_session')

  useEffect(() => {
    apiGetAgentTypes()
      .then(data => setAgentTypes(data))
      .catch(() => { setAgentTypes({}); setAgentTypesError(true) })
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
      addToast('error', e.message || t('agents.launchError'))
      setLaunching(false)
    }
  }

  return (
    <div className="agents-page">
      <div className="agents-page__title">{t('agents.title')}</div>
      <div className="agents-page__subtitle">{t('agents.subtitle')}</div>

      {agentTypes === null && !agentTypesError && (
        <div className="agents-grid">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} rows={2} />)}
        </div>
      )}
      {agentTypesError && (
        <div style={{ color: 'var(--status-danger)', fontSize: 13, padding: '1rem 0', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>⚠️</span> {t('agents.loadError', 'Не удалось загрузить типы агентов. Попробуйте обновить страницу.')}
        </div>
      )}

      <div className="agents-grid">
        {Object.entries(agentTypes ?? {}).map(([type, info]) => (
          <div
            key={type}
            className={`agents-card${selected === type ? ' agents-card--active' : ''}`}
            onClick={() => { setSelected(type); setForm({}) }}
          >
            <div className="agents-card__icon">🤖</div>
            <div className="agents-card__title">{info.label}</div>
            <div className="agents-card__desc">{info.description}</div>
          </div>
        ))}
      </div>

      {selected && agentTypes[selected] && (
        <div className="agents-config">
          <div className="agents-config__name">{agentTypes[selected].label}</div>

          {agentTypes[selected].input_schema?.session_id !== undefined && (
            <div>
              <label className="agents-label">{t('agents.sessionIdLabel')}</label>
              <input
                className="agents-input"
                placeholder={sessionId || t('agents.noSession')}
                value={form.session_id || ''}
                onChange={e => setForm(p => ({ ...p, session_id: e.target.value }))}
              />
            </div>
          )}

          {agentTypes[selected].input_schema?.question !== undefined && (
            <div>
              <label className="agents-label">{t('agents.questionLabel')}</label>
              <textarea
                className="agents-input"
                style={{ height: 80 }}
                placeholder={t('agents.questionPlaceholder')}
                value={form.question || ''}
                onChange={e => setForm(p => ({ ...p, question: e.target.value }))}
              />
            </div>
          )}

          {agentTypes[selected].input_schema?.instructions !== undefined && (
            <div>
              <label className="agents-label">{t('agents.instructionsLabel')}</label>
              <textarea
                className="agents-input"
                style={{ height: 60 }}
                placeholder={t('agents.instructionsPlaceholder')}
                value={form.instructions || ''}
                onChange={e => setForm(p => ({ ...p, instructions: e.target.value }))}
              />
            </div>
          )}

          <button className="agents-launch-btn" onClick={handleLaunch} disabled={launching}>
            {launching ? t('agents.launching') : t('agents.launch')}
          </button>
        </div>
      )}

      <div className="agents-history-link" onClick={() => nav('/agents/history')}>
        {t('agents.historyLink')}
      </div>
    </div>
  )
}
