import { useState, useEffect, useRef } from 'react'
import useOrgStore from '../shared/stores/orgStore'
import { apiExportGraph, apiTriggerExtraction, apiGetExtractionJob, apiQueryGraph, apiGetGraphNodes } from '../lib/api'
import useToastStore from '../shared/stores/toastStore'

const ENTITY_COLORS = {
  Person: '#22d3ee', Organization: '#6366f1', Concept: '#f59e0b',
  Event: '#22c55e', Location: '#a855f7', Technology: '#fb923c', Document: '#ec4899',
}

export default function KnowledgeGraphPage({ currentUser }) {
  const { currentOrgId } = useOrgStore()
  const addToast = useToastStore(s => s.addToast)
  const [graphData, setGraphData] = useState({ nodes: [], links: [] })
  const [loading, setLoading] = useState(false)
  const [selectedNode, setSelectedNode] = useState(null)
  const [queryText, setQueryText] = useState('')
  const [queryResult, setQueryResult] = useState('')
  const [jobStatus, setJobStatus] = useState(null)
  const [jobPolling, setJobPolling] = useState(null)
  const sessionId = localStorage.getItem('docai_session')
  const ForceGraph = useRef(null)
  const [FG, setFG] = useState(null)

  useEffect(() => {
    // Dynamically import react-force-graph-2d to avoid SSR issues
    import('react-force-graph-2d').then(m => setFG(() => m.default)).catch(() => {})
  }, [])

  useEffect(() => {
    if (!currentOrgId) return
    loadGraph()
  }, [currentOrgId])

  const loadGraph = async () => {
    setLoading(true)
    try {
      const data = await apiExportGraph(currentOrgId)
      setGraphData(data)
    } catch { /* Neo4j may not be running */ }
    finally { setLoading(false) }
  }

  const handleExtract = async () => {
    if (!sessionId) { addToast('error', 'Нет активной сессии'); return }
    try {
      const { job_id } = await apiTriggerExtraction(currentOrgId, sessionId)
      addToast('success', `Извлечение запущено (job #${job_id})`)
      setJobStatus({ id: job_id, status: 'pending' })
      const poll = setInterval(async () => {
        const job = await apiGetExtractionJob(currentOrgId, job_id)
        setJobStatus(job)
        if (job.status === 'done') {
          clearInterval(poll)
          addToast('success', `Извлечено ${job.entity_count} сущностей, ${job.rel_count} связей`)
          loadGraph()
        } else if (job.status === 'failed') {
          clearInterval(poll)
          addToast('error', `Ошибка: ${job.error}`)
        }
      }, 2000)
      setJobPolling(poll)
    } catch (e) {
      addToast('error', e.message || 'Ошибка запуска')
    }
  }

  const handleQuery = async () => {
    if (!queryText.trim()) return
    try {
      const { result } = await apiQueryGraph(currentOrgId, queryText)
      setQueryResult(result)
    } catch (e) {
      addToast('error', e.message || 'Ошибка запроса')
    }
  }

  const s = {
    page: { display: 'flex', height: 'calc(100vh - 60px)', color: 'var(--text-primary)' },
    sidebar: { width: 280, flexShrink: 0, background: 'var(--bg-surface)', borderRight: '1px solid var(--border)', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: 16, overflow: 'auto' },
    main: { flex: 1, position: 'relative' },
    title: { fontWeight: 700, fontSize: 16, marginBottom: 4 },
    btn: (v = 'primary') => ({ padding: '0.45rem 1rem', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, background: v === 'secondary' ? 'var(--bg-hover)' : 'var(--accent)', color: v === 'secondary' ? 'var(--text-primary)' : '#fff', width: '100%' }),
    input: { width: '100%', padding: '0.45rem 0.75rem', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' },
    stat: { fontSize: 12, color: 'var(--text-secondary)' },
    nodeInfo: { background: 'var(--bg-hover)', borderRadius: 8, padding: '0.75rem', fontSize: 13 },
    jobBadge: { padding: '3px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: jobStatus?.status === 'done' ? '#22c55e22' : jobStatus?.status === 'failed' ? '#ef444422' : '#f59e0b22', color: jobStatus?.status === 'done' ? '#22c55e' : jobStatus?.status === 'failed' ? '#ef4444' : '#f59e0b' },
  }

  const entityTypes = [...new Set(graphData.nodes.map(n => n.type).filter(Boolean))]

  return (
    <div style={s.page}>
      <div style={s.sidebar}>
        <div>
          <div style={s.title}>Knowledge Graph</div>
          <div style={s.stat}>{graphData.nodes.length} узлов · {graphData.links.length} связей</div>
        </div>

        {sessionId && (
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>Извлечь сущности из текущей сессии</div>
            <button style={s.btn()} onClick={handleExtract} disabled={jobStatus?.status === 'running'}>
              {jobStatus?.status === 'running' ? 'Извлекаю...' : 'Извлечь сущности'}
            </button>
            {jobStatus && (
              <div style={{ marginTop: 6 }}>
                <span style={s.jobBadge}>{jobStatus.status}</span>
                {jobStatus.entity_count != null && <span style={{ fontSize: 11, marginLeft: 6 }}>{jobStatus.entity_count} сущностей</span>}
              </div>
            )}
          </div>
        )}

        <div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>Запрос на естественном языке</div>
          <textarea style={{ ...s.input, height: 70, resize: 'vertical', marginBottom: 6 }} placeholder="Кто связан с..." value={queryText} onChange={e => setQueryText(e.target.value)} />
          <button style={s.btn()} onClick={handleQuery}>Запросить</button>
          {queryResult && <div style={{ ...s.nodeInfo, marginTop: 8, maxHeight: 120, overflow: 'auto' }}>{queryResult}</div>}
        </div>

        {entityTypes.length > 0 && (
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>Типы сущностей</div>
            {entityTypes.map(type => (
              <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: ENTITY_COLORS[type] || '#888' }} />
                <span style={{ fontSize: 12 }}>{type}</span>
              </div>
            ))}
          </div>
        )}

        {selectedNode && (
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>Выбран узел</div>
            <div style={s.nodeInfo}>
              <div style={{ fontWeight: 600 }}>{selectedNode.label}</div>
              <div style={{ color: ENTITY_COLORS[selectedNode.type] || 'var(--accent)', fontSize: 12 }}>{selectedNode.type}</div>
            </div>
          </div>
        )}

        <button style={s.btn('secondary')} onClick={loadGraph}>Обновить граф</button>
      </div>

      <div style={s.main}>
        {loading && (
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', color: 'var(--text-secondary)' }}>Загрузка...</div>
        )}
        {!loading && graphData.nodes.length === 0 && (
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🕸</div>
            <div>Граф пуст. Загрузите документ и нажмите «Извлечь сущности».</div>
          </div>
        )}
        {FG && graphData.nodes.length > 0 && (
          <FG
            graphData={graphData}
            nodeLabel="label"
            nodeColor={n => ENTITY_COLORS[n.type] || '#888'}
            nodeRelSize={5}
            linkColor={() => 'rgba(255,255,255,0.2)'}
            onNodeClick={setSelectedNode}
            backgroundColor="var(--bg-base)"
            width={window.innerWidth - 280}
            height={window.innerHeight - 60}
          />
        )}
      </div>
    </div>
  )
}
