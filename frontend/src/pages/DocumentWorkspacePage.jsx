import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { FlagIcon } from '@/shared/ui/flag-icon/FlagIcon'
import {
  Send, Bot, User, Loader2, Copy, FileText, Check, Trash2,
  Languages, FileDown, BarChart2, GitCompare, RefreshCw,
  BookOpen, SlidersHorizontal, ChevronUp, ChevronDown, ChevronRight,
  List, AlertTriangle, Upload, Eye, Scan, Pencil,
  Table2, LineChart, Download, Square, BookMarked,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  BarChart, Bar, LineChart as RechartsLine, Line, PieChart as RechartsPie, Pie, Cell,
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import TableBuilderPanel from '../components/TableBuilderPanel'
import ChartBuilderPanel from '../components/ChartBuilderPanel'
import { Badge } from '@/shared/ui/badge'
import Skeleton from '@/shared/ui/skeleton/Skeleton'
import DocumentViewer from '@/widgets/document-viewer'
import {
  apiFetchDocumentImage,
  apiGetDocumentContent,
  apiSaveMarkdown,
  apiExportMarkdown,
} from '../lib/api'
import { apiCreateAgentTask, apiGetAgentTask } from '../lib/api/enterprise.js'
import { useDocumentContent } from '../hooks/useDocumentContent'
import { useChatMessages, detectNotFound } from '../hooks/useChatMessages'
import { useDocContext } from '../hooks/useDocContext'
import { useToastStore } from '../shared/stores/toastStore'
import useOrgStore from '../shared/stores/orgStore'
import useLibraryStore from '../shared/stores/libraryStore'
import LibraryDocModal from '../components/LibraryDocModal'
import TranslationJobsPanel from '../components/TranslationJobsPanel'

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.tiff', '.bmp', '.webp', '.heic'])

const LANGS = [
  { code: 'kz', label: 'KZ' },
  { code: 'ru', label: 'RU' },
  { code: 'en', label: 'EN' },
]

const CHART_COLORS = [
  'var(--color-cyan-400)', 'var(--color-blue-400)', 'var(--color-violet-400)',
  'var(--color-green-400)', 'var(--color-amber-400)', 'var(--color-red-400)',
]

function preprocessChartDirectives(md) {
  if (!md) return md
  return md.replace(
    /\[CHART\s+type=["']?(\w+)["']?\s+title=["']([^"']+)["'](?:\s+data='([^']*)')?(?:\s+data_hint=["']([^"']+)["'])?\]/gi,
    (raw, type, title, data, hint) => {
      const meta = JSON.stringify({ type, title, data: data || null, hint: hint || null, raw })
      return '```chart-directive\n' + meta + '\n```'
    }
  )
}

const tooltipStyle = {
  contentStyle: {
    background: 'var(--bg-surface-2)',
    border: '1px solid var(--border-default)',
    borderRadius: 6, fontSize: 11,
  },
}

function InlineChart({ type, data }) {
  const d = data.map(r => ({ name: r.label || '—', value: parseFloat(r.value) || 0 }))
  const common = { data: d, margin: { top: 2, right: 4, bottom: 2, left: -16 } }

  if (type === 'bar') return (
    <BarChart {...common}>
      <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} />
      <YAxis tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} />
      <Tooltip {...tooltipStyle} />
      <Bar dataKey="value" radius={[4,4,0,0]}>
        {d.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
      </Bar>
    </BarChart>
  )
  if (type === 'line') return (
    <RechartsLine {...common}>
      <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} />
      <YAxis tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} />
      <Tooltip {...tooltipStyle} />
      <Line type="monotone" dataKey="value" stroke="var(--color-cyan-400)" strokeWidth={2} dot={{ r: 3, fill: 'var(--color-cyan-400)' }} />
    </RechartsLine>
  )
  if (type === 'area') return (
    <AreaChart {...common}>
      <defs>
        <linearGradient id="icAreaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor="var(--color-cyan-400)" stopOpacity={0.3} />
          <stop offset="95%" stopColor="var(--color-cyan-400)" stopOpacity={0} />
        </linearGradient>
      </defs>
      <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} />
      <YAxis tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} />
      <Tooltip {...tooltipStyle} />
      <Area type="monotone" dataKey="value" stroke="var(--color-cyan-400)" strokeWidth={2} fill="url(#icAreaGrad)" />
    </AreaChart>
  )
  // pie
  return (
    <RechartsPie margin={{ top: 2, right: 4, bottom: 2, left: 4 }}>
      <Pie data={d} dataKey="value" nameKey="name" innerRadius={32} outerRadius={60} paddingAngle={2}>
        {d.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
      </Pie>
      <Tooltip {...tooltipStyle} />
      <Legend wrapperStyle={{ fontSize: 10, color: 'var(--text-tertiary)' }} iconSize={7} />
    </RechartsPie>
  )
}

function InlineChartRenderer({ type, title, data: dataStr, hint, raw, onEdit, onDelete }) {
  const { t } = useTranslation()
  const [hovered, setHovered] = useState(false)

  let chartData = null
  if (dataStr) {
    try { chartData = JSON.parse(dataStr) } catch { /* invalid */ }
  }

  if (hint && !chartData) {
    return (
      <div className="inline-chart inline-chart--hint">
        <BarChart2 size={14} />
        <span style={{ fontWeight: 600 }}>{title}</span>
        <span className="inline-chart__hint-badge">{t('workspace.chartHintBadge', 'AI-данные при экспорте')}</span>
        {onEdit && (
          <button className="inline-chart__overlay-btn" style={{ marginLeft: 8 }} onClick={onEdit}>
            <Pencil size={11} /> {t('common.configure', 'Настроить')}
          </button>
        )}
      </div>
    )
  }

  if (!chartData || !chartData.length) {
    return (
      <div className="inline-chart inline-chart--error">
        <AlertTriangle size={13} /> {t('workspace.chartNoData', { title, defaultValue: `Нет данных для графика «${title}»` })}
        {onEdit && (
          <button className="inline-chart__overlay-btn" style={{ marginLeft: 8 }} onClick={onEdit}>
            <Pencil size={11} /> {t('common.configure', 'Настроить')}
          </button>
        )}
      </div>
    )
  }

  return (
    <div
      className={`inline-chart${hovered ? ' inline-chart--hovered' : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {title && <div className="inline-chart__title">{title}</div>}
      <ResponsiveContainer width="100%" height={200}>
        <InlineChart type={type || 'bar'} data={chartData} />
      </ResponsiveContainer>

      <AnimatePresence>
        {hovered && (onEdit || onDelete) && (
          <motion.div
            className="inline-chart__overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
          >
            {onEdit && (
              <button className="inline-chart__overlay-btn" onClick={onEdit}>
                <Pencil size={12} /> {t('common.edit', 'Изменить')}
              </button>
            )}
            {onDelete && (
              <button className="inline-chart__overlay-btn inline-chart__overlay-btn--danger" onClick={onDelete}>
                <Trash2 size={12} /> {t('common.delete', 'Удалить')}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Sources panel ─────────────────────────────────────────────────────────────

function SourcesPanel({ sources }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  if (!sources?.length) return null
  return (
    <div className="ws-sources">
      <button className="ws-sources__toggle" onClick={() => setOpen(o => !o)}>
        <ChevronRight size={11} className={`ws-sources__icon${open ? ' ws-sources__icon--open' : ''}`} />
        {t('workspace.sourcesFmt', { count: sources.length })}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="ws-sources__list"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={{ overflow: 'hidden' }}
          >
            {sources.map((src, i) => (
              <div key={i} className="ws-source-item">
                <div className="ws-source-item__text">«{src.text.trim()}»</div>
                {(src.source || src.page != null) && (
                  <div className="ws-source-item__meta">
                    {src.source && <span>{src.source}</span>}
                    {src.page != null && <span style={{ marginLeft: 6 }}>стр. {src.page}</span>}
                  </div>
                )}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

const TIP_KEYS = [
  'workspace.tips.summary',
  'workspace.tips.keyFindings',
  'workspace.tips.dates',
  'workspace.tips.explain',
  'workspace.tips.risks',
  'workspace.tips.actions',
  'workspace.tips.whoIsInvolved',
]

// ── Sub-components ────────────────────────────────────────────────────────────

function TypingDots() {
  return <span className="typing-dots"><span /><span /><span /></span>
}

function formatTime(ts) {
  if (!ts) return null
  return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

// Memoized so an in-progress SSE stream — which replaces only the LAST message
// object on every chunk (see useChatMessages.makeStreamHandlers) — doesn't force
// every earlier message to re-run its ReactMarkdown parse on every token. Only
// `copied` is shared across all rows (bumps every row once per copy-click,
// harmless); msg/i/callbacks are otherwise stable per row.
const ChatMessage = React.memo(function ChatMessage({ msg, i, copied, onCopy, onRegenerate, onExplainSimply }) {
  const { t } = useTranslation()
  return (
    <motion.div
      // Skip the enter animation while streaming — it would replay on every
      // chunk-triggered re-render (initial/animate re-evaluate each render;
      // only the mount transition should ever run).
      initial={msg.streaming ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className={`ws-msg${msg.role === 'user' ? ' ws-msg--user' : ''}`}
    >
      <div className={`ws-avatar${msg.role === 'user' ? ' ws-avatar--user' : ''}`}>
        {msg.role === 'user' ? <User size={13} color="#fff" /> : <Bot size={13} style={{ color: 'var(--accent-primary)' }} />}
      </div>
      <div className={`ws-bubble${msg.role === 'user' ? ' ws-bubble--user' : ' ws-bubble--bot'}${msg.isError ? ' ws-bubble--error' : ''}`}>
        {/* Not-found indicator */}
        {msg.role === 'assistant' && msg.notFound && !msg.streaming && (
          <div className="ws-not-found-chip">
            <AlertTriangle size={10} /> {t('workspace.notFoundInDoc')}
          </div>
        )}
        {/* Stopped-by-user indicator */}
        {msg.role === 'assistant' && msg.stopped && (
          <div className="ws-stopped-chip">
            <Square size={9} /> {t('workspace.generationStopped')}
          </div>
        )}
        {msg.status === 'typing' && !msg.content
          ? <TypingDots />
          : msg.status && !msg.content
            ? <span style={{ opacity: 0.5, fontStyle: 'italic' }}>{msg.status}</span>
            : msg.role === 'assistant' && msg.content
              ? <div className="chat-md"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{ table: ({node, ...p}) => <div className="table-wrap"><table {...p} /></div> }}>{msg.content}</ReactMarkdown></div>
              : <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
        }
        {msg.streaming && msg.content && <span className="ws-stream-cursor" aria-hidden="true" />}
        {msg.role === 'assistant' && msg.content && !msg.streaming && (
          <>
            <button className="ws-copy-btn ws-bubble__copy" onClick={() => onCopy(i, msg.content)}>
              {copied === i ? <Check size={10} /> : <Copy size={10} />}
            </button>
            {onRegenerate && (
              <button
                className="ws-action-btn ws-regen-btn"
                onClick={() => onRegenerate(i)}
                title={t('workspace.regenerate')}
                aria-label={t('workspace.regenerate')}
              >
                <RefreshCw size={11} />
              </button>
            )}
            {/* Phase 5: Explain Simply button */}
            {onExplainSimply && !msg.isSimplified && (
              <button
                className="ws-action-btn ws-explain-btn"
                onClick={() => onExplainSimply(i, msg.content)}
                title="Объяснить проще"
                style={{ opacity: 0, transition: 'opacity 0.15s', fontSize: 10, padding: '2px 6px', borderRadius: 6 }}
              >
                💡 Проще
              </button>
            )}
            {msg.isSimplified && (
              <span style={{ fontSize: 10, color: 'var(--accent-primary)', marginLeft: 6 }}>💡 Упрощено</span>
            )}
          </>
        )}
        {msg.ts && !msg.historical && (
          <div className="ws-msg-time">{formatTime(msg.ts)}</div>
        )}
        {/* Sources panel */}
        {msg.role === 'assistant' && !msg.streaming && (
          <SourcesPanel sources={msg.sources} />
        )}
      </div>
    </motion.div>
  )
})

function DocContextPanel({ t, docContext, setDocContext, ctxSaving, ctxSaved, onSave, onClear }) {
  return (
    <div className="ws-ctx-panel">
      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, lineHeight: 1.4 }}>
        {t('workspace.contextHint')}
      </p>
      <textarea
        value={docContext}
        onChange={e => setDocContext(e.target.value)}
        placeholder={t('workspace.contextPlaceholder')}
        rows={3}
        className="ws-ctx-textarea"
      />
      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        <button className={`ws-ctx-save${ctxSaved ? ' ws-ctx-save--saved' : ''}`} onClick={onSave} disabled={ctxSaving}>
          {ctxSaved ? <><Check size={10} /> {t('workspace.saved')}</> : ctxSaving ? '…' : t('workspace.saveContext')}
        </button>
        {docContext && (
          <button className="ws-ctx-clear" onClick={onClear}>
            {t('workspace.clearContext')}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function DocumentWorkspacePage({ sessionId, documentName }) {
  const { t } = useTranslation()
  const navigate  = useNavigate()
  const addToast  = useToastStore(s => s.addToast)
  const docViewerRef = useRef(null)
  const textareaRef  = useRef(null)
  const pollRef      = useRef(null)

  const [showToc, setShowToc] = useState(false)

  // ── Add-to-library state ─────────────────────────────────────────────────────
  const { currentOrgId } = useOrgStore()
  const libTaxonomy = useLibraryStore(s => s.taxonomy)
  const fetchTaxonomy = useLibraryStore(s => s.fetchTaxonomy)
  const [showAddLibrary, setShowAddLibrary] = useState(false)
  const openAddLibrary = useCallback(() => {
    if (!currentOrgId) { addToast('error', t('library.noOrg')); return }
    fetchTaxonomy(currentOrgId)
    setShowAddLibrary(true)
  }, [currentOrgId, fetchTaxonomy, addToast, t])

  // ── Edit mode state ────────────────────────────────────────────────────────
  const [isEditMode,       setIsEditMode]       = useState(false)
  const [editedMarkdown,   setEditedMarkdown]   = useState('')
  const [isSaving,         setIsSaving]         = useState(false)
  const [isExporting,      setIsExporting]      = useState(false)
  const [showAgentDialog,  setShowAgentDialog]  = useState(false)
  const [showTableBuilder, setShowTableBuilder] = useState(false)
  const [showChartBuilder, setShowChartBuilder] = useState(false)
  const [chartEditorState, setChartEditorState] = useState(null)
  const [agentInstructions,setAgentInstructions]= useState('')
  const [agentRunning,     setAgentRunning]     = useState(false)
  const [agentStatus,      setAgentStatus]      = useState('')
  const [imageObjectUrl,   setImageObjectUrl]   = useState(null)

  const isImageDoc = documentName
    ? IMAGE_EXTS.has('.' + documentName.split('.').pop().toLowerCase())
    : false

  const { markdown, htmlDoc, loadingDoc, headings } = useDocumentContent(sessionId)

  // ── Session expiry warning ─────────────────────────────────────────────────
  // Touch last_activity by fetching content; warn 5 min before 1-hour expiry.
  useEffect(() => {
    if (!sessionId) return
    const SESSION_TTL_MS = 60 * 60 * 1000       // 1 hour (matches backend SESSION_TIMEOUT)
    const WARN_BEFORE_MS = 5  * 60 * 1000       // warn 5 min before expiry
    const WARN_AT_MS     = SESSION_TTL_MS - WARN_BEFORE_MS  // 55 min

    const warnTimer = setTimeout(() => {
      addToast('warning', t('workspace.sessionExpiryWarning', 'Сессия истекает через 5 минут. Нажмите «Продлить» для сохранения работы.'))
    }, WARN_AT_MS)

    return () => clearTimeout(warnTimer)
  }, [sessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load image preview as a blob so the auth token travels in the
  // Authorization header instead of a ?token= query param.
  useEffect(() => {
    if (!sessionId || !isImageDoc) { setImageObjectUrl(null); return }
    let cancelled = false
    let objUrl = null
    apiFetchDocumentImage(sessionId)
      .then((url) => {
        if (cancelled) { URL.revokeObjectURL(url); return }
        objUrl = url
        setImageObjectUrl(url)
      })
      .catch(() => setImageObjectUrl(null))
    return () => { cancelled = true; if (objUrl) URL.revokeObjectURL(objUrl) }
  }, [sessionId, isImageDoc])

  // Pre-process [CHART ...] directives for view-mode rendering
  const displayMarkdown = useMemo(() => preprocessChartDirectives(markdown), [markdown])

  const {
    messages, input, setInput, loading, copied,
    chatMode, setChatMode, visualizing, translating,
    inputRef, messagesEndRef, messagesScrollRef,
    handleSend, handleStop, handleClearHistory, handleVisualDescribe,
    handleTranslate, handleExport, handleCopy,
    handleRegenerate, handleExportChat, handleExplainSimply,
  } = useChatMessages(sessionId, isImageDoc)

  const {
    docContext, setDocContext, ctxSaving, ctxSaved, showCtx, setShowCtx,
    handleSave: handleCtxSave, handleClear: handleCtxClear,
  } = useDocContext(documentName)

  // useCallback (stable identity) so it doesn't defeat DocumentViewer's memo —
  // see the customComponents useMemo below for the same reasoning.
  const handleSelection = useCallback((text) => {
    const snippet = text.slice(0, 120) + (text.length > 120 ? '…' : '')
    setInput(`[${t('workspace.contextPrefix')}: "${snippet}"]\n`)
    inputRef.current?.focus()
  }, [t, setInput])

  const scrollToHeading = (idx) => {
    setShowToc(false)
    const container = docViewerRef.current
    if (!container) return
    const h = headings[idx]
    if (!h) return
    for (const el of container.querySelectorAll('h1,h2,h3,h4,h5,h6')) {
      if (el.textContent.trim() === h.text) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        return
      }
    }
  }

  const scrollDocBy = (dir) => {
    const container = docViewerRef.current
    if (!container) return
    container.scrollBy({ top: dir * container.clientHeight * 0.8, behavior: 'smooth' })
  }

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  // ── Edit mode helpers ──────────────────────────────────────────────────────

  const enterEditMode = () => {
    setEditedMarkdown(markdown)
    setIsEditMode(true)
  }

  const exitEditMode = () => {
    setIsEditMode(false)
  }

  const insertAtCursor = useCallback((text) => {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart
    const end   = el.selectionEnd
    const next  = editedMarkdown.slice(0, start) + text + editedMarkdown.slice(end)
    setEditedMarkdown(next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + text.length, start + text.length)
    })
  }, [editedMarkdown])

  const insertTable = () => setShowTableBuilder(true)
  const insertChart = () => { setChartEditorState(null); setShowChartBuilder(true) }

  const handleChartReplace = useCallback((newDirective) => {
    if (chartEditorState?.raw) {
      setEditedMarkdown(md => md.replace(chartEditorState.raw, newDirective))
    }
    setChartEditorState(null)
    setShowChartBuilder(false)
  }, [chartEditorState])

  const openChartEditor = useCallback((meta) => {
    let parsedData = null
    if (meta.data) { try { parsedData = JSON.parse(meta.data) } catch { /* */ } }
    setChartEditorState({
      raw: meta.raw,
      initialType:  meta.type,
      initialTitle: meta.title,
      initialData:  parsedData,
    })
    setShowChartBuilder(true)
  }, [])

  const deleteChart = useCallback((raw) => {
    setEditedMarkdown(md => md.replace(raw, ''))
  }, [])

  // Custom ReactMarkdown component to render chart-directive fenced blocks
  // Must be defined AFTER openChartEditor and deleteChart to avoid TDZ errors
  const chartCodeComponent = useCallback(({ inline, className, children }) => {
    if (!inline && className === 'language-chart-directive') {
      try {
        const meta = JSON.parse(String(children).trim())
        return (
          <InlineChartRenderer
            {...meta}
            onEdit={() => openChartEditor(meta)}
            onDelete={() => deleteChart(meta.raw)}
          />
        )
      } catch {
        return <code className={className}>{children}</code>
      }
    }
    return <code className={className}>{children}</code>
  }, [openChartEditor, deleteChart])

  // Stable object identity — an inline `{{ code: chartCodeComponent }}` literal
  // at the DocumentViewer call site would be a new object every render and
  // defeat React.memo(DocumentViewer) even though chartCodeComponent itself
  // is useCallback-stable.
  const documentViewerComponents = useMemo(
    () => ({ code: chartCodeComponent }),
    [chartCodeComponent]
  )

  const autoSave = useCallback(async () => {
    if (!sessionId || !isEditMode) return
    setIsSaving(true)
    try {
      await apiSaveMarkdown(sessionId, editedMarkdown)
    } catch {
      addToast('error', t('workspace.saveFailed', 'Не удалось сохранить документ'))
    } finally {
      setIsSaving(false)
    }
  }, [sessionId, isEditMode, editedMarkdown, addToast, t])

  const exportEdited = useCallback(async (fmt) => {
    if (!sessionId || isExporting) return
    setIsExporting(true)
    try {
      const blob = await apiExportMarkdown(sessionId, editedMarkdown, fmt)
      const url  = URL.createObjectURL(blob)
      const a    = Object.assign(document.createElement('a'), {
        href: url,
        download: `edited_document.${fmt}`,
      })
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      if (import.meta.env.DEV) console.error('Export failed:', e)
    } finally {
      setIsExporting(false)
    }
  }, [sessionId, isExporting, editedMarkdown])

  const launchAgentEdit = useCallback(async () => {
    if (!sessionId || agentRunning) return
    setAgentRunning(true)
    setAgentStatus(t('workspace.agentStarting', 'Запуск агента…'))
    let retryCount = 0
    const MAX_RETRIES = 3
    try {
      const { task_id } = await apiCreateAgentTask({
        task_type: 'document_editor',
        session_id: sessionId,
        instructions: agentInstructions || t('workspace.agentDefaultInstructions', 'Улучши структуру, исправь грамматику и оформление'),
      })

      clearInterval(pollRef.current)
      pollRef.current = setInterval(async () => {
        try {
          const task = await apiGetAgentTask(task_id)
          retryCount = 0
          if (task.status === 'done') {
            clearInterval(pollRef.current)
            const em = task.output_data?.edited_markdown
            if (em) setEditedMarkdown(em)
            setAgentStatus('')
            setAgentRunning(false)
            setShowAgentDialog(false)
          } else if (task.status === 'failed' || task.status === 'cancelled') {
            clearInterval(pollRef.current)
            setAgentStatus(t('workspace.agentError', { msg: task.error || t('common.unknownError', 'неизвестная ошибка'), defaultValue: `Ошибка: ${task.error || 'неизвестная ошибка'}` }))
            setAgentRunning(false)
          } else {
            const lastStep = task.steps?.at(-1)
            if (lastStep) setAgentStatus(lastStep.detail || lastStep.step)
          }
        } catch {
          retryCount++
          if (retryCount >= MAX_RETRIES) {
            clearInterval(pollRef.current)
            setAgentRunning(false)
            setAgentStatus(t('workspace.agentConnectionError', 'Ошибка соединения'))
          }
        }
      }, 1500)
    } catch (e) {
      setAgentRunning(false)
      setAgentStatus(t('workspace.agentError', { msg: e.message, defaultValue: `Ошибка: ${e.message}` }))
    }
  }, [sessionId, agentRunning, agentInstructions, t])

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="ws-root">

      {/* ══════════ LEFT — Document ══════════ */}
      <motion.div
        className="ws-doc-panel"
        initial={{ opacity: 0, x: -14 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="ws-panel-header">
          <FileText size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <span className="ws-panel-title">{documentName || t('workspace.document')}</span>
          {!loadingDoc && markdown && (
            <Badge variant="neutral" size="sm" style={{ marginLeft: 4 }}>
              {(isEditMode ? editedMarkdown : markdown).length.toLocaleString()} {t('workspace.chars')}
            </Badge>
          )}
          <div className="ws-doc-nav">
            {/* TOC — only in view mode */}
            {!isEditMode && headings.length > 0 && (
              <div style={{ position: 'relative' }}>
                <button className="ws-doc-nav-btn" onClick={() => setShowToc(v => !v)} title={t('workspace.toc')}>
                  <List size={13} />
                </button>
                <AnimatePresence>
                  {showToc && (
                    <motion.div
                      className="ws-toc-dropdown"
                      initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.13 }}
                    >
                      {headings.map((h, i) => (
                        <button key={i} className="ws-toc-item"
                          style={{ paddingLeft: 8 + (h.level - 1) * 12 }}
                          onClick={() => scrollToHeading(i)}>
                          {h.text}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
            {!isEditMode && (
              <>
                <button className="ws-doc-nav-btn" onClick={() => scrollDocBy(-1)} title={t('workspace.scrollUp')}><ChevronUp size={13} /></button>
                <button className="ws-doc-nav-btn" onClick={() => scrollDocBy(1)} title={t('workspace.scrollDown')}><ChevronDown size={13} /></button>
              </>
            )}
            {/* Extend session button — refreshes last_activity on backend */}
            {sessionId && (
              <button
                className="ws-doc-nav-btn"
                onClick={() => {
                  // Touch the session by fetching content (updates last_activity server-side)
                  apiGetDocumentContent(sessionId)
                    .then(() => addToast('success', t('workspace.sessionExtended', 'Сессия продлена на 1 час')))
                    .catch(() => addToast('error', t('workspace.sessionExtendFailed', 'Не удалось продлить сессию')))
                }}
                title={t('workspace.extendSession', 'Продлить сессию')}
              >
                <RefreshCw size={13} />
              </button>
            )}
            {/* Add current document to library */}
            {sessionId && currentOrgId && (
              <button
                className="ws-doc-nav-btn"
                onClick={openAddLibrary}
                title={t('library.addSessionTitle')}
              >
                <BookMarked size={13} />
              </button>
            )}
            {/* Edit mode toggle */}
            {!isImageDoc && !loadingDoc && markdown && (
              <button
                className={`ws-doc-nav-btn${isEditMode ? ' ws-doc-nav-btn--active' : ''}`}
                onClick={isEditMode ? exitEditMode : enterEditMode}
                title={isEditMode ? t('workspace.viewMode') : t('workspace.editMode')}
              >
                {isEditMode ? <Eye size={13} /> : <Pencil size={13} />}
              </button>
            )}
          </div>
        </div>

        {/* Edit toolbar */}
        <AnimatePresence>
          {isEditMode && (
            <motion.div
              className="doc-edit-toolbar"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <button className="doc-edit-toolbar__btn" onClick={insertTable} title={t('workspace.insertTable')}>
                <Table2 size={12} /> Таблица
              </button>
              <button className="doc-edit-toolbar__btn" onClick={insertChart} title={t('workspace.insertChart')}>
                <LineChart size={12} /> График
              </button>
              <button
                className="doc-edit-toolbar__btn doc-edit-toolbar__btn--agent"
                onClick={() => setShowAgentDialog(true)}
                title={t('workspace.editWithAgent')}
              >
                <Bot size={12} /> Агент
              </button>
              <div className="doc-edit-toolbar__sep" />
              <button
                className="doc-edit-toolbar__btn doc-edit-toolbar__btn--export"
                onClick={() => exportEdited('docx')}
                disabled={isExporting}
                title={t('workspace.downloadDocx')}
              >
                <Download size={12} /> {isExporting ? '…' : 'DOCX'}
              </button>
              <button
                className="doc-edit-toolbar__btn doc-edit-toolbar__btn--export"
                onClick={() => exportEdited('pdf')}
                disabled={isExporting}
                title={t('workspace.downloadPdf')}
              >
                <Download size={12} /> PDF
              </button>
              {isSaving && (
                <span className="doc-edit-toolbar__status">{t('workspace.saving')}</span>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <div className={`ws-doc-body${isEditMode ? ' ws-doc-body--editing' : ''}`}>
          {loadingDoc
            ? <div className="ws-loading" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '20px 24px' }}>
                <Skeleton height="18px" width="70%" />
                <Skeleton height="14px" />
                <Skeleton height="14px" width="90%" />
                <Skeleton height="14px" width="80%" />
                <Skeleton height="18px" width="55%" style={{ marginTop: 8 }} />
                <Skeleton height="14px" />
                <Skeleton height="14px" width="85%" />
                <Skeleton height="14px" width="60%" />
              </div>
            : !sessionId
              ? <div className="ws-empty">
                  <FileText size={32} style={{ opacity: 0.2, marginBottom: 8 }} />
                  <p>{t('workspace.noDoc')}</p>
                  <button className="ws-empty-btn" onClick={() => navigate('/upload')}>
                    <Upload size={13} /> {t('workspace.uploadLink')}
                  </button>
                </div>
              : isImageDoc
                ? <div className="ws-image-preview">
                    {imageObjectUrl && <img src={imageObjectUrl} alt={documentName}
                      className="ws-image-preview__img"
                      onError={(e) => { e.target.style.display = 'none' }} />}
                    {markdown && (
                      <details className="ws-image-preview__ocr">
                        <summary>{t('workspace.extractedText')}</summary>
                        <pre className="ws-image-preview__ocr-text">{markdown}</pre>
                      </details>
                    )}
                  </div>
                : isEditMode
                  ? <textarea
                      ref={textareaRef}
                      className="doc-editor-textarea"
                      value={editedMarkdown}
                      onChange={e => setEditedMarkdown(e.target.value)}
                      onBlur={autoSave}
                      spellCheck={false}
                    />
                  : <DocumentViewer ref={docViewerRef} markdown={displayMarkdown} html={htmlDoc} onSelection={handleSelection} customComponents={documentViewerComponents} />
          }
        </div>
      </motion.div>

      {/* ══════════ RIGHT — Chat ══════════ */}
      <motion.div
        className="ws-chat-panel"
        initial={{ opacity: 0, x: 14 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1], delay: 0.07 }}
      >
        {/* Chat header */}
        <div className="ws-panel-header">
          <Bot size={13} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
          <span className="ws-panel-title">{t('workspace.ai')}</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
            {messages.length > 1 && (
              <>
                <button className="ws-action-btn" onClick={handleExportChat} title={t('workspace.exportChat')}>
                  <FileDown size={11} />
                </button>
                <button className="ws-action-btn" onClick={handleClearHistory} title={t('workspace.clearHistory')}>
                  <Trash2 size={11} />
                </button>
              </>
            )}
            <button className="ws-action-btn" onClick={() => navigate('/compare')} title={t('workspace.compare')}><GitCompare size={11} /></button>
            <button className="ws-action-btn" onClick={() => navigate('/convert')} title={t('workspace.convert')}><RefreshCw size={11} /></button>
            <button className="ws-action-btn ws-action-btn--blue" onClick={() => navigate('/presentation')} title={t('nav.presentation')}><BarChart2 size={11} /></button>
            <button className={`ws-action-btn${showCtx ? ' ws-action-btn--active' : ''}`}
              onClick={() => setShowCtx(v => !v)} title={t('workspace.docContext')}>
              <BookOpen size={11} />
            </button>
            <button className="ws-action-btn" onClick={() => navigate('/ai-settings')} title={t('workspace.promptSettings')}><SlidersHorizontal size={11} /></button>
          </div>
        </div>

        {/* Background translation jobs (async, survives refresh) */}
        <TranslationJobsPanel sessionId={sessionId} disabled={loading} />

        {/* Messages */}
        <div className="ws-messages" ref={messagesScrollRef}>
          <div className="ws-messages-inner">
            {messages.map((msg, i) =>
              msg.role === 'divider'
                ? <div key={i} className="ws-history-divider">{t('workspace.prevSession')}</div>
                : <ChatMessage key={i} msg={msg} i={i} copied={copied} onCopy={handleCopy} onRegenerate={handleRegenerate} onExplainSimply={handleExplainSimply} />
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input area */}
        <div className="ws-input-area">
          {!sessionId ? (
            <button className="ws-no-session" onClick={() => navigate('/upload')}>
              <AlertTriangle size={13} /> {t('workspace.noSession')}
            </button>
          ) : (
            <>
              {/* Mode toggle + Tips */}
              <div className="ws-tips-row">
                <div className="ws-mode-toggle">
                  {['exact', 'consultation'].map(mode => (
                    <div key={mode} className="ws-mode-btn-wrap">
                      {chatMode === mode && (
                        <motion.div className="ws-mode-pill" layoutId="ws-mode-pill"
                          transition={{ type: 'spring', stiffness: 420, damping: 36 }} />
                      )}
                      <button
                        className={`ws-mode-btn${chatMode === mode ? ' ws-mode-btn--active' : ''}`}
                        onClick={() => setChatMode(mode)}
                        title={t(`workspace.${mode}Title`)}
                      >
                        {t(`workspace.${mode}`)}
                      </button>
                    </div>
                  ))}
                  {isImageDoc && (
                    <div className="ws-mode-btn-wrap">
                      {chatMode === 'visual' && (
                        <motion.div className="ws-mode-pill" layoutId="ws-mode-pill"
                          transition={{ type: 'spring', stiffness: 420, damping: 36 }} />
                      )}
                      <button
                        className={`ws-mode-btn ws-mode-btn--vision${chatMode === 'visual' ? ' ws-mode-btn--active' : ''}`}
                        onClick={() => setChatMode('visual')}
                        title={t('workspace.visualTitle')}
                      >
                        <Eye size={11} style={{ marginRight: 3 }} /> {t('workspace.visual')}
                      </button>
                    </div>
                  )}
                </div>

                {isImageDoc && chatMode === 'visual' ? (
                  <>
                    <button className="ws-tip ws-tip--vision" onClick={handleVisualDescribe} disabled={visualizing}>
                      <Scan size={10} style={{ marginRight: 3 }} />
                      {visualizing ? t('workspace.analyzing') : t('workspace.describeBtn')}
                    </button>
                    <button className="ws-tip" onClick={() => { setInput(t('workspace.whatIsHere'));  inputRef.current?.focus() }}>{t('workspace.whatIsHere')}</button>
                    <button className="ws-tip" onClick={() => { setInput(t('workspace.extractText')); inputRef.current?.focus() }}>{t('workspace.extractText')}</button>
                    <button className="ws-tip" onClick={() => { setInput(t('workspace.tableData'));   inputRef.current?.focus() }}>{t('workspace.tableData')}</button>
                  </>
                ) : (
                  TIP_KEYS.map((key, i) => (
                    <button key={i} className="ws-tip" onClick={() => { setInput(t(key)); inputRef.current?.focus() }}>{t(key)}</button>
                  ))
                )}
              </div>

              {/* Textarea + send */}
              <div className="ws-input-bar">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                  placeholder={t('workspace.placeholder')}
                  rows={2}
                  className="ws-textarea"
                  disabled={loading}
                />
                {loading ? (
                  <button
                    onClick={handleStop}
                    className="ws-send-btn ws-stop-btn"
                    title={t('workspace.stopGeneration')}
                    aria-label={t('workspace.stopGeneration')}
                  >
                    <Square size={13} />
                  </button>
                ) : (
                  <button
                    onClick={() => handleSend()}
                    disabled={!input.trim()}
                    className={`ws-send-btn${input.trim() ? ' ws-send-btn--active' : ''}`}
                  >
                    <Send size={15} />
                  </button>
                )}
              </div>

              {/* Doc context (collapsible) */}
              <AnimatePresence>
                {showCtx && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
                    style={{ overflow: 'hidden' }}
                  >
                    <DocContextPanel
                      t={t}
                      docContext={docContext}
                      setDocContext={setDocContext}
                      ctxSaving={ctxSaving}
                      ctxSaved={ctxSaved}
                      onSave={handleCtxSave}
                      onClear={handleCtxClear}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
        </div>
      </motion.div>

      {/* ══════════ Table Builder Panel ══════════ */}
      <TableBuilderPanel
        open={showTableBuilder}
        onClose={() => setShowTableBuilder(false)}
        onInsert={(md) => { insertAtCursor(md); setShowTableBuilder(false) }}
      />

      {/* ══════════ Chart Builder Panel ══════════ */}
      <ChartBuilderPanel
        open={showChartBuilder}
        onClose={() => { setShowChartBuilder(false); setChartEditorState(null) }}
        onInsert={(directive) => { insertAtCursor('\n' + directive + '\n'); setShowChartBuilder(false) }}
        onReplace={chartEditorState ? handleChartReplace : undefined}
        initialType={chartEditorState?.initialType}
        initialTitle={chartEditorState?.initialTitle}
        initialData={chartEditorState?.initialData}
      />

      {/* ══════════ Agent Edit Dialog ══════════ */}
      <AnimatePresence>
        {showAgentDialog && (
          <motion.div
            className="agent-dialog-overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={e => { if (e.target === e.currentTarget && !agentRunning) setShowAgentDialog(false) }}
          >
            <motion.div
              className="agent-dialog"
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.18 }}
            >
              <div className="agent-dialog__header">
                <Bot size={16} style={{ color: 'var(--accent-primary)' }} />
                <span>{t('workspace.agentEditHeader')}</span>
              </div>
              <p className="agent-dialog__hint">
                {t('workspace.agentHint')}
              </p>
              <textarea
                className="agent-dialog__textarea"
                placeholder={t('workspace.agentPlaceholder')}
                value={agentInstructions}
                onChange={e => setAgentInstructions(e.target.value)}
                rows={4}
                disabled={agentRunning}
              />
              {agentStatus && (
                <div className="agent-dialog__status">
                  {agentRunning && <Loader2 size={12} className="animate-spin" style={{ marginRight: 6 }} />}
                  {agentStatus}
                </div>
              )}
              <div className="agent-dialog__actions">
                <button
                  className="agent-dialog__cancel"
                  onClick={() => { setShowAgentDialog(false); setAgentStatus('') }}
                  disabled={agentRunning}
                >
                  {t('common.cancel')}
                </button>
                <button
                  className="agent-dialog__run"
                  onClick={launchAgentEdit}
                  disabled={agentRunning}
                >
                  {agentRunning
                    ? <><Loader2 size={13} className="animate-spin" /> {t('workspace.agentRunning')}</>
                    : <><Bot size={13} /> {t('workspace.agentLaunch')}</>
                  }
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════════ Add to Library ══════════ */}
      {showAddLibrary && (
        <LibraryDocModal
          mode="session"
          orgId={currentOrgId}
          sessionId={sessionId}
          taxonomy={libTaxonomy}
          doc={{ name: documentName || '' }}
          onClose={() => setShowAddLibrary(false)}
        />
      )}
    </div>
  )
}
