import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import useAgentStore from '../shared/stores/agentStore'
import { apiGetAgentTask, apiAgentTaskStreamUrl, apiCancelAgentTask } from '../lib/api'

const STATUS_COLORS = { running: '#f59e0b', done: '#22c55e', failed: '#ef4444', cancelled: '#6b7280', queued: '#6366f1' }
const STEP_ICONS = { retrieve_context: '🔍', inject_graph_context: '🕸', call_llm: '🤖', done: '✅', error: '❌', retrieve_full_text: '📄', chunk_summarize: '⚙️', merge_summaries: '🔗', outline: '📋', section_write: '✍️', assemble: '📦', search_library: '📚', select_relevant: '🎯', parallel_retrieve: '⚡', graph_augment: '🕸', cross_doc_synthesize: '🔮' }

export default function AgentTaskMonitorPage({ currentUser }) {
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
    status: (st) => ({ padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, background: `${STATUS_COLORS[st] || '#888'}22`, color: STATUS_COLORS[st] || '#888' }),
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
    btn: (v = 'primary') => ({ padding: '0.4rem 1rem', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, background: v === 'danger' ? '#ef4444' : v === 'secondary' ? 'var(--bg-hover)' : 'var(--accent)', color: v === 'secondary' ? 'var(--text-primary)' : '#fff' }),
  }

  const uniqueSteps = steps.filter((s, i, arr) =>
    s.step === 'call_llm' ? s.chunk : arr.findIndex(x => x.step === s.step && x.status === s.status) === i
  )

  return (
    <div style={s.page}>
      <div style={s.header}>
        <button style={s.btn('secondary')} onClick={() => nav('/agents')}>← Агенты</button>
        <div style={s.title}>Задание #{taskId}</div>
        {task && <span style={s.status(task.status)}>{task.status}</span>}
        {streaming && <span style={{ fontSize: 12, color: '#f59e0b', animation: 'pulse 1s infinite' }}>● выполняется</span>}
        {task && ['queued', 'running'].includes(task.status) && (
          <button style={{ ...s.btn('danger'), marginLeft: 'auto' }} onClick={handleCancel}>Отменить</button>
        )}
      </div>

      <div style={s.timeline}>
        {uniqueSteps.map((step, i) => (
          <div key={i} style={s.step}>
            <div style={s.stepIcon}>{STEP_ICONS[step.step] || '⚙️'}</div>
            <div style={s.stepContent}>
              <div style={s.stepName}>{step.step} <span style={{ fontSize: 11, color: STATUS_COLORS[step.status] || '#888', fontWeight: 400 }}>({step.status})</span></div>
              {step.detail && <div style={s.stepDetail}>{step.detail}</div>}
              {step.chunk && <div style={s.stepChunk}>{step.chunk}</div>}
            </div>
          </div>
        ))}
        {streaming && <div style={{ fontSize: 12, color: '#f59e0b', marginLeft: 38 }}>...</div>}
        <div ref={bottomRef} />
      </div>

      {finalResult && (
        <div style={s.result}>
          <div style={s.resultTitle}>Результат</div>
          {finalResult.report_markdown && (
            <div style={s.markdown}>{finalResult.report_markdown}</div>
          )}
          {finalResult.answer && (
            <div style={s.markdown}>{finalResult.answer}</div>
          )}
          {finalResult.summary && (
            <div style={s.markdown}>{finalResult.summary}</div>
          )}
          {finalResult.synthesis && (
            <>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Итог сравнения</div>
              <div style={s.markdown}>{finalResult.synthesis}</div>
            </>
          )}
          {finalResult.documents_used && (
            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-secondary)' }}>
              Использованы: {finalResult.documents_used.join(', ')}
            </div>
          )}
        </div>
      )}

      {task?.error && (
        <div style={{ ...s.result, borderColor: '#ef4444' }}>
          <div style={{ color: '#ef4444', fontWeight: 600 }}>Ошибка</div>
          <div style={s.markdown}>{task.error}</div>
        </div>
      )}
    </div>
  )
}
