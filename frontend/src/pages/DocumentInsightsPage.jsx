/**
 * DocumentInsightsPage — Simple auto-analysis dashboard for non-technical users.
 *
 * After upload: automatically runs summary + risk + timeline + data extraction.
 * Shows results as human-readable cards, no AI jargon.
 *
 * Phases 3, 4, 8, 9 of the UX transformation.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import ComplianceReport from '../components/ComplianceReport'
import {
  FileText, AlertTriangle, Clock, Users, Building2,
  CheckCircle, ChevronDown, ChevronRight, MessageSquare,
  Loader2, RefreshCw, Eye, EyeOff, Zap, BookOpen, ShieldCheck,
  BarChart2, Download, Brain, Shield, Target, Calendar,
  Hash, DollarSign, MapPin, TrendingUp, Square, CheckSquare,
  Printer, Copy,
} from 'lucide-react'
import { apiCreateAgentTask, apiGetAgentTask, apiGetTasksBySession, apiExportInsightsPdf, apiExportGovBriefPdf } from '../lib/api/enterprise.js'
import { useToastStore } from '../shared/stores/toastStore'
import useOrgStore from '../shared/stores/orgStore'
import GovernmentBriefView, { ConfidenceBadge, ClassificationBadge } from './GovernmentBriefView.jsx'

// ── Constants ─────────────────────────────────────────────────────────────────

const CARD_STAGGER = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
}
const CARD_ITEM = {
  hidden:  { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 340, damping: 26 } },
}

// Which agent runs which card
const ANALYSIS_STEPS = [
  { id: 'summary',       icon: BookOpen,     color: 'var(--color-cyan-400)',   label: 'Краткое содержание' },
  { id: 'risk_engine',   icon: AlertTriangle, color: 'var(--color-amber-400)', label: 'Риски' },
  { id: 'timeline',      icon: Clock,        color: 'var(--color-violet-400)', label: 'Хронология' },
  { id: 'data_extractor',icon: Users,        color: 'var(--color-green-400)',  label: 'Люди и организации' },
  // Usually already populated by the automatic post-upload check
  // (backend: compliance_autocheck) and restored here from by-session.
  { id: 'compliance',    icon: ShieldCheck,  color: 'var(--color-rose-400)',   label: 'Соответствие НПА' },
]

// ── Insight Card ──────────────────────────────────────────────────────────────

function InsightCard({ icon: Icon, color, title, status, children, defaultOpen = false, onRetry }) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <motion.div variants={CARD_ITEM} className="surface-bento" style={{ padding: '18px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', gap: 10,
            background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
          }}
        >
          <div style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            background: `color-mix(in srgb, ${color} 15%, transparent)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {status === 'loading'
              ? <Loader2 size={16} style={{ color, animation: 'spin 1s linear infinite' }} />
              : status === 'done'
                ? <Icon size={16} style={{ color }} />
                : <Icon size={16} style={{ color: 'var(--text-faint)' }} />
            }
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{title}</div>
            {status === 'loading' && (
              <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>Анализируется…</div>
            )}
            {status === 'error' && (
              <div style={{ fontSize: 11, color: 'var(--status-danger)' }}>Не удалось проанализировать</div>
            )}
          </div>

          {status === 'done' && (
            open
              ? <ChevronDown size={14} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
              : <ChevronRight size={14} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
          )}
        </button>
        {status === 'error' && onRetry && (
          <button
            onClick={onRetry}
            title="Повторить анализ"
            style={{ padding: '4px 10px', borderRadius: 7, border: '1px solid var(--border-default)', background: 'var(--bg-surface-1)', cursor: 'pointer', fontSize: 11, color: 'var(--text-secondary)', flexShrink: 0 }}
          >
            <RefreshCw size={12} style={{ display: 'inline', marginRight: 4 }} />
            Повторить
          </button>
        )}
      </div>

      <AnimatePresence>
        {open && status === 'done' && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ paddingTop: 14, borderTop: '1px solid var(--border-subtle)', marginTop: 12 }}>
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ── Risk Badge ────────────────────────────────────────────────────────────────

function RiskScore({ score }) {
  const label = score >= 80 ? 'Критический' : score >= 60 ? 'Высокий' : score >= 35 ? 'Средний' : 'Низкий'
  const color = score >= 80 ? 'var(--status-danger)' : score >= 60 ? 'var(--color-amber-400)' : score >= 35 ? 'var(--color-amber-500)' : 'var(--status-success)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
      <div style={{
        fontSize: 32, fontWeight: 800, color,
        lineHeight: 1, letterSpacing: '-0.02em'
      }}>{score}</div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color }}>{label} риск</div>
        <div style={{ width: 120, height: 6, background: 'var(--bg-surface-2)', borderRadius: 3, marginTop: 4 }}>
          <div style={{ width: `${score}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.8s ease' }} />
        </div>
      </div>
    </div>
  )
}

// ── Simple Markdown renderer ──────────────────────────────────────────────────

function SimpleText({ text, maxChars = 600 }) {
  const [expanded, setExpanded] = useState(false)
  const short = text && text.length > maxChars && !expanded
  const display = short ? text.slice(0, maxChars) + '…' : text
  return (
    <div>
      <div style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{display || ''}</ReactMarkdown>
      </div>
      {short && (
        <button onClick={() => setExpanded(true)}
          style={{ fontSize: 12, color: 'var(--accent-primary)', background: 'none', border: 'none', cursor: 'pointer', marginTop: 6 }}>
          Показать полностью ↓
        </button>
      )}
    </div>
  )
}

// ── Manager View (Phase 8) ────────────────────────────────────────────────────

function ManagerView({ results, docName, onCopy, copied }) {
  const summary = results.summary?.short_summary || results.summary?.executive_summary || results.summary?.summary || ''
  const risks   = results.risk_engine?.top_risks?.slice(0, 3) || []
  const actions = results.summary?.action_items?.slice(0, 3) ||
                  results.risk_engine?.top_risks?.slice(0, 2).map(r => r.recommendation).filter(Boolean) || []
  const findings = results.summary?.key_findings?.slice(0, 3) || []
  const riskScore = results.risk_engine?.overall_risk_score

  return (
    <div style={{
      background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
      borderRadius: 16, padding: '24px 28px', backdropFilter: 'blur(18px)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <Zap size={16} style={{ color: 'var(--accent-primary)' }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-primary)', textTransform: 'uppercase', letterSpacing: '0.06em', flex: 1 }}>
          Режим руководителя · {docName}
        </span>
        {onCopy && (
          <button
            onClick={onCopy}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 7, border: '1px solid var(--border-default)', background: 'var(--bg-surface-1)', cursor: 'pointer', fontSize: 12, color: copied ? 'var(--status-success)' : 'var(--text-secondary)' }}
          >
            {copied ? <CheckCircle size={12} /> : <Download size={12} />}
            {copied ? 'Скопировано' : 'Скопировать доклад'}
          </button>
        )}
      </div>

      {/* Summary */}
      {summary && (
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--text-primary)', fontWeight: 500 }}>{summary}</p>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Key Findings */}
        {findings.length > 0 && (
          <div style={{ background: 'var(--bg-surface-1)', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
              Ключевые выводы
            </div>
            {findings.map((f, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, fontSize: 13 }}>
                <CheckCircle size={13} style={{ color: 'var(--status-success)', flexShrink: 0, marginTop: 2 }} />
                <span style={{ color: 'var(--text-secondary)' }}>{f}</span>
              </div>
            ))}
          </div>
        )}

        {/* Risks */}
        {riskScore !== undefined && (
          <div style={{ background: 'var(--bg-surface-1)', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
              Риски
            </div>
            <RiskScore score={riskScore} />
            {risks.slice(0, 2).map((r, i) => (
              <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, display: 'flex', gap: 6 }}>
                <AlertTriangle size={11} style={{ color: 'var(--color-amber-400)', flexShrink: 0, marginTop: 2 }} />
                {r.description}
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        {actions.length > 0 && (
          <div style={{ gridColumn: '1 / -1', background: `color-mix(in srgb, var(--accent-primary) 6%, var(--bg-surface-1))`, borderRadius: 10, padding: '14px 16px', border: '1px solid color-mix(in srgb, var(--accent-primary) 20%, transparent)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-primary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
              Рекомендуемые действия
            </div>
            {actions.map((a, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, fontSize: 13 }}>
                <span style={{ color: 'var(--accent-primary)', fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span>
                <span style={{ color: 'var(--text-primary)' }}>{a}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function DocumentInsightsPage({ sessionId, documentName }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const addToast = useToastStore(s => s.addToast)

  const orgName    = useOrgStore(s => s.currentOrgName)
  const orgId      = useOrgStore(s => s.currentOrgId)
  const orgPlan    = useOrgStore(s => s.currentOrgPlan)
  const orgsLoaded = useOrgStore(s => s.orgsLoaded)
  const isGovPlan  = orgPlan === 'gov'

  const [stepStatus, setStepStatus] = useState({}) // id → 'idle'|'loading'|'done'|'error'
  const [results,    setResults]    = useState({})  // id → output_data
  const [started,    setStarted]    = useState(false) // analysis runs only on explicit user action
  const [managerMode, setManagerMode] = useState(true)
  const [allDone,    setAllDone]    = useState(false)
  const [copied,     setCopied]     = useState(false)
  const [exporting,  setExporting]  = useState(false)
  const pollRefs = useRef({})

  // Gov plan state
  const [briefResult,          setBriefResult]          = useState(null)
  const [briefStatus,          setBriefStatus]          = useState('idle') // 'idle'|'loading'|'done'|'error'
  const [briefPhase,           setBriefPhase]           = useState('')
  const [classificationLevel,  setClassificationLevel]  = useState('ДСП')
  const briefPollRef = useRef(null)

  // Poll an agent task until done
  const pollTask = useCallback((stepId, taskId) => {
    const interval = setInterval(async () => {
      try {
        const task = await apiGetAgentTask(taskId)
        if (task.status === 'done') {
          clearInterval(interval)
          setStepStatus(s => ({ ...s, [stepId]: 'done' }))
          setResults(r => ({ ...r, [stepId]: task.output_data }))
        } else if (task.status === 'failed' || task.status === 'cancelled') {
          clearInterval(interval)
          setStepStatus(s => ({ ...s, [stepId]: 'error' }))
        }
      } catch {
        clearInterval(interval)
        setStepStatus(s => ({ ...s, [stepId]: 'error' }))
        addToast('error', 'Анализ не удался. Проверьте соединение с сервером.')
      }
    }, 2000)
    pollRefs.current[stepId] = interval
  }, [addToast])

  // ── Gov plan: poll a single government_briefing task ──────────────────────

  const pollBrief = useCallback((taskId) => {
    const iv = setInterval(async () => {
      try {
        const task = await apiGetAgentTask(taskId)
        if (task.steps?.length) {
          const last = task.steps[task.steps.length - 1]
          if (last.detail) setBriefPhase(last.detail)
        }
        if (task.status === 'done') {
          clearInterval(iv)
          setBriefStatus('done')
          setBriefResult(task.output_data)
          setAllDone(true)
        } else if (task.status === 'failed' || task.status === 'cancelled') {
          clearInterval(iv)
          setBriefStatus('error')
          addToast('error', 'Не удалось подготовить сводку. Попробуйте ещё раз.')
        }
      } catch {
        clearInterval(iv)
        setBriefStatus('error')
      }
    }, 2000)
    briefPollRef.current = iv
  }, [addToast])

  const runBriefing = useCallback(async () => {
    if (!sessionId) return
    if (briefPollRef.current) clearInterval(briefPollRef.current)
    setBriefStatus('loading')
    setBriefResult(null)
    setBriefPhase('Запуск оперативной сводки…')
    setAllDone(false)
    const lang = localStorage.getItem('kence_lang') || 'ru'
    try {
      const task = await apiCreateAgentTask({
        task_type: 'government_briefing',
        session_id: sessionId,
        org_id: orgId,
        language: lang,
      })
      pollBrief(task.task_id)
    } catch {
      setBriefStatus('error')
      addToast('error', 'Не удалось запустить анализ. Проверьте соединение с сервером.')
    }
  }, [sessionId, orgId, pollBrief, addToast])

  // Launch all analysis tasks
  const runAnalysis = useCallback(async () => {
    if (!sessionId) return
    setAllDone(false)

    const agentMap = {
      summary:        { task_type: 'summary' },
      risk_engine:    { task_type: 'risk_engine' },
      timeline:       { task_type: 'timeline' },
      data_extractor: { task_type: 'data_extractor' },
      // Must stay in sync with ANALYSIS_STEPS — the reset below marks every
      // step 'loading', so an undispatched step would spin forever.
      compliance:     { task_type: 'compliance' },
    }

    // Reset
    const idle = Object.fromEntries(ANALYSIS_STEPS.map(s => [s.id, 'loading']))
    setStepStatus(idle)
    setResults({})

    const lang = localStorage.getItem('kence_lang') || 'ru'
    for (const [stepId, payload] of Object.entries(agentMap)) {
      try {
        const task = await apiCreateAgentTask({ ...payload, session_id: sessionId, org_id: orgId, language: lang })
        pollTask(stepId, task.task_id)
      } catch {
        setStepStatus(s => ({ ...s, [stepId]: 'error' }))
      }
    }
  }, [sessionId, orgId, pollTask])

  const AGENT_MAP = {
    summary:        { task_type: 'summary' },
    risk_engine:    { task_type: 'risk_engine' },
    timeline:       { task_type: 'timeline' },
    data_extractor: { task_type: 'data_extractor' },
    compliance:     { task_type: 'compliance' },
  }

  const runSingleAnalysis = useCallback(async (stepId) => {
    if (pollRefs.current[stepId]) clearInterval(pollRefs.current[stepId])
    setStepStatus(s => ({ ...s, [stepId]: 'loading' }))
    setResults(r => { const n = { ...r }; delete n[stepId]; return n })
    const lang = localStorage.getItem('kence_lang') || 'ru'
    try {
      const task = await apiCreateAgentTask({ ...AGENT_MAP[stepId], session_id: sessionId, org_id: orgId, language: lang })
      pollTask(stepId, task.task_id)
    } catch {
      setStepStatus(s => ({ ...s, [stepId]: 'error' }))
      addToast('error', 'Не удалось запустить анализ. Проверьте соединение с сервером.')
    }
  }, [sessionId, orgId, pollTask, addToast])

  // Analysis is launched ONLY by explicit user action (see the start screen below),
  // never automatically on mount — so opening a document doesn't kick off agents.
  // This effect just tears down any in-flight polls when the page unmounts.
  useEffect(() => {
    return () => {
      Object.values(pollRefs.current).forEach(clearInterval)
      if (briefPollRef.current) clearInterval(briefPollRef.current)
    }
  }, [])

  // Restore a previous analysis after a browser refresh. Results are persisted
  // server-side in agent_tasks (output_data); we fetch the latest task per type
  // for this session and rehydrate the UI — showing finished results, marking
  // failures, and resuming polling for anything still running — instead of
  // dropping the user back on the "Начать анализ" screen. Runs once per session.
  const restoredRef = useRef(null)
  useEffect(() => {
    if (!sessionId || !orgsLoaded) return
    if (restoredRef.current === sessionId) return
    restoredRef.current = sessionId
    let cancelled = false
    ;(async () => {
      try {
        const bySession = await apiGetTasksBySession(sessionId)
        if (cancelled || !bySession || Object.keys(bySession).length === 0) return

        if (isGovPlan) {
          const task = bySession.government_briefing
          if (!task) return
          setStarted(true)
          if (task.status === 'done') {
            setBriefStatus('done'); setBriefResult(task.output_data); setAllDone(true)
          } else if (task.status === 'failed' || task.status === 'cancelled') {
            setBriefStatus('error')
          } else {
            setBriefStatus('loading')
            const last = task.steps?.[task.steps.length - 1]
            if (last?.detail) setBriefPhase(last.detail)
            pollBrief(task.id)
          }
          return
        }

        // Standard plan: restore each analysis card.
        const restoredStatus = {}
        const restoredResults = {}
        let any = false
        for (const step of ANALYSIS_STEPS) {
          const task = bySession[step.id]
          if (!task) continue
          any = true
          if (task.status === 'done') {
            restoredStatus[step.id] = 'done'
            restoredResults[step.id] = task.output_data
          } else if (task.status === 'failed' || task.status === 'cancelled') {
            restoredStatus[step.id] = 'error'
          } else {
            restoredStatus[step.id] = 'loading'
            pollTask(step.id, task.id)
          }
        }
        if (any) {
          setStarted(true)
          setStepStatus(s => ({ ...s, ...restoredStatus }))
          setResults(r => ({ ...r, ...restoredResults }))
        }
      } catch { /* no saved analysis — fall through to the start screen */ }
    })()
    return () => { cancelled = true }
  }, [sessionId, orgsLoaded, isGovPlan, pollTask, pollBrief])

  // User-triggered launch: choose pipeline by org plan, then dispatch.
  const startAnalysis = useCallback(() => {
    if (!sessionId) return
    setStarted(true)
    if (isGovPlan) runBriefing()
    else runAnalysis()
  }, [sessionId, isGovPlan, runBriefing, runAnalysis])

  // Detect all done
  useEffect(() => {
    const statuses = Object.values(stepStatus)
    if (statuses.length > 0 && statuses.every(s => s === 'done' || s === 'error')) {
      setAllDone(true)
    }
  }, [stepStatus])

  if (!sessionId) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 16 }}>
        <FileText size={40} style={{ opacity: 0.2 }} />
        <p style={{ color: 'var(--text-secondary)', fontSize: 15 }}>Сначала загрузите документ</p>
        <button
          onClick={() => navigate('/upload')}
          style={{ padding: '10px 24px', background: 'var(--gradient-accent)', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 600, color: 'var(--color-neutral-950)' }}
        >
          Загрузить документ
        </button>
      </div>
    )
  }

  if (!orgsLoaded) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <p style={{ color: 'var(--text-faint)', fontSize: 14 }}>Загрузка профиля организации…</p>
      </div>
    )
  }

  // Until the user explicitly starts it, show a launch screen instead of
  // auto-running the analysis agents.
  if (!started) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 18, textAlign: 'center', padding: '0 1rem' }}>
        <FileText size={40} style={{ opacity: 0.25 }} />
        <div>
          <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>
            {documentName || 'Документ'}
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: '8px 0 0', maxWidth: 460 }}>
            {isGovPlan
              ? 'Готов подготовить оперативную сводку по документу. Запуск — по вашей команде.'
              : 'Готов проанализировать документ (резюме, риски, хронология, данные). Анализ запускается только по вашей команде.'}
          </p>
        </div>
        <button
          onClick={startAnalysis}
          style={{ padding: '12px 28px', background: 'var(--gradient-accent)', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 700, color: 'var(--color-neutral-950)' }}
        >
          {isGovPlan ? 'Подготовить сводку' : 'Начать анализ'}
        </button>
      </div>
    )
  }

  const summaryData    = results.summary || {}
  const riskData       = results.risk_engine || {}
  const timelineData   = results.timeline || {}
  const extractorData  = results.data_extractor || {}
  const entities       = extractorData.extracted?.key_entities || {}

  return (
    <div style={{ padding: 'clamp(1rem, 4vw, 2rem)', maxWidth: 900, margin: '0 auto' }}>

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}
      >
        <div>
          <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>
            {documentName || 'Документ'}
          </h1>
          <p style={{ fontSize: 13, color: allDone ? 'var(--status-success)' : 'var(--text-secondary)', margin: '4px 0 0', display: 'flex', alignItems: 'center', gap: 6 }}>
            {allDone && <CheckCircle size={13} style={{ color: 'var(--status-success)' }} />}
            {isGovPlan
              ? (briefStatus === 'done'  ? 'Сводка готова'
                : briefStatus === 'error' ? 'Ошибка подготовки сводки'
                : briefPhase || 'Подготовка оперативной сводки…')
              : (allDone ? 'Анализ завершён — результаты готовы' : 'Анализируется…')
            }
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Classification picker — gov plan only */}
          {isGovPlan && (
            <select
              value={classificationLevel}
              onChange={e => setClassificationLevel(e.target.value)}
              style={{
                padding: '7px 10px', borderRadius: 9, fontSize: 12, fontWeight: 700,
                border: `1px solid ${
                  classificationLevel === 'СЕКРЕТНО' ? 'var(--color-violet-400)' :
                  classificationLevel === 'КОНФИДЕНЦИАЛЬНО' ? '#ef4444' :
                  classificationLevel === 'ДСП' ? '#f59e0b' :
                  classificationLevel === 'ВНУТРЕННЕЕ' ? '#3b82f6' :
                  'var(--status-success)'
                }`,
                background: 'var(--bg-surface-1)',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                letterSpacing: '0.04em',
              }}
              title="Гриф секретности документа"
            >
              <option value="ОТКРЫТО">ОТКРЫТО</option>
              <option value="ВНУТРЕННЕЕ">ВНУТРЕННЕЕ</option>
              <option value="ДСП">ДСП</option>
              <option value="КОНФИДЕНЦИАЛЬНО">КОНФИДЕНЦИАЛЬНО</option>
              <option value="СЕКРЕТНО">СЕКРЕТНО</option>
            </select>
          )}

          {/* Manager Mode toggle — standard plan only */}
          {!isGovPlan && (
            <button
              onClick={() => setManagerMode(m => !m)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', borderRadius: 9,
                border: `1px solid ${managerMode ? 'var(--accent-primary)' : 'var(--border-default)'}`,
                background: managerMode ? 'color-mix(in srgb, var(--accent-primary) 10%, transparent)' : 'var(--bg-surface-1)',
                cursor: 'pointer', fontSize: 13, fontWeight: 500,
                color: managerMode ? 'var(--accent-primary)' : 'var(--text-primary)',
              }}
            >
              <Zap size={13} /> Режим руководителя
            </button>
          )}

          {/* Ask questions */}
          <button
            onClick={() => navigate('/workspace')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 9,
              border: 'none', background: 'var(--gradient-accent)',
              cursor: 'pointer', fontSize: 13, fontWeight: 600,
              color: 'var(--color-neutral-950)',
            }}
          >
            <MessageSquare size={13} /> Задать вопрос
          </button>

          {/* Export PDF — standard plan */}
          {!isGovPlan && (results.summary || results.risk_engine) && (
            <button
              onClick={async () => {
                setExporting(true)
                try {
                  const blob = await apiExportInsightsPdf(documentName || 'Документ', results, orgName)
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `KENCE_Brief_${(documentName || 'doc').replace(/\s+/g, '_').slice(0, 40)}.pdf`
                  a.click()
                  URL.revokeObjectURL(url)
                } catch {
                  addToast('error', 'Не удалось создать PDF. Попробуйте ещё раз.')
                } finally {
                  setExporting(false)
                }
              }}
              disabled={exporting}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', borderRadius: 9,
                border: '1px solid var(--border-default)',
                background: 'var(--bg-surface-1)',
                cursor: exporting ? 'not-allowed' : 'pointer',
                fontSize: 13, fontWeight: 500,
                color: 'var(--text-primary)',
                opacity: exporting ? 0.6 : 1,
              }}
            >
              {exporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
              {exporting ? 'Создаётся…' : 'Скачать PDF'}
            </button>
          )}

          {/* Export PDF — government plan */}
          {isGovPlan && briefStatus === 'done' && briefResult && (
            <button
              onClick={async () => {
                setExporting(true)
                try {
                  const blob = await apiExportGovBriefPdf(
                    documentName || 'Документ',
                    briefResult,
                    orgName,
                    classificationLevel,
                  )
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `KENCE_Gov_Brief_${(documentName || 'doc').replace(/\s+/g, '_').slice(0, 40)}.pdf`
                  a.click()
                  URL.revokeObjectURL(url)
                } catch {
                  addToast('error', 'Не удалось создать PDF. Попробуйте ещё раз.')
                } finally {
                  setExporting(false)
                }
              }}
              disabled={exporting}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', borderRadius: 9,
                border: '1px solid var(--border-default)',
                background: 'var(--bg-surface-1)',
                cursor: exporting ? 'not-allowed' : 'pointer',
                fontSize: 13, fontWeight: 500,
                color: 'var(--text-primary)',
                opacity: exporting ? 0.6 : 1,
              }}
            >
              {exporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
              {exporting ? 'Создаётся…' : 'Скачать сводку'}
            </button>
          )}

          {/* Retry — routes to correct runner by plan */}
          {(allDone || (isGovPlan && briefStatus === 'error')) && (
            <button
              onClick={isGovPlan ? runBriefing : runAnalysis}
              style={{ padding: '8px 10px', borderRadius: 9, border: '1px solid var(--border-default)', background: 'var(--bg-surface-1)', cursor: 'pointer', color: 'var(--text-secondary)' }}
              title="Повторить анализ"
            >
              <RefreshCw size={13} />
            </button>
          )}
        </div>
      </motion.div>

      {/* Manager Mode — standard plan only */}
      <AnimatePresence>
        {!isGovPlan && managerMode && (results.summary || results.risk_engine) && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            style={{ marginBottom: 24 }}
          >
            <ManagerView results={results} docName={documentName || 'Документ'} onCopy={() => {
              const s = results.summary || {}
              const r = results.risk_engine || {}
              const summary = s.short_summary || s.executive_summary || s.summary || ''
              const findings = s.key_findings?.slice(0, 3) || []
              const actions  = s.action_items?.slice(0, 3) || r.top_risks?.slice(0, 2).map(x => x.recommendation).filter(Boolean) || []
              const riskScore = r.overall_risk_score
              const risks    = r.top_risks?.slice(0, 3) || []
              const lines = [
                documentName || 'Документ',
                '',
                summary && `РЕЗЮМЕ:\n${summary}`,
                findings.length > 0 && `\nКЛЮЧЕВЫЕ ВЫВОДЫ:\n${findings.map((f, i) => `${i + 1}. ${f}`).join('\n')}`,
                riskScore !== undefined && `\nОЦЕНКА РИСКА: ${riskScore}/100`,
                risks.length > 0 && `\nОСНОВНЫЕ РИСКИ:\n${risks.map(r => `• ${r.description}`).join('\n')}`,
                actions.length > 0 && `\nРЕКОМЕНДАЦИИ:\n${actions.map((a, i) => `${i + 1}. ${a}`).join('\n')}`,
              ].filter(Boolean).join('\n')
              navigator.clipboard.writeText(lines).then(() => setCopied(true)).catch(() => {})
              setTimeout(() => setCopied(false), 2000)
            }} copied={copied} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Gov plan: Government Briefing View ────────────────────────────── */}
      {isGovPlan && (
        briefStatus === 'loading' ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="surface-bento"
            style={{ padding: '28px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
            <Loader2 size={20} style={{ color: 'var(--accent-primary)', animation: 'spin 1s linear infinite', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Подготовка оперативной сводки</div>
              <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 3 }}>{briefPhase || 'Инициализация…'}</div>
            </div>
          </motion.div>
        ) : briefStatus === 'error' ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="surface-bento"
            style={{ padding: '32px 24px', textAlign: 'center' }}>
            <AlertTriangle size={32} style={{ color: 'var(--status-danger)', margin: '0 auto 12px', display: 'block' }} />
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 18 }}>
              Не удалось подготовить сводку. Проверьте соединение с сервером и попробуйте ещё раз.
            </p>
            <button onClick={runBriefing} style={{
              padding: '9px 22px', background: 'var(--gradient-accent)',
              border: 'none', borderRadius: 9, cursor: 'pointer',
              fontSize: 13, fontWeight: 600, color: 'var(--color-neutral-950)',
            }}>
              <RefreshCw size={13} style={{ display: 'inline', marginRight: 6 }} />
              Повторить
            </button>
          </motion.div>
        ) : briefResult ? (
          <GovernmentBriefView brief={briefResult} classification={classificationLevel} />
        ) : null
      )}

      {/* ── Standard plan: existing InsightCards ───────────────────────────── */}
      {!isGovPlan && (
      <motion.div
        variants={CARD_STAGGER}
        initial="hidden"
        animate="visible"
        style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
      >

        {/* 1. Summary */}
        <InsightCard
          icon={BookOpen}
          color="var(--color-cyan-400)"
          title="Краткое содержание"
          status={stepStatus.summary || 'idle'}
          defaultOpen={true}
          onRetry={() => runSingleAnalysis('summary')}
        >
          {summaryData.executive_summary && (
            <div style={{ marginBottom: 12, padding: '10px 14px', background: `color-mix(in srgb, var(--color-cyan-400) 8%, var(--bg-surface-2))`, borderRadius: 8, borderLeft: '3px solid var(--color-cyan-400)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-cyan-400)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Главное</div>
              <p style={{ fontSize: 13, lineHeight: 1.6, margin: 0, color: 'var(--text-primary)' }}>{summaryData.executive_summary}</p>
            </div>
          )}
          {summaryData.key_findings?.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Ключевые выводы</div>
              {summaryData.key_findings.slice(0, 5).map((f, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, fontSize: 13 }}>
                  <CheckCircle size={13} style={{ color: 'var(--status-success)', flexShrink: 0, marginTop: 2 }} />
                  <span style={{ color: 'var(--text-secondary)' }}>{f}</span>
                </div>
              ))}
            </div>
          )}
          {summaryData.action_items?.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Что нужно сделать</div>
              {summaryData.action_items.slice(0, 4).map((a, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, fontSize: 13 }}>
                  <span style={{ color: 'var(--accent-primary)', fontWeight: 700, flexShrink: 0, minWidth: 16 }}>{i + 1}.</span>
                  <span style={{ color: 'var(--text-primary)' }}>{a}</span>
                </div>
              ))}
            </div>
          )}
          {!summaryData.key_findings && summaryData.summary && (
            <SimpleText text={summaryData.summary} />
          )}
        </InsightCard>

        {/* 2. Risks */}
        <InsightCard
          icon={AlertTriangle}
          color="var(--color-amber-400)"
          title="Риски"
          status={stepStatus.risk_engine || 'idle'}
          onRetry={() => runSingleAnalysis('risk_engine')}
        >
          {riskData.overall_risk_score !== undefined && (
            <RiskScore score={riskData.overall_risk_score} />
          )}
          {riskData.top_risks?.slice(0, 5).map((r, i) => (
            <div key={i} style={{ marginBottom: 12, padding: '10px 14px', background: 'var(--bg-surface-2)', borderRadius: 8, borderLeft: `3px solid ${r.severity === 'critical' || r.severity === 'high' ? 'var(--status-danger)' : 'var(--color-amber-400)'}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: r.severity === 'critical' || r.severity === 'high' ? 'var(--status-danger)' : 'var(--color-amber-400)', textTransform: 'uppercase' }}>
                  {r.severity === 'critical' ? 'Критический' : r.severity === 'high' ? 'Высокий' : r.severity === 'medium' ? 'Средний' : 'Низкий'}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>·</span>
                <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                  {r.category === 'financial' ? 'Финансовый' : r.category === 'legal' ? 'Юридический' : r.category === 'compliance' ? 'Соответствие' : r.category === 'operational' ? 'Операционный' : 'Репутационный'}
                </span>
              </div>
              <p style={{ fontSize: 13, color: 'var(--text-primary)', margin: '0 0 6px' }}>{r.description}</p>
              {r.recommendation && (
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>💡 {r.recommendation}</p>
              )}
            </div>
          ))}
        </InsightCard>

        {/* 3. Timeline */}
        <InsightCard
          icon={Clock}
          color="var(--color-violet-400)"
          title="Хронология событий"
          status={stepStatus.timeline || 'idle'}
          onRetry={() => runSingleAnalysis('timeline')}
        >
          {timelineData.timeline?.slice(0, 10).map((e, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 12, alignItems: 'flex-start' }}>
              <div style={{ flexShrink: 0, marginTop: 2 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-violet-400)', marginTop: 4 }} />
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-violet-400)', marginBottom: 2 }}>{e.date}</div>
                <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{e.event}</div>
                {e.evidence && <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2, fontStyle: 'italic' }}>«{e.evidence}»</div>}
              </div>
            </div>
          ))}
          {timelineData.total_events > 10 && (
            <p style={{ fontSize: 12, color: 'var(--text-faint)', textAlign: 'center' }}>и ещё {timelineData.total_events - 10} событий…</p>
          )}
        </InsightCard>

        {/* 4. People & Organizations */}
        <InsightCard
          icon={Users}
          color="var(--color-green-400)"
          title="Люди и организации"
          status={stepStatus.data_extractor || 'idle'}
          onRetry={() => runSingleAnalysis('data_extractor')}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {entities.persons?.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                  <Users size={10} style={{ marginRight: 4 }} />Люди
                </div>
                {entities.persons.slice(0, 6).map((p, i) => (
                  <div key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4, display: 'flex', gap: 6 }}>
                    <span style={{ color: 'var(--color-green-400)', fontWeight: 700 }}>·</span>{p}
                  </div>
                ))}
              </div>
            )}
            {entities.organizations?.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                  <Building2 size={10} style={{ marginRight: 4 }} />Организации
                </div>
                {entities.organizations.slice(0, 6).map((o, i) => (
                  <div key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4, display: 'flex', gap: 6 }}>
                    <span style={{ color: 'var(--color-green-400)', fontWeight: 700 }}>·</span>{o}
                  </div>
                ))}
              </div>
            )}
          </div>
          {extractorData.stats && (
            <div style={{ display: 'flex', gap: 16, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-subtle)', flexWrap: 'wrap' }}>
              {[
                ['Фактов', extractorData.stats.facts],
                ['Числовых данных', extractorData.stats.numerical_data],
                ['Выводов', extractorData.stats.conclusions],
              ].filter(([, v]) => v > 0).map(([label, val]) => (
                <div key={label} style={{ fontSize: 12, color: 'var(--text-faint)' }}>
                  <strong style={{ color: 'var(--text-primary)', fontSize: 16, fontWeight: 700 }}>{val}</strong> {label}
                </div>
              ))}
            </div>
          )}
        </InsightCard>

        {/* Соответствие НПА — normally already run automatically on upload. */}
        <InsightCard
          icon={ShieldCheck}
          color="var(--color-rose-400)"
          title="Соответствие НПА"
          status={stepStatus.compliance || 'idle'}
          onRetry={() => runSingleAnalysis('compliance')}
        >
          {results.compliance?.findings?.length
            ? <ComplianceReport result={results.compliance} />
            : (
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Проверка не проводилась — в библиотеке организации нет документов
                с типом «НПА». Добавьте НПА в библиотеку, затем нажмите обновить.
              </div>
            )}
        </InsightCard>

      </motion.div>
      )} {/* end !isGovPlan */}

      {/* Bottom CTA */}
      {allDone && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          style={{ marginTop: 24, display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}
        >
          <button
            onClick={() => navigate('/workspace')}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '11px 22px', background: 'var(--gradient-accent)', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 600, color: 'var(--color-neutral-950)', boxShadow: '0 2px 12px color-mix(in srgb, var(--accent-primary) 30%, transparent)' }}
          >
            <MessageSquare size={15} /> Задать вопрос по документу
          </button>
          <button
            onClick={() => navigate('/compare')}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '11px 22px', background: 'var(--bg-surface-1)', border: '1px solid var(--border-default)', borderRadius: 10, cursor: 'pointer', fontSize: 14, color: 'var(--text-primary)' }}
          >
            Сравнить с другим документом
          </button>
        </motion.div>
      )}
    </div>
  )
}
