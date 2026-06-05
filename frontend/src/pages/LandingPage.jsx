import React from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import {
  Bell, Search, ArrowRight, FileText, MessageSquare,
  Languages, BarChart2, GitCompare, RefreshCw, CheckCircle,
  Zap, Shield, Database, ChevronRight, Upload,
  Scale, LayoutTemplate, ArrowLeftRight, Activity, Cpu, Lock,
} from 'lucide-react'
import { useAuthStore } from '@/shared/stores'
import { useWorkspaceStore, selectActiveDocumentName, selectActiveSessionId } from '@/shared/stores'

function DocIllustration() {
  return (
    <svg
      viewBox="0 0 220 260"
      width="160"
      height="190"
      aria-hidden="true"
      style={{ overflow: 'visible', filter: 'drop-shadow(0 8px 24px rgba(34,211,238,0.12))' }}
    >
      <defs>
        <linearGradient id="doc-line-accent" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="var(--color-cyan-400)" stopOpacity="0.9" />
          <stop offset="100%" stopColor="var(--color-blue-400)" stopOpacity="0.6" />
        </linearGradient>
        <linearGradient id="doc-card-bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--bg-surface-2)" stopOpacity="0.9" />
          <stop offset="100%" stopColor="var(--bg-surface-1)" stopOpacity="0.7" />
        </linearGradient>
        <linearGradient id="doc-badge-bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--color-cyan-400)" stopOpacity="0.2" />
          <stop offset="100%" stopColor="var(--color-blue-400)" stopOpacity="0.1" />
        </linearGradient>
      </defs>

      {/* Shadow page behind */}
      <rect x="12" y="28" width="158" height="200" rx="10"
        fill="var(--glass-bg)" stroke="var(--glass-border)" strokeWidth="1" opacity="0.5" />

      {/* Main document page */}
      <rect x="24" y="16" width="158" height="200" rx="10"
        fill="url(#doc-card-bg)" stroke="var(--glass-border)" strokeWidth="1" />

      {/* Accent left bar */}
      <rect x="24" y="40" width="3" height="54" rx="1.5"
        fill="url(#doc-line-accent)" />

      {/* Text lines */}
      <rect x="36" y="44" width="106" height="6" rx="3" fill="url(#doc-line-accent)" opacity="0.85" />
      <rect x="36" y="58" width="128" height="5" rx="2.5" fill="var(--border-default)" opacity="0.5" />
      <rect x="36" y="70" width="98" height="5" rx="2.5" fill="var(--border-default)" opacity="0.4" />
      <rect x="36" y="82" width="118" height="5" rx="2.5" fill="var(--border-default)" opacity="0.45" />
      <rect x="36" y="94" width="86" height="5" rx="2.5" fill="var(--border-default)" opacity="0.35" />

      {/* Divider */}
      <line x1="36" y1="110" x2="162" y2="110" stroke="var(--border-subtle)" strokeWidth="1" />

      {/* Body text lines */}
      <rect x="36" y="122" width="128" height="4" rx="2" fill="var(--border-default)" opacity="0.35" />
      <rect x="36" y="133" width="108" height="4" rx="2" fill="var(--border-default)" opacity="0.3" />
      <rect x="36" y="144" width="120" height="4" rx="2" fill="var(--border-default)" opacity="0.28" />
      <rect x="36" y="155" width="90" height="4" rx="2" fill="var(--border-default)" opacity="0.25" />

      {/* AI badge */}
      <rect x="60" y="178" width="84" height="26" rx="8"
        fill="url(#doc-badge-bg)" stroke="var(--glass-border)" strokeWidth="1" />
      <circle cx="74" cy="191" r="5" fill="var(--color-cyan-400)" opacity="0.85" />
      <rect x="84" y="187" width="48" height="4" rx="2" fill="url(#doc-line-accent)" opacity="0.7" />
      <rect x="84" y="195" width="32" height="3" rx="1.5" fill="var(--border-default)" opacity="0.4" />

      {/* Floating orb */}
      <circle cx="188" cy="30" r="14"
        fill="radial-gradient(circle, rgba(34,211,238,0.3), transparent)"
        opacity="0.6">
        <animate attributeName="cy" values="30;24;30" dur="3s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.6;1;0.6" dur="3s" repeatCount="indefinite" />
      </circle>
      <circle cx="188" cy="30" r="14"
        fill="none" stroke="url(#doc-line-accent)" strokeWidth="1" opacity="0.5">
        <animate attributeName="cy" values="30;24;30" dur="3s" repeatCount="indefinite" />
      </circle>
    </svg>
  )
}

export default function LandingPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const username = useAuthStore((s) => s.username)
  const documentName = useWorkspaceStore(selectActiveDocumentName)
  const sessionId = useWorkspaceStore(selectActiveSessionId)
  const hasDoc = Boolean(sessionId)

  const displayName = username
    ? username.charAt(0).toUpperCase() + username.slice(1)
    : t('landing.defaultUser')

  const FEATURES = [
    { Icon: MessageSquare,  label: t('landing.features.rag.label'),          desc: t('landing.features.rag.desc'),          path: '/workspace' },
    { Icon: Languages,      label: t('landing.features.translate.label'),     desc: t('landing.features.translate.desc'),     path: '/workspace' },
    { Icon: Scale,          label: t('landing.features.compare.label'),       desc: t('landing.features.compare.desc'),       path: '/compare' },
    { Icon: LayoutTemplate, label: t('landing.features.presentation.label'),  desc: t('landing.features.presentation.desc'),  path: '/presentation' },
    { Icon: ArrowLeftRight, label: t('landing.features.convert.label'),       desc: t('landing.features.convert.desc'),       path: '/convert' },
  ]

  const METRICS = [
    { label: t('landing.metrics.formats.label'),  value: '50+',  sub: t('landing.metrics.formats.sub'),  colorClass: 'dash-metric-value--blue',   bg: 'rgba(59,130,246,0.1)' },
    { label: t('landing.metrics.speed.label'),    value: '~2s',  sub: t('landing.metrics.speed.sub'),    colorClass: 'dash-metric-value--green',  bg: 'rgba(34,197,94,0.1)' },
    { label: t('landing.metrics.langs.label'),    value: '3',    sub: t('landing.metrics.langs.sub'),    colorClass: 'dash-metric-value--violet', bg: 'rgba(139,92,246,0.1)' },
    { label: t('landing.metrics.privacy.label'),  value: '100%', sub: t('landing.metrics.privacy.sub'),  colorClass: 'dash-metric-value--blue',   bg: 'rgba(59,130,246,0.1)' },
  ]

  const RECENT_ACTIVITY = [
    { Icon: Database, label: t('landing.activity.rag.label'),      meta: t('landing.activity.rag.meta'),      colorClass: 'dash-activity-icon--blue' },
    { Icon: Cpu,      label: t('landing.activity.ollama.label'),   meta: t('landing.activity.ollama.meta'),   colorClass: 'dash-activity-icon--green' },
    { Icon: Activity, label: t('landing.activity.pipeline.label'), meta: t('landing.activity.pipeline.meta'), colorClass: 'dash-activity-icon--violet' },
    { Icon: Lock,     label: t('landing.activity.local.label'),    meta: t('landing.activity.local.meta'),    colorClass: 'dash-activity-icon--amber' },
  ]

  const WORKFLOW_STEPS = [
    { label: t('landing.steps.upload.label'),  desc: t('landing.steps.upload.desc') },
    { label: t('landing.steps.analyze.label'), desc: t('landing.steps.analyze.desc') },
    { label: t('landing.steps.ask.label'),     desc: t('landing.steps.ask.desc') },
    { label: t('landing.steps.export.label'),  desc: t('landing.steps.export.desc') },
  ]

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
          <h1>{t('landing.welcome', { name: displayName })}</h1>
          <p>{t('landing.welcomeDesc')}</p>
        </div>

        <div className="dash-search" onClick={() => navigate('/upload')} role="button">
          <Search size={14} />
          <span>{t('landing.searchPlaceholder')}</span>
        </div>

        <div className="dash-welcome-actions">
          <button className="dash-notif-btn" aria-label={t('landing.notifBtn')}>
            <Bell size={16} />
          </button>
          <div className="dash-avatar" aria-label={t('landing.accountLabel', { name: displayName })}>
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
                {t('landing.docReady')}
              </div>
              <h2 className="dash-hero-title">{documentName || t('landing.docLoaded')}</h2>
              <p className="dash-hero-sub">
                <FileText size={12} />
                {t('landing.docAnalyzed')}
                <span className="dash-hero-sub-dot" />
                {t('landing.vectorActive')}
                <span className="dash-hero-sub-dot" />
                {t('landing.llmConnected')}
              </p>
              <div className="dash-hero-actions">
                <button className="dash-hero-btn dash-hero-btn--primary" onClick={() => navigate('/workspace')}>
                  <MessageSquare size={14} />
                  {t('landing.openChat')}
                </button>
                <button className="dash-hero-btn dash-hero-btn--secondary" onClick={() => navigate('/presentation')}>
                  <BarChart2 size={14} />
                  {t('landing.createReport')}
                </button>
                <button className="dash-hero-btn dash-hero-btn--secondary" onClick={() => navigate('/upload')}>
                  <Upload size={14} />
                  {t('landing.newDoc')}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="dash-hero-status dash-hero-status--pending">
                <Zap size={13} />
                {t('landing.systemReady')}
              </div>
              <h2 className="dash-hero-title dash-hero-title--gradient">{t('landing.heroTitle')}</h2>
              <p className="dash-hero-sub">
                {t('landing.heroDesc')}
                <span className="dash-hero-sub-dot" />
                {t('landing.localProcessing')}
                <span className="dash-hero-sub-dot" />
                {t('landing.dataPrivate')}
              </p>
              <div className="dash-hero-actions">
                <button className="dash-hero-btn dash-hero-btn--primary" onClick={() => navigate('/upload')}>
                  <Upload size={14} />
                  {t('landing.uploadDoc')}
                </button>
                <button className="dash-hero-btn dash-hero-btn--secondary" onClick={() => navigate('/compare')}>
                  <GitCompare size={14} />
                  {t('landing.compareDocs')}
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
            {t('landing.capabilities')}
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
            {t('landing.workflowTitle')}
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
              <p>{t('landing.uploadToStart')}</p>
              <button className="dash-empty-cta-btn" onClick={() => navigate('/upload')}>
                <Upload size={13} />
                {t('landing.uploadBtn')}
              </button>
            </div>
          )}
        </div>

        {/* Col 3: Activity */}
        <div className="dash-card">
          <div className="dash-card-title">
            <Shield size={14} />
            {t('landing.systemStatus')}
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
              style={{ marginTop: '0.25rem', borderColor: 'rgba(34,197,94,0.2)', background: 'rgba(34,197,94,0.05)' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              <div className="dash-activity-icon dash-activity-icon--green"><CheckCircle size={14} strokeWidth={1.75} /></div>
              <div style={{ minWidth: 0 }}>
                <div className="dash-activity-name" style={{ color: '#22c55e' }}>{t('landing.docUploadedStatus')}</div>
                <div className="dash-activity-meta">{documentName || t('landing.activeSession')}</div>
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>

    </div>
  )
}
