import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  ChevronRight, Sparkles, FileText, Zap,
  Languages, RefreshCw, Presentation, MessageSquare,
  Hash, Clock, HardDrive, Copy, Check,
} from 'lucide-react'
import { useShellStore } from '@/shared/stores/shellStore'
import { useWorkspaceStore } from '@/shared/stores/workspaceStore'
import { apiGetChatHistory, apiClearChatHistory, apiGetDocumentContent, copyToClipboard } from '@/lib/api'

function formatBytes(n) {
  if (!n) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1048576).toFixed(1)} MB`
}

function formatRelTime(iso) {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  const h = Math.floor(diff / 3600000)
  const d = Math.floor(diff / 86400000)
  if (d >= 1) return `${d}д назад`
  if (h >= 1) return `${h}ч назад`
  if (m >= 1) return `${m}мин назад`
  return 'только что'
}

function CopyableId({ id }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="copyable-id-btn"
      onClick={() => { copyToClipboard(id); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
      title={id}
    >
      {copied ? <Check size={11} /> : <Copy size={11} />}
      <span>{id.slice(0, 8)}…</span>
    </button>
  )
}

function HistoryTab({ sessionId }) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)

  const load = () => {
    if (!sessionId) { setMessages([]); return }
    setLoading(true)
    apiGetChatHistory(sessionId, 20)
      .then((d) => setMessages(d?.messages || []))
      .catch(() => setMessages([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [sessionId])

  const handleClear = async () => {
    await apiClearChatHistory(sessionId).catch(() => {})
    setMessages([])
  }

  if (!sessionId) {
    return <div className="history-tab__empty">Откройте сессию с документом</div>
  }
  if (loading) {
    return <div className="right-panel__loading"><div className="right-panel__skeleton" /><div className="right-panel__skeleton right-panel__skeleton--short" /></div>
  }
  if (messages.length === 0) {
    return <div className="history-tab__empty">История пуста</div>
  }

  return (
    <div>
      <div className="history-tab__bubbles">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`history-tab__bubble history-tab__bubble--${m.role === 'user' ? 'user' : 'bot'}`}
          >
            {m.content.length > 80 ? m.content.slice(0, 80) + '…' : m.content}
          </div>
        ))}
      </div>
      <button className="history-tab__clear" onClick={handleClear}>Очистить историю</button>
    </div>
  )
}

function DocTab({ sessionId, documentName }) {
  const [meta, setMeta] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!sessionId) { setMeta(null); return }
    setLoading(true)
    apiGetDocumentContent(sessionId)
      .then((data) => data && setMeta(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [sessionId])

  if (!sessionId) {
    return (
      <div className="right-panel__empty">
        <span className="right-panel__empty-icon" aria-hidden="true"><Sparkles size={28} /></span>
        <p className="right-panel__empty-title">Нет документа</p>
        <p className="right-panel__empty-desc">Загрузите документ чтобы увидеть информацию</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="right-panel__loading">
        <div className="right-panel__skeleton" />
        <div className="right-panel__skeleton right-panel__skeleton--short" />
        <div className="right-panel__skeleton" />
      </div>
    )
  }

  const ext = documentName ? documentName.split('.').pop().toUpperCase() : '—'

  return (
    <div className="right-panel__doc-info">
      <div className="right-panel__doc-name" title={documentName}>
        <FileText size={14} />
        <span>{documentName || 'Untitled'}</span>
      </div>

      <div className="right-panel__meta-grid">
        <div className="right-panel__meta-item">
          <span className="right-panel__meta-label"><HardDrive size={11} /> Формат</span>
          <span className="right-panel__meta-value">{ext}</span>
        </div>
        <div className="right-panel__meta-item">
          <span className="right-panel__meta-label"><Hash size={11} /> Символов</span>
          <span className="right-panel__meta-value">
            {meta?.char_count ? meta.char_count.toLocaleString('ru-RU') : '—'}
          </span>
        </div>
        <div className="right-panel__meta-item">
          <span className="right-panel__meta-label"><Clock size={11} /> Сессия</span>
          <span className="right-panel__meta-value">
            {sessionId ? <CopyableId id={sessionId} /> : '—'}
          </span>
        </div>
      </div>

      {meta?.markdown && (
        <div className="right-panel__preview">
          <p className="right-panel__preview-label">Превью</p>
          <p className="right-panel__preview-text">
            {meta.markdown.slice(0, 280).trim()}
            {meta.markdown.length > 280 ? '…' : ''}
          </p>
        </div>
      )}
    </div>
  )
}

function ActionsTab({ sessionId }) {
  const navigate = useNavigate()

  const actions = [
    {
      icon: MessageSquare,
      label: 'Открыть чат',
      desc: 'Задавайте вопросы по документу',
      path: '/workspace',
      disabled: !sessionId,
    },
    {
      icon: Languages,
      label: 'Перевести',
      desc: 'Казахский / Русский / Английский',
      path: '/workspace',
      disabled: !sessionId,
    },
    {
      icon: RefreshCw,
      label: 'Конвертировать',
      desc: 'TXT, MD, DOCX, PDF',
      path: '/convert',
      disabled: !sessionId,
    },
    {
      icon: Presentation,
      label: 'Презентация',
      desc: 'Сгенерировать PPTX',
      path: '/presentation',
      disabled: !sessionId,
    },
  ]

  return (
    <div className="right-panel__actions">
      {!sessionId && (
        <p className="right-panel__actions-hint">Загрузите документ для доступа к действиям</p>
      )}
      {actions.map(({ icon: Icon, label, desc, path, disabled }) => (
        <button
          key={label}
          type="button"
          className={`right-panel__action-btn${disabled ? ' right-panel__action-btn--disabled' : ''}`}
          onClick={() => !disabled && navigate(path)}
          disabled={disabled}
        >
          <span className="right-panel__action-icon"><Icon size={15} /></span>
          <span className="right-panel__action-text">
            <span className="right-panel__action-label">{label}</span>
            <span className="right-panel__action-desc">{desc}</span>
          </span>
          <Zap size={11} className="right-panel__action-arrow" />
        </button>
      ))}
    </div>
  )
}

const TABS = [
  { id: 'doc',     label: 'Документ' },
  { id: 'actions', label: 'Действия' },
  { id: 'history', label: 'История'  },
]

export default function RightIntelligencePanel() {
  const open             = useShellStore((s) => s.rightPanelShell.open)
  const setRightPanelOpen = useShellStore((s) => s.setRightPanelOpen)
  const sessionId        = useWorkspaceStore((s) => s.activeSessionId)
  const documentName     = useWorkspaceStore((s) => s.activeDocumentName)

  const [activeTab, setActiveTab] = useState('doc')
  const [historyCount, setHistoryCount] = useState(0)

  useEffect(() => {
    if (!sessionId) { setHistoryCount(0); return }
    apiGetChatHistory(sessionId, 20)
      .then((d) => setHistoryCount((d?.messages || []).length))
      .catch(() => setHistoryCount(0))
  }, [sessionId])

  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.aside
          className="right-intelligence-panel"
          aria-label="Intelligence panel"
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 272, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          style={{ overflow: 'hidden', flexShrink: 0 }}
        >
          <div className="right-panel__inner">
            {/* Header */}
            <div className="right-panel__header">
              <span className="right-panel__title">
                <Sparkles size={13} style={{ opacity: 0.7 }} />
                Intelligence
              </span>
              <button
                type="button"
                className="right-panel__close-btn"
                aria-label="Close intelligence panel"
                onClick={() => setRightPanelOpen(false)}
              >
                <ChevronRight size={16} />
              </button>
            </div>

            {/* Tab switcher */}
            <div className="right-panel__tabs" role="tablist">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  role="tab"
                  type="button"
                  aria-selected={activeTab === tab.id}
                  className={`right-panel__tab${activeTab === tab.id ? ' right-panel__tab--active' : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                  {tab.id === 'history' && historyCount > 0 && (
                    <span className="right-panel__tab-badge">{historyCount}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="right-panel__body" role="tabpanel">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15 }}
                >
                  {activeTab === 'doc' && (
                    <DocTab sessionId={sessionId} documentName={documentName} />
                  )}
                  {activeTab === 'actions' && (
                    <ActionsTab sessionId={sessionId} />
                  )}
                  {activeTab === 'history' && (
                    <HistoryTab sessionId={sessionId} />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
