import React, { useState, useEffect } from 'react'
import {
  AlertCircle, CheckCircle, ChevronLeft, ChevronRight,
  Download, Loader2, Presentation, RefreshCw, Plus, Trash2, Check,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { apiPresentationPlan, apiUpdatePresentationPlan, apiBuildPresentation, apiDownloadPresentation, apiPresentationThemes } from '../lib/api'
import { useToast } from '@/shared/ui/toast'
import Skeleton from '@/shared/ui/skeleton/Skeleton'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { Inline } from '@/shared/ui/inline'
import { Stack } from '@/shared/ui/stack'
import { usePresentationBuild } from '../hooks/usePresentationBuild'

// ── Constants ─────────────────────────────────────────────────────────────────

// Fallback shown until the backend's theme list (source of truth) loads.
const FALLBACK_THEMES = {
  corporate: { label: 'Corporate', bg: '#1A2744', accent: '#3B82F6', text: '#FFFFFF' },
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SlideThumb({ slide, index, active, onClick, themeColors }) {
  const { bg, accent, text } = themeColors
  const gradient = `linear-gradient(135deg, ${bg}, color-mix(in srgb, ${bg} 55%, ${accent} 45%))`
  return (
    <motion.div
      onClick={onClick}
      className={`slide-thumb ${active ? 'slide-thumb--active' : ''}`}
      whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.25 }}
    >
      <div className="slide-thumb__preview" style={{ background: gradient }}>
        <div className="slide-thumb__num" style={{ color: `color-mix(in srgb, ${text} 55%, transparent)` }}>{index + 1}</div>
        <div className="slide-thumb__mini-title" style={{ color: text }}>{slide.title?.slice(0, 22)}{slide.title?.length > 22 ? '…' : ''}</div>
        <div className="slide-thumb__mini-dots">
          {(slide.points || []).slice(0, 3).map((_, i) => (
            <div key={i} className="slide-thumb__mini-dot" style={{ background: `color-mix(in srgb, ${text} 35%, transparent)` }} />
          ))}
        </div>
      </div>
      <p className="slide-thumb__label">{index + 1}. {slide.title?.slice(0, 28)}{slide.title?.length > 28 ? '…' : ''}</p>
    </motion.div>
  )
}

function SlideDetail({ slide, index, total, onPrev, onNext, themeColors }) {
  const { t } = useTranslation()
  const { bg, accent, text } = themeColors
  const gradient = `linear-gradient(145deg, ${bg}, color-mix(in srgb, ${bg} 60%, ${accent} 40%))`
  return (
    <motion.div
      className="slide-detail" key={index}
      initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.22 }}
    >
      <div className="slide-detail__card" style={{ background: gradient }}>
        <div className="slide-detail__num" style={{ color: `color-mix(in srgb, ${text} 45%, transparent)` }}>
          {t('presentation.slideOf', { current: index + 1, total })}
        </div>
        <h3 className="slide-detail__title" style={{ color: text }}>{slide.title}</h3>
        <ul className="slide-detail__points">
          {(slide.points || []).map((point, i) => (
            <motion.li key={i} className="slide-detail__point" style={{ color: `color-mix(in srgb, ${text} 85%, transparent)` }}
              initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.08, duration: 0.2 }}
            >
              <span className="slide-detail__bullet" style={{ color: accent }}>›</span>{point}
            </motion.li>
          ))}
        </ul>
      </div>
      <div className="slide-detail__nav">
        <button className="slide-nav-btn" onClick={onPrev} disabled={index === 0}><ChevronLeft size={18} /></button>
        <span className="slide-detail__pager">{index + 1} / {total}</span>
        <button className="slide-nav-btn" onClick={onNext} disabled={index === total - 1}><ChevronRight size={18} /></button>
      </div>
    </motion.div>
  )
}

function ChartDataEditor({ slide, idx, updateSlide, t }) {
  const data = slide.data || {}
  const rows = (data.labels && data.labels.length)
    ? data.labels.map((l, i) => ({ label: l, value: data.values?.[i] ?? '' }))
    : [{ label: '', value: '' }]

  const commit = (newRows, unit = data.unit || '') => {
    updateSlide(idx, 'data', {
      labels: newRows.map(r => r.label),
      values: newRows.map(r => Number(r.value) || 0),
      unit,
    })
  }

  const updateRow = (i, field, value) => commit(rows.map((r, ri) => ri === i ? { ...r, [field]: value } : r))
  const addRow = () => commit([...rows, { label: '', value: '' }])
  const removeRow = (i) => commit(rows.filter((_, ri) => ri !== i))

  const fieldStyle = {
    background: 'var(--bg-surface-2)', color: 'var(--text-primary)',
    border: '1px solid var(--border-subtle)', borderRadius: 6,
    padding: '4px 8px', fontSize: 12, fontFamily: 'inherit',
  }

  return (
    <Stack gap="xs">
      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('presentation.step1.chartDataLabel')}</span>
      {rows.map((row, i) => (
        <Inline key={i} gap="xs" align="center">
          <input
            value={row.label}
            onChange={e => updateRow(i, 'label', e.target.value)}
            placeholder={t('presentation.step1.chartLabelPlaceholder')}
            style={{ ...fieldStyle, flex: 2 }}
          />
          <input
            type="number"
            value={row.value}
            onChange={e => updateRow(i, 'value', e.target.value)}
            placeholder={t('presentation.step1.chartValuePlaceholder')}
            style={{ ...fieldStyle, flex: 1 }}
          />
          <button
            onClick={() => removeRow(i)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, flexShrink: 0 }}
          >
            <Trash2 size={12} />
          </button>
        </Inline>
      ))}
      <Inline gap="sm" align="center">
        <button onClick={addRow}
          style={{ fontSize: 11, color: 'var(--accent-primary)', background: 'none', border: 'none', cursor: 'pointer' }}>
          + {t('presentation.step1.chartAddRow')}
        </button>
        <input
          value={data.unit || ''}
          onChange={e => commit(rows, e.target.value)}
          placeholder={t('presentation.step1.chartUnitPlaceholder')}
          style={{ ...fieldStyle, width: 100, color: 'var(--text-muted)' }}
        />
      </Inline>
    </Stack>
  )
}

function TwoColumnEditor({ slide, idx, updateSlide, t }) {
  const fieldStyle = {
    background: 'var(--bg-surface-2)', color: 'var(--text-primary)',
    border: '1px solid var(--border-subtle)', borderRadius: 8,
    padding: '6px 10px', fontSize: 12, width: '100%', fontFamily: 'inherit',
  }
  const updatePointsField = (field, text) => {
    updateSlide(idx, field, text.split('\n').map(l => l.trim()).filter(Boolean))
  }
  return (
    <Inline gap="sm" align="stretch">
      <Stack gap="xs" style={{ flex: 1 }}>
        <input
          value={slide.left_title || ''}
          onChange={e => updateSlide(idx, 'left_title', e.target.value)}
          placeholder={t('presentation.step1.leftTitlePlaceholder')}
          style={fieldStyle}
        />
        <textarea
          value={(slide.left_points || []).join('\n')}
          onChange={e => updatePointsField('left_points', e.target.value)}
          placeholder={t('presentation.step1.pointsPlaceholder')}
          rows={3}
          style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.6 }}
        />
      </Stack>
      <Stack gap="xs" style={{ flex: 1 }}>
        <input
          value={slide.right_title || ''}
          onChange={e => updateSlide(idx, 'right_title', e.target.value)}
          placeholder={t('presentation.step1.rightTitlePlaceholder')}
          style={fieldStyle}
        />
        <textarea
          value={(slide.right_points || []).join('\n')}
          onChange={e => updatePointsField('right_points', e.target.value)}
          placeholder={t('presentation.step1.pointsPlaceholder')}
          rows={3}
          style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.6 }}
        />
      </Stack>
    </Inline>
  )
}

function ThemeCard({ id, theme, selected, onClick }) {
  return (
    <motion.div
      onClick={onClick}
      whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
      style={{
        cursor: 'pointer',
        borderRadius: 12,
        border: selected ? `2px solid ${theme.accent}` : '2px solid var(--border-subtle)',
        overflow: 'hidden',
        transition: 'border 0.15s',
      }}
    >
      <div style={{
        background: theme.bg, color: theme.text,
        padding: '14px 16px', fontSize: 12, fontWeight: 600,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span>{theme.label}</span>
        {selected && <Check size={13} style={{ color: theme.accent }} />}
      </div>
      <div style={{ background: theme.bg, padding: '8px 16px 12px', borderTop: `2px solid ${theme.accent}40` }}>
        <div style={{ width: '100%', height: 6, borderRadius: 3, background: theme.accent, marginBottom: 6 }} />
        <div style={{ width: '70%', height: 4, borderRadius: 2, background: theme.text, opacity: 0.4 }} />
        <div style={{ width: '50%', height: 4, borderRadius: 2, background: theme.text, opacity: 0.25, marginTop: 4 }} />
      </div>
    </motion.div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PresentationPage({ sessionId }) {
  const { t } = useTranslation()
  const [step,             setStep]             = useState(0)
  const [plan,             setPlan]             = useState(null)
  const [loading,          setLoading]          = useState(false)
  const [error,            setError]            = useState('')
  const [theme,            setTheme]            = useState('corporate')
  const [selectedIds,      setSelectedIds]      = useState([])
  const [activeIdx,        setActiveIdx]        = useState(0)
  const [built,            setBuilt]            = useState(false)
  const [userInstructions, setUserInstructions] = useState('')
  const [numSlides,        setNumSlides]        = useState(6)
  const [themes,           setThemes]           = useState(FALLBACK_THEMES)
  const toast = useToast()

  useEffect(() => {
    apiPresentationThemes()
      .then(data => { if (data?.themes) setThemes(data.themes) })
      .catch(() => { /* keep fallback theme list */ })
  }, [])

  const { building, buildStatus, handleBuild } = usePresentationBuild({
    sessionId,
    theme,
    selectedIds,
    onSuccess: () => { setBuilt(true); setStep(3) },
    onError: setError,
  })

  const SLIDE_TYPES = {
    title:           t('presentation.slideTypes.title'),
    content:         t('presentation.slideTypes.content'),
    chart:           t('presentation.slideTypes.chart'),
    kpi_row:         t('presentation.slideTypes.kpi_row'),
    big_number:      t('presentation.slideTypes.big_number'),
    two_column:      t('presentation.slideTypes.two_column'),
    section_divider: t('presentation.slideTypes.section_divider'),
    quote:           t('presentation.slideTypes.quote'),
    summary:         t('presentation.slideTypes.summary'),
  }

  const STEP_LABELS = [
    t('presentation.steps.settings'),
    t('presentation.steps.plan'),
    t('presentation.steps.theme'),
    t('presentation.steps.result'),
  ]

  // ── Step 0 → Step 1: Generate plan ────────────────────────────────────────

  const handleGeneratePlan = async () => {
    if (!sessionId) { setError(t('presentation.errors.noSession')); return }
    setLoading(true)
    setError('')
    try {
      const data = await apiPresentationPlan(sessionId, userInstructions, numSlides)
      setPlan(data)
      setSelectedIds((data.slides || []).map(s => s.id))
      setStep(1)
    } catch (err) {
      const msg = err.message || t('presentation.errors.planFailed')
      setError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  const updateSlide = (idx, field, value) => {
    setPlan(prev => {
      const slides = [...prev.slides]
      slides[idx] = { ...slides[idx], [field]: value }
      return { ...prev, slides }
    })
  }

  const updatePoints = (idx, text) => {
    const points = text.split('\n').map(l => l.trim()).filter(Boolean)
    updateSlide(idx, 'points', points)
  }

  const addSlide = () => {
    const id = crypto.randomUUID()
    setPlan(prev => ({
      ...prev,
      slides: [...prev.slides, { id, type: 'content', title: t('presentation.step1.titlePlaceholder'), points: [] }],
    }))
    setSelectedIds(prev => [...prev, id])
  }

  const removeSlide = (idx) => {
    const id = plan.slides[idx].id
    setPlan(prev => ({ ...prev, slides: prev.slides.filter((_, i) => i !== idx) }))
    setSelectedIds(prev => prev.filter(sid => sid !== id))
  }

  const handleNextFromPlan = async () => {
    if (!plan) return
    try {
      await apiUpdatePresentationPlan(sessionId, plan)
    } catch { /* ignore — plan saved locally */ }
    setStep(2)
  }

  // ── Step 2: Build ──────────────────────────────────────────────────────────

  const toggleSlide = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    )
  }

  // ── Step 3: Download ───────────────────────────────────────────────────────

  const handleDownload = async () => {
    try {
      const blob = await apiDownloadPresentation(sessionId)
      const url = window.URL.createObjectURL(blob)
      const a = Object.assign(document.createElement('a'), { href: url, download: 'presentation.pptx' })
      document.body.appendChild(a); a.click(); a.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      setError(err.message || t('presentation.errors.downloadFailed'))
    }
  }

  const resetWizard = () => {
    setStep(0); setPlan(null); setBuilt(false); setError('')
    setSelectedIds([]); setTheme('corporate'); setActiveIdx(0)
    setUserInstructions(''); setNumSlides(6)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const builtSlides = plan?.slides.filter(s => selectedIds.includes(s.id)) || []
  const activeThemeColors = themes[theme] || Object.values(themes)[0]

  return (
    <Stack gap="xl" className="pres-shell">
      {/* Step indicator */}
      <Inline gap="md" align="center">
        {[0, 1, 2, 3].map(s => (
          <Inline key={s} gap="sm" align="center">
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: step >= s ? 'var(--accent-primary)' : 'var(--bg-surface-2)',
              color: step >= s ? '#fff' : 'var(--text-muted)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 700, flexShrink: 0,
              transition: 'background 0.2s',
            }}>
              {step > s ? <Check size={13} /> : s + 1}
            </div>
            <span style={{
              fontSize: 13, fontWeight: step === s ? 700 : 400,
              color: step >= s ? 'var(--text-primary)' : 'var(--text-muted)',
            }}>
              {STEP_LABELS[s]}
            </span>
            {s < 3 && <div style={{ width: 32, height: 1, background: 'var(--border-subtle)' }} />}
          </Inline>
        ))}
      </Inline>

      {/* Error */}
      {error && (
        <Card style={{ padding: 'var(--space-3) var(--space-4)', borderColor: 'color-mix(in srgb, var(--status-danger) 36%, transparent)', backgroundColor: 'color-mix(in srgb, var(--status-danger) 8%, var(--bg-surface-1))', color: 'var(--status-danger)' }}>
          <Inline gap="sm" align="center">
            <AlertCircle size={14} /> {error}
          </Inline>
        </Card>
      )}

      <AnimatePresence mode="wait">

        {/* ── STEP 0: Setup ── */}
        {step === 0 && (
          <motion.div key="step0" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Stack gap="lg">
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                {t('presentation.step0.heading')}
              </span>

              <Card style={{ padding: 'var(--space-5)' }}>
                <Stack gap="md">
                  <Stack gap="xs">
                    <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                      {t('presentation.step0.instructionsLabel')}
                    </label>
                    <textarea
                      value={userInstructions}
                      onChange={e => setUserInstructions(e.target.value)}
                      placeholder={t('presentation.step0.instructionsPlaceholder')}
                      rows={4}
                      style={{
                        width: '100%',
                        background: 'var(--bg-surface-2)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 10,
                        padding: '10px 14px',
                        fontSize: 13,
                        color: 'var(--text-primary)',
                        resize: 'vertical',
                        fontFamily: 'inherit',
                        lineHeight: 1.6,
                        outline: 'none',
                      }}
                    />
                  </Stack>

                  <Stack gap="xs">
                    <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                      {t('presentation.step0.slidesLabel', { count: numSlides })}
                    </label>
                    <input
                      type="range"
                      min={2}
                      max={12}
                      value={numSlides}
                      onChange={e => setNumSlides(Number(e.target.value))}
                      style={{ width: '100%', accentColor: 'var(--accent-primary)', cursor: 'pointer' }}
                    />
                    <Inline justify="space-between">
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('presentation.step0.slidesMin')}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('presentation.step0.slidesTotal', { count: numSlides + 2 })}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('presentation.step0.slidesMax')}</span>
                    </Inline>
                  </Stack>
                </Stack>
              </Card>

              <Button
                size="md"
                onClick={handleGeneratePlan}
                disabled={loading || !sessionId}
                loading={loading}
                leadingIcon={<Presentation size={14} />}
                style={{ alignSelf: 'flex-end' }}
              >
                {loading ? t('presentation.step0.generatingBtn') : t('presentation.step0.generateBtn')}
              </Button>

              {!sessionId && (
                <p style={{ fontSize: 12, color: 'var(--status-danger)', textAlign: 'center' }}>
                  {t('presentation.step0.noSession')}
                </p>
              )}
            </Stack>
          </motion.div>
        )}

        {/* ── STEP 1: Plan ── */}
        {step === 1 && (
          <motion.div key="step1" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Stack gap="md">
              <Inline justify="space-between" align="center" wrap>
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {t('presentation.step1.heading')}
                </span>
                <Inline gap="sm" wrap>
                  <Button variant="secondary" size="sm" onClick={() => setStep(0)}
                    leadingIcon={<ChevronLeft size={13} />}>{t('presentation.step1.back')}</Button>
                  <Button variant="secondary" size="sm" onClick={handleGeneratePlan} disabled={loading}
                    leadingIcon={<RefreshCw size={13} className={loading ? 'animate-spin' : ''} />}>
                    {t('presentation.step1.regenerate')}
                  </Button>
                  <Button size="sm" onClick={handleNextFromPlan} disabled={loading || !plan}
                    leadingIcon={<ChevronRight size={13} />}>
                    {t('presentation.step1.next')}
                  </Button>
                </Inline>
              </Inline>

              {plan && (
                <Stack gap="sm">
                  {plan.slides.map((slide, idx) => (
                    <Card key={slide.id || idx} style={{ padding: 'var(--space-4)' }}>
                      <Stack gap="sm">
                        <Inline gap="sm" align="center" justify="space-between">
                          <select
                            value={slide.type}
                            onChange={e => updateSlide(idx, 'type', e.target.value)}
                            style={{
                              background: 'var(--bg-surface-2)', color: 'var(--text-primary)',
                              border: '1px solid var(--border-subtle)', borderRadius: 6,
                              padding: '4px 8px', fontSize: 12, cursor: 'pointer',
                            }}
                          >
                            {Object.entries(SLIDE_TYPES).map(([v, l]) => (
                              <option key={v} value={v}>{l}</option>
                            ))}
                          </select>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
                            {t('presentation.step1.slideNum', { n: idx + 1 })}
                          </span>
                          <button
                            onClick={() => removeSlide(idx)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </Inline>

                        <input
                          value={slide.title}
                          onChange={e => updateSlide(idx, 'title', e.target.value)}
                          placeholder={t('presentation.step1.titlePlaceholder')}
                          style={{
                            background: 'var(--bg-surface-2)', color: 'var(--text-primary)',
                            border: '1px solid var(--border-subtle)', borderRadius: 8,
                            padding: '6px 10px', fontSize: 13, width: '100%', fontFamily: 'inherit',
                          }}
                        />

                        {slide.type !== 'title' && slide.type !== 'two_column' && (
                          <textarea
                            value={(slide.points || []).join('\n')}
                            onChange={e => updatePoints(idx, e.target.value)}
                            placeholder={t('presentation.step1.pointsPlaceholder')}
                            rows={3}
                            style={{
                              background: 'var(--bg-surface-2)', color: 'var(--text-primary)',
                              border: '1px solid var(--border-subtle)', borderRadius: 8,
                              padding: '6px 10px', fontSize: 12, width: '100%', resize: 'vertical',
                              fontFamily: 'inherit', lineHeight: 1.6,
                            }}
                          />
                        )}

                        {(slide.type === 'chart' || slide.type === 'kpi_row') && (
                          <ChartDataEditor slide={slide} idx={idx} updateSlide={updateSlide} t={t} />
                        )}

                        {slide.type === 'two_column' && (
                          <TwoColumnEditor slide={slide} idx={idx} updateSlide={updateSlide} t={t} />
                        )}
                      </Stack>
                    </Card>
                  ))}

                  <Button variant="secondary" size="sm" onClick={addSlide}
                    leadingIcon={<Plus size={13} />} style={{ alignSelf: 'flex-start' }}>
                    {t('presentation.step1.addSlide')}
                  </Button>
                </Stack>
              )}
            </Stack>
          </motion.div>
        )}

        {/* ── STEP 2: Settings ── */}
        {step === 2 && (
          <motion.div key="step2" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Stack gap="lg">
              <Inline justify="space-between" align="center" wrap>
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {t('presentation.step2.heading')}
                </span>
                <Inline gap="sm" wrap>
                  <Button variant="secondary" size="sm" onClick={() => setStep(1)}
                    leadingIcon={<ChevronLeft size={13} />}>{t('presentation.step2.back')}</Button>
                  <Button size="sm" onClick={handleBuild} loading={building} disabled={building || selectedIds.length === 0}
                    leadingIcon={<Presentation size={13} />}>{t('presentation.step2.buildBtn')}</Button>
                </Inline>
              </Inline>

              <Stack gap="sm">
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>{t('presentation.step2.themeLabel')}</span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
                  {Object.entries(themes).map(([id, th]) => (
                    <ThemeCard key={id} id={id} theme={th} selected={theme === id} onClick={() => setTheme(id)} />
                  ))}
                </div>
              </Stack>

              <Stack gap="sm">
                <Inline justify="space-between" align="center">
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                    {t('presentation.step2.slidesLabel', { selected: selectedIds.length, total: plan?.slides.length || 0 })}
                  </span>
                  <Inline gap="sm">
                    <button onClick={() => setSelectedIds((plan?.slides || []).map(s => s.id))}
                      style={{ fontSize: 11, color: 'var(--accent-primary)', background: 'none', border: 'none', cursor: 'pointer' }}>
                      {t('presentation.step2.selectAll')}
                    </button>
                    <button onClick={() => setSelectedIds([])}
                      style={{ fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
                      {t('presentation.step2.deselectAll')}
                    </button>
                  </Inline>
                </Inline>

                <Stack gap="xs">
                  {(plan?.slides || []).map((slide, idx) => (
                    <Card key={slide.id} style={{ padding: 'var(--space-2) var(--space-3)', cursor: 'pointer' }}
                      onClick={() => toggleSlide(slide.id)}>
                      <Inline gap="sm" align="center">
                        <div style={{
                          width: 16, height: 16, borderRadius: 4,
                          border: `2px solid ${selectedIds.includes(slide.id) ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
                          background: selectedIds.includes(slide.id) ? 'var(--accent-primary)' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                          transition: 'all 0.15s',
                        }}>
                          {selectedIds.includes(slide.id) && <Check size={10} color="#fff" />}
                        </div>
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                          {idx + 1}. {slide.title}
                        </span>
                        <Badge variant="neutral" size="sm" style={{ marginLeft: 'auto', flexShrink: 0 }}>
                          {SLIDE_TYPES[slide.type] || slide.type}
                        </Badge>
                      </Inline>
                    </Card>
                  ))}
                </Stack>
              </Stack>

              {building && (
                <Card style={{ padding: '16px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <Loader2 size={15} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent-primary)', flexShrink: 0 }} />
                    <span style={{ fontSize: '0.83rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      {buildStatus || t('presentation.step2.buildingBtn')}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <Skeleton height="12px" width="75%" />
                    <Skeleton height="12px" />
                    <Skeleton height="12px" width="55%" />
                  </div>
                </Card>
              )}
            </Stack>
          </motion.div>
        )}

        {/* ── STEP 3: Result ── */}
        {step === 3 && (
          <motion.div key="step3" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Stack gap="lg">
              <Inline justify="space-between" align="center" wrap>
                <Inline gap="sm" align="center">
                  <CheckCircle size={16} style={{ color: 'var(--status-success)' }} />
                  <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {t('presentation.step3.heading', { count: builtSlides.length })}
                  </span>
                </Inline>
                <Inline gap="sm" wrap>
                  <Button variant="secondary" size="sm" onClick={resetWizard}
                    leadingIcon={<RefreshCw size={13} />}>{t('presentation.step3.recreate')}</Button>
                  <Button size="sm" onClick={handleDownload}
                    leadingIcon={<Download size={14} />}>{t('presentation.step3.download')}</Button>
                </Inline>
              </Inline>

              <div className="pres-workspace">
                <div className="pres-thumbs">
                  <p className="pres-thumbs__header">{t('presentation.step3.slidesHeader')}</p>
                  {builtSlides.map((slide, index) => (
                    <SlideThumb key={slide.id} slide={slide} index={index}
                      active={index === activeIdx} onClick={() => setActiveIdx(index)}
                      themeColors={activeThemeColors} />
                  ))}
                </div>
                <div className="pres-detail-wrap">
                  <AnimatePresence mode="wait">
                    {builtSlides[activeIdx] && (
                      <SlideDetail slide={builtSlides[activeIdx]} index={activeIdx} total={builtSlides.length}
                        onPrev={() => setActiveIdx(i => Math.max(0, i - 1))}
                        onNext={() => setActiveIdx(i => Math.min(builtSlides.length - 1, i + 1))}
                        themeColors={activeThemeColors}
                      />
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </Stack>
          </motion.div>
        )}

      </AnimatePresence>
    </Stack>
  )
}
