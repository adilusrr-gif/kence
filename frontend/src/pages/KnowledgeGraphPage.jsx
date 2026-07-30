import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import useOrgStore from '../shared/stores/orgStore'
import { apiExportGraph, apiTriggerExtraction, apiGetExtractionJob, apiQueryGraph, apiGetGraphDocuments } from '../lib/api'
import { useToastStore } from '../shared/stores/toastStore'

const ENTITY_COLORS = {
  Person: '#22d3ee',   Organization: '#6366f1', Concept: '#f59e0b',
  Event: '#22c55e',   Location: '#a855f7',     Technology: '#fb923c',
  Document: '#ec4899', Product: '#38bdf8',      Law: '#f43f5e',
  Date: '#94a3b8',
}

const LINK_COLORS = {
  WORKS_FOR: '#22d3ee',  PART_OF: '#6366f1',     USES: '#f59e0b',
  CREATED_BY: '#22c55e', LOCATED_IN: '#a855f7',  OWNED_BY: '#fb923c',
  MENTIONS: '#a78bfa',   REFERS_TO: '#60a5fa',   DEPENDS_ON: '#34d399',
  SIGNED_BY: '#f472b6',  REGULATED_BY: '#f87171', HAPPENED_AT: '#fbbf24',
  RELATED_TO: '#475569',
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}
function lighten(hex, amt) {
  const { r, g, b } = hexToRgb(hex)
  return `rgb(${Math.min(255, r + amt)},${Math.min(255, g + amt)},${Math.min(255, b + amt)})`
}
function alpha(hex, a) {
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${r},${g},${b},${a})`
}

export default function KnowledgeGraphPage() {
  const { t, i18n } = useTranslation()
  const { currentOrgId } = useOrgStore()
  const addToast = useToastStore(s => s.addToast)
  const graphRef = useRef(null)
  const containerRef = useRef(null)
  const pollRef = useRef(null)
  const [dims, setDims] = useState({ w: 900, h: 680 })
  const [graphData, setGraphData] = useState({ nodes: [], links: [] })
  const [loading, setLoading] = useState(false)
  const [selectedNode, setSelectedNode] = useState(null)
  const [hoveredNode, setHoveredNode] = useState(null)
  const [queryText, setQueryText] = useState('')
  const [queryResult, setQueryResult] = useState('')
  const [jobStatus, setJobStatus] = useState(null)
  const [hiddenTypes, setHiddenTypes] = useState(new Set())
  const sessionId = localStorage.getItem('docai_session')
  const [FG, setFG] = useState(null)
  // Graph scope: '' = whole organization, otherwise a specific document's session_id.
  // Defaults to the currently open document so the view reflects "this document".
  const [scope, setScope] = useState(sessionId || '')
  const [graphDocs, setGraphDocs] = useState([])

  // Force-simulation tuning, user-adjustable from the sidebar.
  const DEFAULT_PHYSICS = { charge: -300, linkDist: 80, linkStr: 0.6, center: 0.05, nodeScale: 1 }
  const [physics, setPhysics] = useState(() => {
    try { return { ...DEFAULT_PHYSICS, ...JSON.parse(localStorage.getItem('kence_graph_physics') || '{}') } }
    catch { return DEFAULT_PHYSICS }
  })
  const [showPhysics, setShowPhysics] = useState(false)
  const setPhys = (k, v) => setPhysics(p => {
    const next = { ...p, [k]: v }
    localStorage.setItem('kence_graph_physics', JSON.stringify(next))
    return next
  })

  // Clear poll on unmount
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  useEffect(() => {
    import('react-force-graph-2d').then(m => setFG(() => m.default)).catch(() => {})
  }, [])

  const loadGraph = useCallback(async () => {
    if (!currentOrgId) return
    setLoading(true)
    try {
      const data = await apiExportGraph(currentOrgId, scope || undefined)
      setGraphData(data)
      setSelectedNode(null)
      setHoveredNode(null)
    } catch {
      addToast('error', t('graph.loadError'))
    } finally {
      setLoading(false)
    }
  }, [currentOrgId, scope, addToast, t])

  useEffect(() => {
    if (!currentOrgId) return
    loadGraph()
  }, [currentOrgId, loadGraph])

  // Load the list of documents that have an extracted graph (for the scope selector).
  useEffect(() => {
    if (!currentOrgId) { setGraphDocs([]); return }
    apiGetGraphDocuments(currentOrgId)
      .then(res => setGraphDocs(Array.isArray(res) ? res : (res?.documents || [])))
      .catch(() => setGraphDocs([]))
  }, [currentOrgId, jobStatus?.status])

  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      if (width > 0 && height > 0) setDims({ w: Math.floor(width), h: Math.floor(height) })
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  // Tune physics after graph mounts / data changes or when the user adjusts sliders.
  useEffect(() => {
    if (!graphRef.current || !FG) return
    try {
      graphRef.current.d3Force('charge')?.strength(physics.charge)
      graphRef.current.d3Force('link')?.distance(physics.linkDist).strength(physics.linkStr)
      graphRef.current.d3Force('center')?.strength(physics.center)
      graphRef.current.d3ReheatSimulation()
    } catch { }
  }, [graphData, FG, physics])

  const handleExtract = async () => {
    if (!sessionId) { addToast('error', t('graph.noSession')); return }
    if (!currentOrgId) { addToast('error', t('graph.noOrg')); return }
    try {
      const { job_id } = await apiTriggerExtraction(currentOrgId, sessionId, i18n.language)
      addToast('success', t('graph.extractStarted', { id: job_id }))
      setJobStatus({ id: job_id, status: 'pending' })
      if (pollRef.current) clearInterval(pollRef.current)
      pollRef.current = setInterval(async () => {
        try {
          const job = await apiGetExtractionJob(currentOrgId, job_id)
          setJobStatus(job)
          if (job.status === 'done') {
            clearInterval(pollRef.current)
            pollRef.current = null
            addToast('success', t('graph.extractDone', { entities: job.entity_count, rels: job.rel_count }))
            loadGraph()
          } else if (job.status === 'failed') {
            clearInterval(pollRef.current)
            pollRef.current = null
            addToast('error', t('graph.extractError', { msg: job.error }))
          }
        } catch {
          clearInterval(pollRef.current)
          pollRef.current = null
        }
      }, 2000)
    } catch (e) {
      addToast('error', e.message || t('graph.launchError'))
    }
  }

  const handleQuery = async () => {
    if (!queryText.trim() || !currentOrgId) return
    try {
      const { result } = await apiQueryGraph(currentOrgId, queryText)
      setQueryResult(result)
    } catch (e) {
      addToast('error', e.message || t('graph.queryError'))
    }
  }

  const toggleType = type => {
    setHiddenTypes(prev => {
      const next = new Set(prev)
      next.has(type) ? next.delete(type) : next.add(type)
      return next
    })
  }

  // Degree map: node id → connection count
  const degreeMap = useMemo(() => {
    const m = {}
    graphData.links.forEach(l => {
      const s = typeof l.source === 'object' ? l.source.id : l.source
      const tgt = typeof l.target === 'object' ? l.target.id : l.target
      m[s] = (m[s] || 0) + 1
      m[tgt] = (m[tgt] || 0) + 1
    })
    return m
  }, [graphData])

  // IDs connected to hovered node (for dim effect)
  const hoveredNeighborIds = useMemo(() => {
    if (!hoveredNode) return null
    const ids = new Set([hoveredNode.id])
    graphData.links.forEach(l => {
      const s = typeof l.source === 'object' ? l.source.id : l.source
      const tgt = typeof l.target === 'object' ? l.target.id : l.target
      if (s === hoveredNode.id) ids.add(tgt)
      if (tgt === hoveredNode.id) ids.add(s)
    })
    return ids
  }, [hoveredNode, graphData])

  // Filtered graph (entity type filter chips)
  const filteredGraph = useMemo(() => {
    if (hiddenTypes.size === 0) return graphData
    const visibleIds = new Set(
      graphData.nodes.filter(n => !hiddenTypes.has(n.type)).map(n => n.id)
    )
    return {
      nodes: graphData.nodes.filter(n => visibleIds.has(n.id)),
      links: graphData.links.filter(l => {
        const s = typeof l.source === 'object' ? l.source.id : l.source
        const tgt = typeof l.target === 'object' ? l.target.id : l.target
        return visibleIds.has(s) && visibleIds.has(tgt)
      }),
    }
  }, [graphData, hiddenTypes])

  // Selected node neighbors
  const neighbors = useMemo(() => {
    if (!selectedNode) return []
    return graphData.links
      .map(l => ({
        src: typeof l.source === 'object' ? l.source : graphData.nodes.find(n => n.id === l.source),
        tgt: typeof l.target === 'object' ? l.target : graphData.nodes.find(n => n.id === l.target),
        type: l.type,
      }))
      .filter(l => l.src?.id === selectedNode.id || l.tgt?.id === selectedNode.id)
      .slice(0, 14)
      .map(l => ({
        label: l.src?.id === selectedNode.id ? l.tgt?.label : l.src?.label,
        etype: l.src?.id === selectedNode.id ? l.tgt?.type : l.src?.type,
        rel: l.type,
        dir: l.src?.id === selectedNode.id ? '→' : '←',
      }))
  }, [selectedNode, graphData])

  // Custom node painter
  const paintNode = useCallback((node, ctx, globalScale) => {
    if (!isFinite(node.x) || !isFinite(node.y)) return
    const color = ENTITY_COLORS[node.type] || '#888'
    const degree = degreeMap[node.id] || 1
    const r = Math.max(5, Math.min(14, 5 + Math.sqrt(degree) * 2)) * physics.nodeScale
    const isSelected = selectedNode?.id === node.id
    const dimmed = hoveredNeighborIds != null && !hoveredNeighborIds.has(node.id)

    ctx.globalAlpha = dimmed ? 0.12 : 1

    // Outer glow
    if (!dimmed) {
      const glowR = r * 2.8
      const grd = ctx.createRadialGradient(node.x, node.y, r * 0.5, node.x, node.y, glowR)
      grd.addColorStop(0, alpha(color, 0.35))
      grd.addColorStop(1, alpha(color, 0))
      ctx.beginPath()
      ctx.arc(node.x, node.y, glowR, 0, Math.PI * 2)
      ctx.fillStyle = grd
      ctx.fill()
    }

    // Selection ring
    if (isSelected) {
      ctx.beginPath()
      ctx.arc(node.x, node.y, r + 4, 0, Math.PI * 2)
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 2
      ctx.stroke()
    }

    // Node body — radial gradient fill
    const fill = ctx.createRadialGradient(
      node.x - r * 0.3, node.y - r * 0.35, r * 0.05,
      node.x, node.y, r
    )
    fill.addColorStop(0, lighten(color, 55))
    fill.addColorStop(1, color)
    ctx.beginPath()
    ctx.arc(node.x, node.y, r, 0, Math.PI * 2)
    ctx.fillStyle = fill
    ctx.fill()

    // Border
    ctx.strokeStyle = isSelected ? '#fff' : alpha('#fff', 0.25)
    ctx.lineWidth = isSelected ? 2 : 1
    ctx.stroke()

    // Label
    const label = (node.label || '').length > 20 ? node.label.slice(0, 19) + '…' : (node.label || '')
    const fontSize = Math.max(9, Math.min(14, 12 / globalScale))
    ctx.font = `600 ${fontSize}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    const ly = node.y + r + 3
    ctx.fillStyle = 'rgba(0,0,0,0.7)'
    ctx.fillText(label, node.x + 0.5, ly + 0.5)
    ctx.fillStyle = dimmed ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.95)'
    ctx.fillText(label, node.x, ly)

    ctx.globalAlpha = 1
  }, [degreeMap, hoveredNeighborIds, selectedNode, physics.nodeScale])

  const handleEngineStop = useCallback(() => {
    graphRef.current?.zoomToFit(500, 40)
  }, [])

  const zoom = delta => {
    if (!graphRef.current) return
    const cur = graphRef.current.zoom()
    graphRef.current.zoom(Math.max(0.2, Math.min(8, cur * delta)), 250)
  }

  const jobBadgeBg = jobStatus?.status === 'done'
    ? 'color-mix(in srgb, var(--status-success) 15%, transparent)'
    : jobStatus?.status === 'failed'
    ? 'color-mix(in srgb, var(--status-danger) 15%, transparent)'
    : 'color-mix(in srgb, var(--status-warning) 15%, transparent)'
  const jobBadgeColor = jobStatus?.status === 'done' ? 'var(--status-success)'
    : jobStatus?.status === 'failed' ? 'var(--status-danger)' : 'var(--status-warning)'

  const s = {
    page: { display: 'flex', flex: 1, height: '100%', minHeight: 0, color: 'var(--text-primary)', overflow: 'hidden' },
    sidebar: {
      width: 280, flexShrink: 0,
      background: 'var(--bg-surface)', borderRight: '1px solid var(--border)',
      padding: '1rem', display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto',
    },
    main: { flex: 1, position: 'relative', overflow: 'hidden', background: '#060d1a' },
    label: { fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 },
    btn: (v = 'primary', extra = {}) => ({
      padding: '0.4rem 0.85rem', borderRadius: 6, border: 'none', cursor: 'pointer',
      fontSize: 13, fontWeight: 500,
      background: v === 'ghost' ? 'var(--tint-med)' : 'var(--accent-primary)',
      color: v === 'ghost' ? 'var(--text-primary)' : '#fff',
      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      transition: 'background 120ms', ...extra,
    }),
    input: { width: '100%', padding: '0.4rem 0.6rem', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' },
    divider: { height: 1, background: 'var(--border-soft)' },
    nodeCard: { background: 'var(--bg-raised)', borderRadius: 8, padding: '0.6rem 0.75rem', fontSize: 13 },
    jobBadge: { padding: '2px 7px', borderRadius: 9, fontSize: 11, fontWeight: 600, background: jobBadgeBg, color: jobBadgeColor },
  }

  const entityTypes = useMemo(() => [...new Set(graphData.nodes.map(n => n.type).filter(Boolean))], [graphData])
  const linkTypes = useMemo(() => [...new Set(graphData.links.map(l => l.type).filter(Boolean))], [graphData])

  const isExtracting = jobStatus?.status === 'running' || jobStatus?.status === 'pending'

  return (
    <div style={s.page}>
      {/* ── Sidebar ── */}
      <div style={s.sidebar}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{t('graph.title')}</div>
          <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>
            {t('graph.nodes', { count: filteredGraph.nodes.length, links: filteredGraph.links.length })}
          </div>
        </div>

        <div style={s.divider} />

        {/* Scope selector — current document vs. whole organization */}
        <div>
          <div style={s.label}>{t('graph.scope')}</div>
          <select style={s.input} value={scope} onChange={e => setScope(e.target.value)}>
            <option value="">{t('graph.scopeOrg')}</option>
            {sessionId && !graphDocs.some(d => d.session_id === sessionId) && (
              <option value={sessionId}>{t('graph.scopeCurrent')}</option>
            )}
            {graphDocs.map(d => (
              <option key={d.session_id} value={d.session_id}>
                {(d.session_id === sessionId ? '● ' : '') + (d.document_name || d.session_id)}
                {d.node_count != null ? ` (${d.node_count})` : ''}
              </option>
            ))}
          </select>
        </div>

        <div style={s.divider} />

        {/* Physics controls */}
        <div>
          <button
            onClick={() => setShowPhysics(v => !v)}
            style={{ ...s.label, marginBottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-faint)' }}
          >
            <span>{t('graph.physics.title', 'Физика графа')}</span>
            <span style={{ fontSize: 12, transform: showPhysics ? 'rotate(90deg)' : 'none', transition: 'transform 120ms' }}>▸</span>
          </button>
          {showPhysics && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
              {[
                { k: 'charge',    label: t('graph.physics.repulsion', 'Отталкивание'),     min: -800, max: -20, step: 10,   fmt: v => Math.round(v) },
                { k: 'linkDist',  label: t('graph.physics.linkDist', 'Длина связей'),       min: 20,   max: 220, step: 5,    fmt: v => Math.round(v) },
                { k: 'linkStr',   label: t('graph.physics.linkStr', 'Притяжение связей'),   min: 0,    max: 1,   step: 0.05, fmt: v => v.toFixed(2) },
                { k: 'center',    label: t('graph.physics.center', 'Центрирование'),        min: 0,    max: 0.4, step: 0.01, fmt: v => v.toFixed(2) },
                { k: 'nodeScale', label: t('graph.physics.nodeSize', 'Размер узлов'),       min: 0.5,  max: 2.5, step: 0.1,  fmt: v => v.toFixed(1) + '×' },
              ].map(({ k, label, min, max, step, fmt }) => (
                <div key={k}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--text-secondary)', marginBottom: 3 }}>
                    <span>{label}</span>
                    <span style={{ color: 'var(--text-faint)', fontVariantNumeric: 'tabular-nums' }}>{fmt(physics[k])}</span>
                  </div>
                  <input
                    type="range" min={min} max={max} step={step} value={physics[k]}
                    onChange={e => setPhys(k, parseFloat(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--accent-primary)', cursor: 'pointer' }}
                  />
                </div>
              ))}
              <div style={{ display: 'flex', gap: 6 }}>
                <button style={{ ...s.btn('ghost'), padding: '0.3rem 0.6rem', fontSize: 12 }}
                  onClick={() => { setPhysics(DEFAULT_PHYSICS); localStorage.setItem('kence_graph_physics', JSON.stringify(DEFAULT_PHYSICS)) }}>
                  {t('graph.physics.reset', 'Сбросить')}
                </button>
                <button style={{ ...s.btn('ghost'), padding: '0.3rem 0.6rem', fontSize: 12 }}
                  onClick={() => graphRef.current?.zoomToFit(400, 40)}>
                  {t('graph.zoomFit', 'По размеру')}
                </button>
              </div>
            </div>
          )}
        </div>

        <div style={s.divider} />

        {/* Extraction */}
        {sessionId && (
          <div>
            <div style={s.label}>{t('graph.extractHint')}</div>
            <button style={s.btn('primary', { opacity: isExtracting ? 0.6 : 1 })} onClick={handleExtract} disabled={isExtracting}>
              {isExtracting ? t('graph.extracting') : t('graph.extractBtn')}
            </button>
            {jobStatus && (
              <div style={{ marginTop: 5, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={s.jobBadge}>{t(`graph.status.${jobStatus.status}`, jobStatus.status)}</span>
                {jobStatus.entity_count != null && (
                  <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                    {jobStatus.entity_count} · {jobStatus.rel_count ?? 0}
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        <div style={s.divider} />

        {/* Natural language query */}
        <div>
          <div style={s.label}>{t('graph.queryHint')}</div>
          <textarea
            style={{ ...s.input, height: 54, resize: 'none', marginBottom: 5 }}
            placeholder={t('graph.queryPlaceholder')}
            value={queryText}
            onChange={e => setQueryText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleQuery())}
          />
          <button style={s.btn()} onClick={handleQuery}>{t('graph.queryBtn')}</button>
          {queryResult && (
            <div style={{ ...s.nodeCard, marginTop: 7, maxHeight: 130, overflow: 'auto', fontSize: 11.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.6 }}>
              {queryResult}
            </div>
          )}
        </div>

        {/* Entity type filter */}
        {entityTypes.length > 0 && (
          <div>
            <div style={s.label}>
              {t('graph.entityTypes')}
              <span style={{ fontWeight: 400, marginLeft: 4, opacity: 0.5 }}>— {t('graph.clickToHide')}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {entityTypes.map(type => (
                <button key={type} onClick={() => toggleType(type)} style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                  padding: '4px 6px', border: 'none', background: 'none', cursor: 'pointer',
                  borderRadius: 5, transition: 'background 100ms',
                  opacity: hiddenTypes.has(type) ? 0.3 : 1,
                }}>
                  <div style={{
                    width: 9, height: 9, borderRadius: '50%', flexShrink: 0,
                    background: ENTITY_COLORS[type] || '#888',
                    boxShadow: hiddenTypes.has(type) ? 'none' : `0 0 6px ${ENTITY_COLORS[type] || '#888'}`,
                  }} />
                  <span style={{ fontSize: 12, color: 'var(--text-primary)', textDecoration: hiddenTypes.has(type) ? 'line-through' : 'none' }}>
                    {t(`graph.etype.${type}`, type)}
                  </span>
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-faint)' }}>
                    {graphData.nodes.filter(n => n.type === type).length}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Relation type legend */}
        {linkTypes.length > 0 && (
          <div>
            <div style={s.label}>{t('graph.relTypes')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {linkTypes.slice(0, 10).map(type => (
                <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 18, height: 2, borderRadius: 1, flexShrink: 0, background: LINK_COLORS[type] || '#64748b' }} />
                  <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{t(`graph.rel.${type}`, type)}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-faint)', opacity: 0.6 }}>
                    {graphData.links.filter(l => l.type === type).length}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Selected node detail */}
        {selectedNode && (
          <div>
            <div style={s.label}>{t('graph.selectedNode')}</div>
            <div style={s.nodeCard}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <div style={{
                  width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                  background: ENTITY_COLORS[selectedNode.type] || '#888',
                  boxShadow: `0 0 8px ${ENTITY_COLORS[selectedNode.type] || '#888'}`,
                }} />
                <span style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {selectedNode.label}
                </span>
              </div>
              <div style={{ fontSize: 11, color: ENTITY_COLORS[selectedNode.type] || 'var(--accent-primary)', marginBottom: neighbors.length ? 8 : 0, fontWeight: 600 }}>
                {t(`graph.etype.${selectedNode.type}`, selectedNode.type)} · {degreeMap[selectedNode.id] || 0} {t('graph.relTypes').toLowerCase()}
              </div>
              {neighbors.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ fontSize: 10, color: 'var(--text-faint)', fontWeight: 600, marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t('graph.connections')}</div>
                  {neighbors.map((nb, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, minWidth: 0 }}>
                      <span style={{ color: LINK_COLORS[nb.rel] || '#64748b', fontWeight: 700, flexShrink: 0, fontSize: 12 }}>{nb.dir}</span>
                      <span style={{ color: 'var(--text-faint)', fontStyle: 'italic', flexShrink: 0, fontSize: 10 }}>{t(`graph.rel.${nb.rel}`, nb.rel)}</span>
                      <span style={{ color: ENTITY_COLORS[nb.etype] || 'var(--text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {nb.label}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div style={{ marginTop: 'auto' }}>
          <button style={s.btn('ghost')} onClick={loadGraph}>{t('graph.refresh')}</button>
        </div>
      </div>

      {/* ── Graph canvas ── */}
      <div style={s.main} ref={containerRef}>

        {/* No org selected */}
        {!currentOrgId && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.3)', textAlign: 'center', gap: 10 }}>
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
            <div style={{ fontSize: 13 }}>{t('graph.noOrg')}</div>
          </div>
        )}

        {/* Loading */}
        {currentOrgId && loading && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, zIndex: 2, background: 'rgba(6,13,26,0.7)', backdropFilter: 'blur(4px)' }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              border: '2.5px solid rgba(34,211,238,0.15)',
              borderTopColor: 'var(--accent-primary)',
              animation: 'spin 0.8s linear infinite',
            }} />
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.04em' }}>{t('graph.loading')}</div>
          </div>
        )}

        {/* Empty state */}
        {currentOrgId && !loading && graphData.nodes.length === 0 && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.25)', textAlign: 'center', gap: 12 }}>
            <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
              <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" opacity="0.6"/>
              <circle cx="52" cy="20" r="8" stroke="currentColor" strokeWidth="2" opacity="0.6"/>
              <circle cx="32" cy="52" r="8" stroke="currentColor" strokeWidth="2" opacity="0.6"/>
              <line x1="20" y1="12" x2="44" y2="20" stroke="currentColor" strokeWidth="1.5" opacity="0.4"/>
              <line x1="52" y1="28" x2="40" y2="44" stroke="currentColor" strokeWidth="1.5" opacity="0.4"/>
              <line x1="24" y1="52" x2="12" y2="20" stroke="currentColor" strokeWidth="1.5" opacity="0.4"/>
            </svg>
            <div style={{ fontSize: 14 }}>{t('graph.empty')}</div>
          </div>
        )}

        {/* Force graph */}
        {FG && filteredGraph.nodes.length > 0 && (
          <FG
            ref={graphRef}
            graphData={filteredGraph}
            nodeLabel={n => `${n.label}  (${t(`graph.etype.${n.type}`, n.type)})`}
            nodeVal={n => Math.max(1, degreeMap[n.id] || 1)}
            nodeCanvasObjectMode={() => 'replace'}
            nodeCanvasObject={paintNode}
            onNodeClick={n => setSelectedNode(prev => prev?.id === n.id ? null : n)}
            onNodeHover={setHoveredNode}
            linkColor={l => LINK_COLORS[l.type] || '#475569'}
            linkLabel={l => t(`graph.rel.${l.type}`, l.type || '')}
            linkWidth={l => hoveredNeighborIds && (
              hoveredNeighborIds.has(typeof l.source === 'object' ? l.source.id : l.source) ||
              hoveredNeighborIds.has(typeof l.target === 'object' ? l.target.id : l.target)
            ) ? 2.5 : 1}
            linkCurvature={0.12}
            linkDirectionalArrowLength={5}
            linkDirectionalArrowRelPos={1}
            linkDirectionalArrowColor={l => LINK_COLORS[l.type] || '#475569'}
            linkDirectionalParticles={l => hoveredNeighborIds && (
              hoveredNeighborIds.has(typeof l.source === 'object' ? l.source.id : l.source) ||
              hoveredNeighborIds.has(typeof l.target === 'object' ? l.target.id : l.target)
            ) ? 4 : 0}
            linkDirectionalParticleWidth={2.5}
            linkDirectionalParticleColor={l => LINK_COLORS[l.type] || '#64748b'}
            linkOpacity={0.7}
            backgroundColor="#060d1a"
            onEngineStop={handleEngineStop}
            cooldownTicks={120}
            width={dims.w}
            height={dims.h}
          />
        )}

        {/* Zoom controls */}
        {filteredGraph.nodes.length > 0 && (
          <div style={{ position: 'absolute', bottom: 20, right: 20, display: 'flex', flexDirection: 'column', gap: 4, zIndex: 10 }}>
            {[
              { label: '+', title: t('graph.zoomIn'),  action: () => zoom(1.35) },
              { label: '−', title: t('graph.zoomOut'), action: () => zoom(1 / 1.35) },
              { label: '⊞', title: t('graph.zoomFit'), action: () => graphRef.current?.zoomToFit(400, 40) },
            ].map(({ label, title, action }) => (
              <button key={label} title={title} onClick={action} style={{
                width: 30, height: 30, borderRadius: 7, border: '1px solid rgba(255,255,255,0.15)',
                background: 'rgba(6,13,26,0.85)', color: 'rgba(255,255,255,0.7)',
                cursor: 'pointer', fontSize: label === '⊞' ? 14 : 18, fontWeight: 400,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                backdropFilter: 'blur(8px)', transition: 'background 120ms',
              }}>
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Interaction hint */}
        {filteredGraph.nodes.length > 0 && !hoveredNode && !selectedNode && (
          <div style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', fontSize: 11, color: 'rgba(255,255,255,0.2)', pointerEvents: 'none', whiteSpace: 'nowrap' }}>
            {t('graph.canvasHint')}
          </div>
        )}
      </div>
    </div>
  )
}
