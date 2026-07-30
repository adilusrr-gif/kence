import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import useOrgStore from '../shared/stores/orgStore'
import useAgentStore from '../shared/stores/agentStore'
import { useToastStore } from '../shared/stores/toastStore'
import { apiGetAgentTypes, apiGetLibrary, apiGetTaxonomy } from '../lib/api'
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
  // Compliance agent: NPA picking — 'auto' (by direction) or 'manual' (pick NPA docs).
  const [npaMode, setNpaMode] = useState('auto')
  const [npaDocs, setNpaDocs] = useState([])
  const [directions, setDirections] = useState([])

  const sessionId = localStorage.getItem('docai_session')

  useEffect(() => {
    apiGetAgentTypes()
      .then(data => setAgentTypes(data))
      .catch(() => { setAgentTypes({}); setAgentTypesError(true) })
  }, [])

  // Load NPA library docs + directions when the compliance agent is selected.
  useEffect(() => {
    if (selected !== 'compliance' || !currentOrgId) return
    apiGetLibrary(currentOrgId, { doc_kind: 'npa' })
      .then(docs => setNpaDocs(Array.isArray(docs) ? docs : []))
      .catch(() => setNpaDocs([]))
    apiGetTaxonomy(currentOrgId)
      .then(tax => setDirections(tax.direction || []))
      .catch(() => setDirections([]))
  }, [selected, currentOrgId])

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
      if (selected === 'compliance') {
        if (npaMode === 'manual') {
          payload.library_doc_ids = form.library_doc_ids || []
        } else {
          payload.direction = form.direction || ''
        }
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

          {selected === 'compliance' && (
            <div>
              <label className="agents-label">{t('agents.npaMode')}</label>
              <div style={{ display: 'flex', gap: 14, margin: '0.3rem 0 0.6rem' }}>
                {['auto', 'manual'].map(m => (
                  <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                    <input type="radio" name="npaMode" checked={npaMode === m} onChange={() => setNpaMode(m)} />
                    {t(`agents.npaMode_${m}`)}
                  </label>
                ))}
              </div>

              {npaMode === 'auto' && (
                <>
                  <label className="agents-label">{t('agents.npaDirection')}</label>
                  <select
                    className="agents-input"
                    value={form.direction || ''}
                    onChange={e => setForm(p => ({ ...p, direction: e.target.value }))}
                  >
                    <option value="">{t('agents.npaAllDirections')}</option>
                    {directions.map(d => <option key={d.id} value={d.value}>{d.value}</option>)}
                  </select>
                  <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 4 }}>
                    {t('agents.npaAutoHint')}
                  </div>
                </>
              )}

              {npaMode === 'manual' && (
                <>
                  <label className="agents-label">{t('agents.npaDocs')}</label>
                  {npaDocs.length === 0 ? (
                    <div style={{ fontSize: 12.5, color: 'var(--text-faint)', padding: '0.3rem 0' }}>
                      {t('agents.npaNone')}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 180, overflowY: 'auto' }}>
                      {npaDocs.map(d => {
                        const ids = form.library_doc_ids || []
                        const checked = ids.includes(d.id)
                        return (
                          <label key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', padding: '0.25rem 0' }}>
                            <input
                              type="checkbox" checked={checked}
                              onChange={() => setForm(p => {
                                const cur = p.library_doc_ids || []
                                return { ...p, library_doc_ids: checked ? cur.filter(x => x !== d.id) : [...cur, d.id] }
                              })}
                            />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {d.name}{d.direction ? ` · ${d.direction}` : ''}
                            </span>
                          </label>
                        )
                      })}
                    </div>
                  )}
                </>
              )}
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
