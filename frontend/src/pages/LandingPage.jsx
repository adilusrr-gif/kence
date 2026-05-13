import React from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Bell, Search, ArrowRight, FileText, MessageSquare,
  Languages, BarChart2, GitCompare, RefreshCw, CheckCircle,
  Zap, Shield, Database, ChevronRight, Upload,
  Scale, LayoutTemplate, ArrowLeftRight, Activity, Cpu, Lock,
} from 'lucide-react'
import { useAuthStore } from '@/shared/stores'
import { useWorkspaceStore, selectActiveDocumentName, selectActiveSessionId } from '@/shared/stores'

const FEATURES = [
  { Icon: MessageSquare, label: 'RAG-чат по документу',  desc: '50+ форматов, точный поиск по тексту',    path: '/chat' },
  { Icon: Languages,     label: 'Перевод KZ / RU / EN',  desc: 'Мгновенный перевод через локальный LLM',  path: '/chat' },
  { Icon: Scale,         label: 'Сравнение документов',  desc: 'Смысловой и технический diff',            path: '/compare' },
  { Icon: LayoutTemplate, label: 'Генерация презентации', desc: 'Автоматически в формат PPTX',            path: '/presentation' },
  { Icon: ArrowLeftRight, label: 'Конвертация форматов', desc: 'PDF → TXT, Markdown, DOCX',              path: '/convert' },
]

const METRICS = [
  { label: 'Форматов',        value: '50+',  sub: 'поддерживается',    colorClass: 'dash-metric-value--blue',   bg: 'rgba(30,58,110,0.18)' },
  { label: 'Скорость ответа', value: '~2с',  sub: 'локальный LLM',     colorClass: 'dash-metric-value--green',  bg: 'rgba(48,120,80,0.14)' },
  { label: 'Языка перевода',  value: '3',    sub: 'KZ · RU · EN',      colorClass: 'dash-metric-value--violet', bg: 'rgba(90,60,140,0.14)' },
  { label: 'Приватность',     value: '100%', sub: 'данные на сервере',  colorClass: 'dash-metric-value--blue',   bg: 'rgba(196,155,60,0.12)' },
]

const RECENT_ACTIVITY = [
  { Icon: Database, label: 'RAG-индекс готов', meta: 'ChromaDB · активен',  colorClass: 'dash-activity-icon--blue' },
  { Icon: Cpu,      label: 'Ollama подключён', meta: 'LLM · в работе',       colorClass: 'dash-activity-icon--green' },
  { Icon: Activity, label: 'Pipeline запущен', meta: 'Docling · готов',      colorClass: 'dash-activity-icon--violet' },
  { Icon: Lock,     label: 'Локальный режим',  meta: 'Изолированная среда',  colorClass: 'dash-activity-icon--amber' },
]

const WORKFLOW_STEPS = [
  { label: 'Загрузите документ',          desc: 'PDF, DOCX, XLSX и другие форматы' },
  { label: 'Документ анализируется',      desc: 'Парсинг · Векторизация · Индексация' },
  { label: 'Задавайте вопросы',           desc: 'RAG-чат с точными ответами из текста' },
  { label: 'Экспортируйте результаты',    desc: 'Перевод, Презентация, Конвертация' },
]

function DocIllustration() {
  return (
    <div className="dash-doc-illustration">
      <div className="dash-doc-page-2" />
      <div className="dash-doc-page">
        <div className="dash-doc-line dash-doc-line--short dash-doc-line--accent" />
        <div className="dash-doc-line dash-doc-line--long" />
        <div className="dash-doc-line dash-doc-line--medium" />
        <div className="dash-doc-line dash-doc-line--long" />
        <div className="dash-doc-line dash-doc-line--short" />
        <div className="dash-doc-line dash-doc-line--medium" />
        <div className="dash-doc-line dash-doc-line--long" />
      </div>
      <div className="dash-doc-orb" />
      <div className="dash-doc-ring" />
    </div>
  )
}

export default function LandingPage() {
  const navigate = useNavigate()
  const username = useAuthStore((s) => s.username)
  const documentName = useWorkspaceStore(selectActiveDocumentName)
  const sessionId = useWorkspaceStore(selectActiveSessionId)
  const hasDoc = Boolean(sessionId)

  const displayName = username
    ? username.charAt(0).toUpperCase() + username.slice(1)
    : 'Пользователь'

  return (
    <div className="dash-root">

      {/* ── Welcome row ── */}
      <motion.div
        className="dash-welcome"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="dash-welcome-text">
          <h1>Добро пожаловать, {displayName}!</h1>
          <p>Загрузите документ для начала интеллектуального анализа</p>
        </div>

        <div className="dash-search" onClick={() => navigate('/upload')} role="button">
          <Search size={14} />
          <span>Поиск документа, задачи, заметок…</span>
        </div>

        <div className="dash-welcome-actions">
          <button className="dash-notif-btn" aria-label="Уведомления">
            <Bell size={16} />
          </button>
          <div className="dash-avatar" aria-label={`Аккаунт: ${displayName}`}>
            {displayName.charAt(0)}
          </div>
        </div>
      </motion.div>

      {/* ── Hero card ── */}
      <motion.div
        className="dash-hero"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.05 }}
      >
        <div className="dash-hero-body">
          {hasDoc ? (
            <>
              <div className="dash-hero-status">
                <CheckCircle size={13} />
                Документ готов к анализу
              </div>
              <h2 className="dash-hero-title">{documentName || 'Документ загружен'}</h2>
              <p className="dash-hero-sub">
                <FileText size={12} />
                Документ проанализирован
                <span className="dash-hero-sub-dot" />
                Векторный поиск активен
                <span className="dash-hero-sub-dot" />
                LLM подключён
              </p>
              <div className="dash-hero-actions">
                <button className="dash-hero-btn dash-hero-btn--primary" onClick={() => navigate('/chat')}>
                  <MessageSquare size={14} />
                  Открыть чат
                </button>
                <button className="dash-hero-btn dash-hero-btn--secondary" onClick={() => navigate('/presentation')}>
                  <BarChart2 size={14} />
                  Создать отчёт
                </button>
                <button className="dash-hero-btn dash-hero-btn--secondary" onClick={() => navigate('/upload')}>
                  <Upload size={14} />
                  Новый документ
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="dash-hero-status dash-hero-status--pending">
                <Zap size={13} />
                Система готова к работе
              </div>
              <h2 className="dash-hero-title">Начните работу с документом</h2>
              <p className="dash-hero-sub">
                Загрузите PDF, DOCX, XLSX, PNG и другие форматы для AI-анализа
                <span className="dash-hero-sub-dot" />
                Локальная обработка
                <span className="dash-hero-sub-dot" />
                Данные не покидают сервер
              </p>
              <div className="dash-hero-actions">
                <button className="dash-hero-btn dash-hero-btn--primary" onClick={() => navigate('/upload')}>
                  <Upload size={14} />
                  Загрузить документ
                </button>
                <button className="dash-hero-btn dash-hero-btn--secondary" onClick={() => navigate('/compare')}>
                  <GitCompare size={14} />
                  Сравнить документы
                </button>
              </div>
            </>
          )}
        </div>

        <div className="dash-hero-visual">
          <DocIllustration />
        </div>
      </motion.div>

      {/* ── Metrics ── */}
      <motion.div
        className="dash-metrics"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.12 }}
      >
        {METRICS.map((m, i) => (
          <div className="dash-metric-card" key={i}>
            <div className="dash-metric-eyebrow">
              <div className="dash-metric-icon" style={{ background: m.bg }}>
                <Database size={11} style={{ opacity: 0.7 }} />
              </div>
              {m.label}
            </div>
            <div className={`dash-metric-value ${m.colorClass}`}>{m.value}</div>
            <div className="dash-metric-label">{m.sub}</div>
          </div>
        ))}
      </motion.div>

      {/* ── Content grid ── */}
      <motion.div
        className="dash-grid"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.18 }}
      >
        {/* Col 1: Features */}
        <div className="dash-card">
          <div className="dash-card-title">
            <Zap size={14} />
            Возможности системы
          </div>
          <div className="dash-feature-list">
            {FEATURES.map((f, i) => (
              <button
                key={i}
                className="dash-feature-item"
                onClick={() => navigate(hasDoc ? f.path : '/upload')}
              >
                <div className="dash-feature-icon"><f.Icon size={15} strokeWidth={1.75} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="dash-feature-label">{f.label}</div>
                  <div className="dash-feature-desc">{f.desc}</div>
                </div>
                <ChevronRight size={14} className="dash-feature-arrow" />
              </button>
            ))}
          </div>
        </div>

        {/* Col 2: Workflow */}
        <div className="dash-card">
          <div className="dash-card-title">
            <ArrowRight size={14} />
            Рабочий процесс
          </div>
          <div className="dash-steps">
            {WORKFLOW_STEPS.map((s, i) => (
              <div className="dash-step" key={i}>
                <div className={`dash-step-num${hasDoc && i < 2 ? ' dash-step-num--done' : ''}`}>
                  {hasDoc && i < 2 ? '✓' : i + 1}
                </div>
                <div>
                  <div className="dash-step-label">{s.label}</div>
                  <div className="dash-step-desc">{s.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {!hasDoc && (
            <div className="dash-empty-cta" style={{ padding: '1rem 0 0' }}>
              <p>Загрузите документ чтобы начать работу</p>
              <button className="dash-empty-cta-btn" onClick={() => navigate('/upload')}>
                <Upload size={13} />
                Загрузить
              </button>
            </div>
          )}
        </div>

        {/* Col 3: Activity */}
        <div className="dash-card">
          <div className="dash-card-title">
            <Shield size={14} />
            Статус системы
          </div>
          <div className="dash-activity-list">
            {RECENT_ACTIVITY.map((a, i) => (
              <motion.div
                className="dash-activity-item"
                key={i}
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.22 + i * 0.06, duration: 0.22 }}
              >
                <div className={`dash-activity-icon ${a.colorClass}`}><a.Icon size={14} strokeWidth={1.75} /></div>
                <div style={{ minWidth: 0 }}>
                  <div className="dash-activity-name">{a.label}</div>
                  <div className="dash-activity-meta">{a.meta}</div>
                </div>
              </motion.div>
            ))}
          </div>

          {hasDoc && (
            <motion.div
              className="dash-activity-item"
              style={{ marginTop: '0.25rem', borderColor: 'rgba(74,222,128,0.18)', background: 'rgba(74,222,128,0.04)' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              <div className="dash-activity-icon dash-activity-icon--green"><CheckCircle size={14} strokeWidth={1.75} /></div>
              <div style={{ minWidth: 0 }}>
                <div className="dash-activity-name" style={{ color: '#3A8C5C' }}>Документ загружен</div>
                <div className="dash-activity-meta">{documentName || 'Активная сессия'}</div>
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>

    </div>
  )
}
