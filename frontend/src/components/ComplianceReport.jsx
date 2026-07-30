import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ShieldCheck, ShieldAlert, ShieldX, MinusCircle,
  ChevronDown, ChevronRight, BookMarked,
} from 'lucide-react'

/**
 * Renders the structured result of the "compliance" agent (НПА check).
 *
 * The agent returns { compliance_score, total_requirements, non_compliant_count,
 * partial_count, summary, npa_used[], findings[{requirement,status,evidence,
 * recommendation,npa}] }. Findings are grouped by status with problems first —
 * a reviewer cares about what fails, not about the compliant majority.
 */

// Status keys are the Russian literals the agent emits (see compliance_agent._STATUS_VALUES).
const STATUS_META = {
  'не соответствует': { icon: ShieldX,      color: 'var(--status-danger)',  order: 0, defaultOpen: true },
  'частично':         { icon: ShieldAlert,  color: 'var(--status-warning)', order: 1, defaultOpen: true },
  'соответствует':    { icon: ShieldCheck,  color: 'var(--status-success)', order: 2, defaultOpen: false },
  'не применимо':     { icon: MinusCircle,  color: 'var(--text-secondary)', order: 3, defaultOpen: false },
}

const scoreColor = (score) =>
  score >= 80 ? 'var(--status-success)'
    : score >= 50 ? 'var(--status-warning)'
      : 'var(--status-danger)'

function ScoreRing({ score }) {
  const color = scoreColor(score)
  // Conic gradient avoids pulling in a chart library for a single figure.
  return (
    <div
      style={{
        width: 84, height: 84, borderRadius: '50%', flexShrink: 0,
        background: `conic-gradient(${color} ${score * 3.6}deg, var(--bg-tertiary, #e5e7eb) 0deg)`,
        display: 'grid', placeItems: 'center',
      }}
      role="img"
      aria-label={`${score}%`}
    >
      <div style={{
        width: 64, height: 64, borderRadius: '50%', background: 'var(--bg-primary, #fff)',
        display: 'grid', placeItems: 'center', fontSize: 20, fontWeight: 700, color,
      }}>
        {score}%
      </div>
    </div>
  )
}

function Finding({ finding }) {
  const { t } = useTranslation()
  const meta = STATUS_META[finding.status] || STATUS_META['частично']
  return (
    <div style={{
      padding: '10px 12px', borderRadius: 8, marginBottom: 6,
      background: 'var(--bg-secondary, #f8fafc)',
      borderLeft: `3px solid ${meta.color}`,
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{finding.requirement}</div>
      {finding.evidence && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
          <b>{t('compliance.evidence')}:</b> {finding.evidence}
        </div>
      )}
      {finding.recommendation && (
        <div style={{ fontSize: 12, color: meta.color }}>
          <b>{t('compliance.recommendation')}:</b> {finding.recommendation}
        </div>
      )}
      {finding.npa && (
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
          <BookMarked size={11} /> {finding.npa}
        </div>
      )}
    </div>
  )
}

function StatusGroup({ status, findings, defaultOpen }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(defaultOpen)
  const meta = STATUS_META[status] || STATUS_META['частично']
  const Icon = meta.icon
  const Chevron = open ? ChevronDown : ChevronRight
  return (
    <div style={{ marginBottom: 10 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          background: 'none', border: 'none', cursor: 'pointer', padding: '6px 0',
          color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, textAlign: 'left',
        }}
        aria-expanded={open}
      >
        <Chevron size={14} />
        <Icon size={15} color={meta.color} />
        <span style={{ textTransform: 'capitalize' }}>{status}</span>
        <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>({findings.length})</span>
      </button>
      {open && findings.map((f, i) => <Finding key={i} finding={f} />)}
    </div>
  )
}

export default function ComplianceReport({ result }) {
  const { t } = useTranslation()

  const groups = useMemo(() => {
    const byStatus = {}
    for (const f of result?.findings || []) {
      (byStatus[f.status] ||= []).push(f)
    }
    return Object.entries(byStatus).sort(
      ([a], [b]) => (STATUS_META[a]?.order ?? 9) - (STATUS_META[b]?.order ?? 9)
    )
  }, [result])

  if (!result || !result.findings?.length) return null

  const score = result.compliance_score ?? 0

  return (
    <div style={{ fontSize: 13 }}>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <ScoreRing score={score} />
        <div style={{ minWidth: 200, flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 2 }}>
            {t('compliance.title')}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {t('compliance.stats', {
              total: result.total_requirements ?? 0,
              failed: result.non_compliant_count ?? 0,
              partial: result.partial_count ?? 0,
            })}
          </div>
          {result.npa_used?.length > 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6, display: 'flex', alignItems: 'flex-start', gap: 4 }}>
              <BookMarked size={12} style={{ marginTop: 1, flexShrink: 0 }} />
              <span>{result.npa_used.join(', ')}</span>
            </div>
          )}
        </div>
      </div>

      {result.summary && (
        <div style={{
          padding: '10px 12px', borderRadius: 8, marginBottom: 14,
          background: 'var(--bg-secondary, #f8fafc)', lineHeight: 1.5,
        }}>
          {result.summary}
        </div>
      )}

      {groups.map(([status, findings]) => (
        <StatusGroup
          key={status}
          status={status}
          findings={findings}
          defaultOpen={STATUS_META[status]?.defaultOpen ?? true}
        />
      ))}
    </div>
  )
}
