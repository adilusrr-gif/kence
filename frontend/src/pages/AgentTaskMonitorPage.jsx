import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Download } from 'lucide-react'
import useAgentStore from '../shared/stores/agentStore'
import { apiGetAgentTask, apiAgentTaskStreamUrl, apiCancelAgentTask, getToken } from '../lib/api'

const STATUS_COLORS = { running: 'var(--status-warning)', done: 'var(--status-success)', failed: 'var(--status-danger)', cancelled: 'var(--color-neutral-500)', queued: 'var(--color-violet-500)' }

export default function AgentTaskMonitorPage() {
  const { t } = useTranslation()
  const { taskId } = useParams()
  const nav = useNavigate()
  const [task, setTask] = useState(null)
  const [steps, setSteps] = useState([])
  const [finalResult, setFinalResult] = useState(null)
  const [streaming, setStreaming] = useState(false)
  const esRef = useRef(null)
  const bottomRef = useRef(null)

  useEffect(() => {
    apiGetAgentTask(taskId).then(t => {
      setTask(t)
      if (t.steps?.length) setSteps(t.steps)
      if (t.status === 'done') setFinalResult(t.output_data)
      if (['queued', 'running'].includes(t.status)) startStream()
    }).catch(() => {})
    return () => esRef.current?.close()
  }, [taskId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [steps])

  const startStream = () => {
    setStreaming(true)
    const url = apiAgentTaskStreamUrl(taskId)
    const es = new EventSource(url)
    esRef.current = es

    es.onmessage = (e) => {
      if (e.data === '[DONE]') {
        es.close()
        setStreaming(false)
        apiGetAgentTask(taskId).then(t => { setTask(t); setFinalResult(t.output_data) })
        return
      }
      try {
        const step = JSON.parse(e.data)
        setSteps(prev => [...prev, step])
        if (step.step === 'done') setFinalResult(step.result)
      } catch { }
    }
    es.onerror = () => { es.close(); setStreaming(false) }
  }

  const handleCancel = async () => {
    await apiCancelAgentTask(taskId)
    esRef.current?.close()
    setStreaming(false)
    setTask(prev => ({ ...prev, status: 'cancelled' }))
  }

  const s = {
    page: { padding: '2rem', maxWidth: 900, margin: '0 auto', color: 'var(--text-primary)' },
    header: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: '1.5rem' },
    title: { fontSize: 20, fontWeight: 700 },
    status: (st) => ({ padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, background: `color-mix(in srgb, ${STATUS_COLORS[st] || 'var(--color-neutral-500)'} 15%, transparent)`, color: STATUS_COLORS[st] || 'var(--color-neutral-500)' }),
    timeline: { background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '1.25rem', marginBottom: '1.5rem', maxHeight: 400, overflow: 'auto' },
    step: { display: 'flex', gap: 10, marginBottom: 10, alignItems: 'flex-start' },
    stepIcon: { width: 28, height: 28, borderRadius: '50%', background: 'var(--bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 },
    stepContent: { flex: 1 },
    stepName: { fontWeight: 600, fontSize: 13 },
    stepDetail: { fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 },
    stepChunk: { fontSize: 12, fontFamily: 'monospace', background: 'var(--bg-hover)', padding: '0.5rem', borderRadius: 6, marginTop: 4, whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'auto' },
    result: { background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '1.5rem' },
    resultTitle: { fontWeight: 600, marginBottom: '1rem', fontSize: 15 },
    markdown: { fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap', color: 'var(--text-primary)' },
    btn: (v = 'primary') => ({ padding: '0.4rem 1rem', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, background: v === 'danger' ? 'var(--color-red-600)' : v === 'secondary' ? 'var(--bg-hover)' : 'var(--accent-primary)', color: v === 'secondary' ? 'var(--text-primary)' : '#fff' }),
  }

  const uniqueSteps = steps.filter((step, i, arr) =>
    step.step === 'call_llm' ? step.chunk : arr.findIndex(x => x.step === step.step && x.status === step.status) === i
  )

  return (
    <div style={s.page}>
      <div style={s.header}>
        <button style={s.btn('secondary')} onClick={() => nav('/agents')}>{t('agents.backToAgents')}</button>
        <div style={s.title}>{t('agents.task', { id: taskId })}</div>
        {task && <span style={s.status(task.status)}>{task.status}</span>}
        {streaming && <span style={{ fontSize: 12, color: 'var(--status-warning)', animation: 'pulse 1s infinite' }}>{t('agents.running')}</span>}
        {task && ['queued', 'running'].includes(task.status) && (
          <button style={{ ...s.btn('danger'), marginLeft: 'auto' }} onClick={handleCancel}>{t('agents.cancel')}</button>
        )}
      </div>

      <div style={s.timeline}>
        {uniqueSteps.map((step, i) => (
          <div key={i} style={s.step}>
            <div style={s.stepIcon}>⚙️</div>
            <div style={s.stepContent}>
              <div style={s.stepName}>{step.step} <span style={{ fontSize: 11, color: STATUS_COLORS[step.status] || 'var(--color-neutral-500)', fontWeight: 400 }}>({step.status})</span></div>
              {step.detail && <div style={s.stepDetail}>{step.detail}</div>}
              {step.chunk && <div style={s.stepChunk}>{step.chunk}</div>}
            </div>
          </div>
        ))}
        {streaming && <div style={{ fontSize: 12, color: 'var(--status-warning)', marginLeft: 38 }}>...</div>}
        <div ref={bottomRef} />
      </div>

      {finalResult && (
        <div style={s.result}>
          <div style={s.resultTitle}>{t('agents.result')}</div>
          {finalResult.report_markdown && <div style={s.markdown}>{finalResult.report_markdown}</div>}
          {finalResult.answer && <div style={s.markdown}>{finalResult.answer}</div>}
          {finalResult.summary && <div style={s.markdown}>{finalResult.summary}</div>}
          {finalResult.synthesis && (
            <>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>{t('agents.comparison')}</div>
              <div style={s.markdown}>{finalResult.synthesis}</div>
            </>
          )}
          {finalResult.documents_used && (
            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-secondary)' }}>
              {t('agents.docsUsed', { docs: finalResult.documents_used.join(', ') })}
            </div>
          )}
          {finalResult.download_url && (
            <a
              href={`${finalResult.download_url}?token=${encodeURIComponent(getToken() || '')}`}
              download="edited_document.docx"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 12,
                padding: '6px 14px', borderRadius: 7, textDecoration: 'none',
                background: 'var(--accent-primary)', color: '#fff',
                fontSize: 13, fontWeight: 600,
              }}
            >
              <Download size={14} /> Скачать DOCX
            </a>
          )}
        </div>
      )}

      {task?.error && (
        <div style={{ ...s.result, borderColor: 'var(--status-danger)' }}>
          <div style={{ color: 'var(--status-danger)', fontWeight: 600 }}>{t('agents.error')}</div>
          <div style={s.markdown}>{task.error}</div>
        </div>
      )}
    </div>
  )
}
