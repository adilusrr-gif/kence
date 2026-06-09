/**
 * GovernmentBriefView — renders the output of the government_briefing agent.
 * Reads from brief.* flat object produced by briefing_orchestrator.py.
 * Zero new AI calls — purely renders existing backend data.
 *
 * Sections rendered:
 *   executive_summary · key_facts · people · organizations · timeline
 *   risks · recommended_actions · deadlines · required_decisions
 *
 * Exported separately: ConfidenceBadge (used in DocumentInsightsPage header)
 */
import React, { useState } from 'react'
import { motion } from 'framer-motion'
import {
  AlertTriangle, Clock, Users, Building2, CheckCircle,
  Target, Calendar, BookOpen, Zap, ChevronDown, ChevronRight,
  Hash, Shield,
} from 'lucide-react'

// ── Animation ─────────────────────────────────────────────────────────────────

const STAGGER = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
}
const ITEM = {
  hidden:  { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 340, damping: 26 } },
}

// ── Priority ──────────────────────────────────────────────────────────────────

const PRIORITY_COLOR = {
  CRITICAL: 'var(--status-danger)',
  HIGH:     'var(--color-amber-400)',
  MEDIUM:   'var(--color-cyan-400)',
}
const PRIORITY_RU = {
  CRITICAL: 'Критический',
  HIGH:     'Высокий',
  MEDIUM:   'Средний',
}

// ── Classification Badge (exported for page header and PDF) ──────────────────

const CLASSIFICATION_CONFIG = {
  'ОТКРЫТО':        { color: 'var(--status-success)',    label: 'ОТКРЫТО' },
  'ВНУТРЕННЕЕ':     { color: '#3b82f6',                  label: 'ВНУТРЕННЕЕ' },
  'ДСП':            { color: 'var(--color-amber-400)',   label: 'ДСП' },
  'КОНФИДЕНЦИАЛЬНО':{ color: 'var(--status-danger)',     label: 'КОНФИДЕНЦИАЛЬНО' },
  'СЕКРЕТНО':       { color: '#7c3aed',                  label: 'СЕКРЕТНО' },
}

export function ClassificationBadge({ level = 'ДСП' }) {
  const cfg = CLASSIFICATION_CONFIG[level?.toUpperCase()] || CLASSIFICATION_CONFIG['ДСП']
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 12px', borderRadius: 4,
      background: `color-mix(in srgb, ${cfg.color} 15%, transparent)`,
      border: `1px solid ${cfg.color}`,
      fontSize: 10, fontWeight: 800, color: cfg.color,
      letterSpacing: '0.08em', flexShrink: 0,
    }}>
      <Shield size={9} />
      {cfg.label}
    </div>
  )
}

// ── Confidence Badge (exported for page header) ───────────────────────────────

export function ConfidenceBadge({ level, confidenceKey }) {
  if (!level && !confidenceKey) return null
  const key = confidenceKey || (level === 'ВЫСОКИЙ' ? 'high' : level === 'СРЕДНИЙ' ? 'medium' : 'low')
  const cfg = {
    high:   { color: 'var(--status-success)',    label: 'Высокая достоверность' },
    medium: { color: 'var(--color-amber-400)',   label: 'Средняя достоверность' },
    low:    { color: 'var(--status-danger)',      label: 'Низкая достоверность' },
  }[key] || { color: 'var(--text-faint)', label: level || key }

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '4px 10px', borderRadius: 20,
      background: `color-mix(in srgb, ${cfg.color} 12%, transparent)`,
      border: `1px solid color-mix(in srgb, ${cfg.color} 30%, transparent)`,
      fontSize: 11, fontWeight: 700, color: cfg.color,
      letterSpacing: '0.04em', flexShrink: 0,
    }}>
      <Shield size={10} />
      {cfg.label.toUpperCase()}
    </div>
  )
}

// ── Collapsible section card ──────────────────────────────────────────────────

function Section({ icon: Icon, color, title, subtitle, defaultOpen = false, empty = false, children }) {
  const [open, setOpen] = useState(defaultOpen)
  if (empty) return null
  return (
    <motion.div variants={ITEM} className="surface-bento" style={{ padding: '18px 20px' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <div style={{
          width: 36, height: 36, borderRadius: 10, flexShrink: 0,
          background: `color-mix(in srgb, ${color} 15%, transparent)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={16} style={{ color }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{title}</div>
          {subtitle && <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 1 }}>{subtitle}</div>}
        </div>
        {open
          ? <ChevronDown  size={14} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
          : <ChevronRight size={14} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
        }
      </button>

      {open && (
        <div style={{ paddingTop: 14, borderTop: '1px solid var(--border-subtle)', marginTop: 12 }}>
          {children}
        </div>
      )}
    </motion.div>
  )
}

// ── Risk score bar ────────────────────────────────────────────────────────────

function RiskScore({ score }) {
  const color = score >= 80 ? 'var(--status-danger)'
    : score >= 60 ? 'var(--color-amber-400)'
    : score >= 35 ? 'var(--color-amber-500)'
    : 'var(--status-success)'
  const label = score >= 80 ? 'Критический' : score >= 60 ? 'Высокий' : score >= 35 ? 'Средний' : 'Низкий'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
      <div style={{ fontSize: 32, fontWeight: 800, color, lineHeight: 1, letterSpacing: '-0.02em' }}>{score}</div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color }}>{label} риск</div>
        <div style={{ width: 120, height: 6, background: 'var(--bg-surface-2)', borderRadius: 3, marginTop: 4 }}>
          <div style={{ width: `${score}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.8s ease' }} />
        </div>
      </div>
    </div>
  )
}

// ── Tag pill (for people / organizations) ────────────────────────────────────

function Tag({ label, color }) {
  return (
    <span style={{
      fontSize: 12, padding: '3px 10px', borderRadius: 20,
      background: `color-mix(in srgb, ${color} 10%, var(--bg-surface-2))`,
      color: 'var(--text-secondary)',
      border: `1px solid color-mix(in srgb, ${color} 22%, transparent)`,
    }}>{label}</span>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function GovernmentBriefView({ brief, classification = 'ДСП' }) {
  if (!brief) return null

  const {
    executive_summary = '',
    short_summary      = '',
    key_facts          = [],
    people             = [],
    organizations      = [],
    timeline           = [],
    risks              = {},
    recommended_actions = [],
    deadlines          = [],
    required_decisions = [],
    key_findings       = [],
    confidence_level,
    confidence_key,
  } = brief

  const summary   = executive_summary || short_summary
  const topRisks  = (risks.top_risks || []).slice(0, 8)
  const riskScore = risks.overall_score

  const sortedDeadlines = [...deadlines].sort((a, b) => {
    const da = a.date_sortable || '9999'
    const db = b.date_sortable || '9999'
    return da < db ? -1 : da > db ? 1 : 0
  })

  return (
    <motion.div variants={STAGGER} initial="hidden" animate="visible"
      style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* ── Classification banner ──────────────────────────────────────────── */}
      <motion.div variants={ITEM} style={{
        display: 'flex', justifyContent: 'center', padding: '6px 0',
        borderTop: '3px solid currentColor',
        borderBottom: '3px solid currentColor',
        borderColor: CLASSIFICATION_CONFIG[classification?.toUpperCase()]?.color || 'var(--color-amber-400)',
      }}>
        <ClassificationBadge level={classification} />
      </motion.div>

      {/* ── Executive Summary (always open, no toggle) ──────────────────────── */}
      <motion.div variants={ITEM} className="surface-bento" style={{ padding: '22px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <Zap size={15} style={{ color: 'var(--accent-primary)' }} />
          <span style={{
            fontSize: 11, fontWeight: 700, color: 'var(--accent-primary)',
            textTransform: 'uppercase', letterSpacing: '0.06em', flex: 1,
          }}>
            Исполнительное резюме
          </span>
          <ConfidenceBadge level={confidence_level} confidenceKey={confidence_key} />
        </div>

        {summary && (
          <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text-primary)', margin: '0 0 12px' }}>
            {summary}
          </p>
        )}

        {key_findings.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {key_findings.slice(0, 4).map((f, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, fontSize: 13 }}>
                <CheckCircle size={13} style={{ color: 'var(--status-success)', flexShrink: 0, marginTop: 2 }} />
                <span style={{ color: 'var(--text-secondary)' }}>{f}</span>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {/* ── Required Decisions ─────────────────────────────────────────────── */}
      <Section
        icon={Target}
        color="var(--status-danger)"
        title="Требуемые решения"
        subtitle={required_decisions.length > 0 ? `${required_decisions.length} решений требует внимания` : undefined}
        defaultOpen={required_decisions.length > 0}
        empty={required_decisions.length === 0}
      >
        {required_decisions.map((d, i) => (
          <div key={i} style={{
            marginBottom: 14, padding: '12px 16px',
            background: 'var(--bg-surface-2)', borderRadius: 10,
            borderLeft: '3px solid var(--status-danger)',
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
              {i + 1}. {d.decision}
            </div>
            {(d.responsible || d.deadline) && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: d.consequence ? 8 : 0 }}>
                {d.responsible && (
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ответственный</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{d.responsible}</div>
                  </div>
                )}
                {d.deadline && (
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Срок</div>
                    <div style={{ fontSize: 12, color: 'var(--color-amber-400)', marginTop: 2, fontWeight: 600 }}>{d.deadline}</div>
                  </div>
                )}
              </div>
            )}
            {d.consequence && (
              <div style={{
                fontSize: 12, color: 'var(--text-secondary)',
                padding: '6px 10px',
                background: 'color-mix(in srgb, var(--status-danger) 7%, var(--bg-surface-1))',
                borderRadius: 6,
              }}>
                ⚠ {d.consequence}
              </div>
            )}
          </div>
        ))}
      </Section>

      {/* ── Recommended Actions ────────────────────────────────────────────── */}
      <Section
        icon={CheckCircle}
        color="var(--color-cyan-400)"
        title="Рекомендуемые действия"
        subtitle={recommended_actions.length > 0 ? `${recommended_actions.length} действий` : undefined}
        defaultOpen={recommended_actions.length > 0}
        empty={recommended_actions.length === 0}
      >
        {recommended_actions.map((a, i) => {
          const pColor = PRIORITY_COLOR[a.priority] || 'var(--text-faint)'
          const pLabel = PRIORITY_RU[a.priority]   || a.priority
          return (
            <div key={i} style={{
              marginBottom: 12, padding: '12px 16px',
              background: 'var(--bg-surface-2)', borderRadius: 10,
              borderLeft: `3px solid ${pColor}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: pColor, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {pLabel}
                </span>
                {a.deadline && (
                  <>
                    <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>·</span>
                    <span style={{ fontSize: 10, color: 'var(--color-amber-400)', fontWeight: 600 }}>до {a.deadline}</span>
                  </>
                )}
                {a.owner && (
                  <>
                    <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>·</span>
                    <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>{a.owner}</span>
                  </>
                )}
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: a.reason ? 4 : 0 }}>
                {i + 1}. {a.action}
              </div>
              {a.reason && (
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{a.reason}</div>
              )}
            </div>
          )
        })}
      </Section>

      {/* ── Risks ──────────────────────────────────────────────────────────── */}
      <Section
        icon={AlertTriangle}
        color="var(--color-amber-400)"
        title="Риски"
        subtitle={riskScore !== undefined ? `Общая оценка: ${riskScore}/100` : undefined}
        empty={topRisks.length === 0 && riskScore === undefined}
      >
        {riskScore !== undefined && <RiskScore score={riskScore} />}
        {topRisks.map((r, i) => {
          const sevColor = (r.severity === 'critical' || r.severity === 'high')
            ? 'var(--status-danger)' : 'var(--color-amber-400)'
          const sevRu = { critical: 'Критический', high: 'Высокий', medium: 'Средний', low: 'Низкий' }[r.severity] || r.severity
          const catRu = { financial: 'Финансовый', legal: 'Юридический', compliance: 'Соответствие', operational: 'Операционный', reputational: 'Репутационный' }[r.category] || r.category
          return (
            <div key={i} style={{
              marginBottom: 10, padding: '10px 14px',
              background: 'var(--bg-surface-2)', borderRadius: 8,
              borderLeft: `3px solid ${sevColor}`,
            }}>
              <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: sevColor, textTransform: 'uppercase' }}>{sevRu}</span>
                <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>·</span>
                <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>{catRu}</span>
              </div>
              <p style={{ fontSize: 13, color: 'var(--text-primary)', margin: '0 0 4px' }}>{r.description}</p>
              {r.recommendation && (
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>💡 {r.recommendation}</p>
              )}
            </div>
          )
        })}
      </Section>

      {/* ── Deadlines ──────────────────────────────────────────────────────── */}
      <Section
        icon={Calendar}
        color="var(--color-violet-400)"
        title="Сроки"
        subtitle={sortedDeadlines.length > 0 ? `${sortedDeadlines.length} — ближайший первый` : undefined}
        defaultOpen={sortedDeadlines.length > 0}
        empty={sortedDeadlines.length === 0}
      >
        {sortedDeadlines.map((d, i) => (
          <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 10, alignItems: 'flex-start' }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: 'var(--color-violet-400)', flexShrink: 0, marginTop: 5,
            }} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-violet-400)', marginBottom: 2 }}>{d.date}</div>
              <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{d.event}</div>
              {d.evidence && (
                <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2, fontStyle: 'italic' }}>«{d.evidence}»</div>
              )}
            </div>
          </div>
        ))}
      </Section>

      {/* ── Key Facts ──────────────────────────────────────────────────────── */}
      <Section
        icon={Hash}
        color="var(--color-green-400)"
        title="Ключевые факты"
        subtitle={key_facts.length > 0 ? `${key_facts.length} фактов` : undefined}
        empty={key_facts.length === 0}
      >
        {key_facts.map((f, i) => (
          <div key={i} style={{
            marginBottom: 10, padding: '10px 14px',
            background: 'var(--bg-surface-2)', borderRadius: 8,
            borderLeft: '3px solid var(--color-green-400)',
          }}>
            <div style={{ fontSize: 13, color: 'var(--text-primary)', marginBottom: f.evidence ? 4 : 0 }}>
              <span style={{ color: 'var(--color-green-400)', fontWeight: 700, marginRight: 6 }}>{i + 1}.</span>
              {f.fact}
            </div>
            {f.evidence && (
              <div style={{ fontSize: 11, color: 'var(--text-faint)', fontStyle: 'italic' }}>«{f.evidence}»</div>
            )}
          </div>
        ))}
      </Section>

      {/* ── People ─────────────────────────────────────────────────────────── */}
      <Section
        icon={Users}
        color="var(--color-cyan-400)"
        title="Персоны"
        subtitle={people.length > 0 ? `${people.length} упомянуто` : undefined}
        empty={people.length === 0}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {people.map((p, i) => <Tag key={i} label={p} color="var(--color-cyan-400)" />)}
        </div>
      </Section>

      {/* ── Organizations ──────────────────────────────────────────────────── */}
      <Section
        icon={Building2}
        color="var(--color-violet-400)"
        title="Организации"
        subtitle={organizations.length > 0 ? `${organizations.length} упомянуто` : undefined}
        empty={organizations.length === 0}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {organizations.map((o, i) => <Tag key={i} label={o} color="var(--color-violet-400)" />)}
        </div>
      </Section>

      {/* ── Timeline ───────────────────────────────────────────────────────── */}
      <Section
        icon={Clock}
        color="var(--color-amber-400)"
        title="Хронология"
        subtitle={timeline.length > 0 ? `${timeline.length} событий` : undefined}
        empty={timeline.length === 0}
      >
        {timeline.slice(0, 15).map((e, i) => (
          <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 10, alignItems: 'flex-start' }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: 'var(--color-amber-400)', flexShrink: 0, marginTop: 6,
            }} />
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-amber-400)', marginBottom: 2 }}>{e.date}</div>
              <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{e.event}</div>
              {e.evidence && (
                <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2, fontStyle: 'italic' }}>«{e.evidence}»</div>
              )}
            </div>
          </div>
        ))}
        {timeline.length > 15 && (
          <p style={{ fontSize: 12, color: 'var(--text-faint)', textAlign: 'center', margin: '4px 0 0' }}>
            и ещё {timeline.length - 15} событий…
          </p>
        )}
      </Section>

    </motion.div>
  )
}
