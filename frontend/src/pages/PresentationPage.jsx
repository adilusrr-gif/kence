import React, { useState } from 'react'
import {
  AlertCircle,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Presentation,
  RefreshCw,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { apiGeneratePresentation, apiDownloadPresentation } from '../lib/api'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { EmptyState } from '@/shared/ui/empty-state'
import { Inline } from '@/shared/ui/inline'
import { Progress } from '@/shared/ui/progress'
import { SectionHeader } from '@/shared/ui/section-header'
import { Stack } from '@/shared/ui/stack'
import { StatusPill } from '@/shared/ui/status-pill'

const SLIDE_COLORS = [
  ['#1A5F7A', '#0d3a4a'],
  ['#57C5B6', '#2a8a80'],
  ['#1a2d40', '#0f1a26'],
  ['#2C3E50', '#1a2535'],
  ['#1A5F7A', '#163050'],
  ['#0d3a4a', '#061a22'],
  ['#1e3a5f', '#0f2040'],
  ['#2a4a6b', '#163050'],
]

const GENERATION_STAGES = [
  'Анализ документа',
  'Выделение тезисов',
  'Формирование слайдов',
  'Финализация PPTX',
]

function SlideThumb({ slide, index, active, onClick }) {
  const [bg1, bg2] = SLIDE_COLORS[index % SLIDE_COLORS.length]

  return (
    <motion.div
      onClick={onClick}
      className={`slide-thumb ${active ? 'slide-thumb--active' : ''}`}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.25 }}
    >
      <div className="slide-thumb__preview" style={{ background: `linear-gradient(135deg, ${bg1}, ${bg2})` }}>
        <div className="slide-thumb__num">{index + 1}</div>
        <div className="slide-thumb__mini-title">
          {slide.title?.slice(0, 22)}
          {slide.title?.length > 22 ? '…' : ''}
        </div>
        <div className="slide-thumb__mini-dots">
          {(slide.points || []).slice(0, 3).map((_, pointIndex) => (
            <div key={pointIndex} className="slide-thumb__mini-dot" />
          ))}
        </div>
      </div>
      <p className="slide-thumb__label">
        {index + 1}. {slide.title?.slice(0, 28)}
        {slide.title?.length > 28 ? '…' : ''}
      </p>
    </motion.div>
  )
}

function SlideDetail({ slide, index, total, onPrev, onNext }) {
  const [bg1, bg2] = SLIDE_COLORS[index % SLIDE_COLORS.length]

  return (
    <motion.div
      className="slide-detail"
      key={index}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.22 }}
    >
      <div className="slide-detail__card" style={{ background: `linear-gradient(145deg, ${bg1}, ${bg2})` }}>
        <div className="slide-detail__num">Слайд {index + 1} / {total}</div>
        <h3 className="slide-detail__title">{slide.title}</h3>
        <ul className="slide-detail__points">
          {(slide.points || []).map((point, pointIndex) => (
            <motion.li
              key={pointIndex}
              className="slide-detail__point"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: pointIndex * 0.08, duration: 0.2 }}
            >
              <span className="slide-detail__bullet">›</span>
              {point}
            </motion.li>
          ))}
        </ul>
      </div>
      <div className="slide-detail__nav">
        <button className="slide-nav-btn" onClick={onPrev} disabled={index === 0}>
          <ChevronLeft size={18} />
        </button>
        <span className="slide-detail__pager">{index + 1} / {total}</span>
        <button className="slide-nav-btn" onClick={onNext} disabled={index === total - 1}>
          <ChevronRight size={18} />
        </button>
      </div>
    </motion.div>
  )
}

export default function PresentationPage({ sessionId }) {
  const [generating, setGenerating] = useState(false)
  const [structure, setStructure] = useState(null)
  const [error, setError] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const handleGenerate = async () => {
    setGenerating(true)
    setError('')
    setActiveIdx(0)

    try {
      const data = await apiGeneratePresentation(sessionId)
      setStructure(data.structure)
    } catch (err) {
      setError(err.message || 'Ошибка генерации')
    } finally {
      setGenerating(false)
    }
  }

  const handleDownload = async () => {
    try {
      const blob = await apiDownloadPresentation(sessionId)
      const url = window.URL.createObjectURL(blob)
      const anchor = Object.assign(document.createElement('a'), {
        href: url,
        download: 'presentation.pptx',
      })

      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      setError(err.message || 'Ошибка скачивания')
    }
  }

  const slides = structure?.slides || []

  return (
    <Stack gap="xl" className="pres-shell">
      <SectionHeader
        title="Генерация презентации"
        subtitle="AI создаст структуру и слайды на основе документа."
        actions={
          structure ? (
            <Inline gap="sm" wrap>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleGenerate}
                disabled={generating}
                leadingIcon={<RefreshCw size={15} className={generating ? 'animate-spin' : undefined} />}
              >
                Пересоздать
              </Button>
              <Button
                size="sm"
                onClick={handleDownload}
                leadingIcon={<Download size={16} />}
              >
                Скачать PPTX
              </Button>
            </Inline>
          ) : null
        }
      />

      {!structure ? (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <Card
            className="w-full"
            style={{
              padding: 'var(--space-8)',
              backgroundColor: 'var(--bg-surface-1)',
            }}
          >
            <Stack gap="lg">
              <EmptyState
                className="border-none"
                icon={
                  generating
                    ? <Loader2 size={40} className="animate-spin" />
                    : <Presentation size={40} />
                }
                title={generating ? 'Генерация презентации...' : 'Создать презентацию'}
                description={
                  generating
                    ? 'AI анализирует документ и формирует структуру слайдов.'
                    : 'AI проанализирует документ, выделит ключевые моменты и сгенерирует структурированные слайды.'
                }
                actions={
                  !generating ? (
                    <Button onClick={handleGenerate} leadingIcon={<Presentation size={18} />}>
                      Сгенерировать
                    </Button>
                  ) : null
                }
              />

              {generating ? (
                <Stack gap="md">
                  <Progress value={1} max={1} variant="default" />
                  <div
                    style={{
                      display: 'grid',
                      gap: 'var(--space-2)',
                    }}
                  >
                    {GENERATION_STAGES.map(stage => (
                      <Inline key={stage} gap="sm" align="center">
                        <Loader2 size={12} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
                        <span
                          style={{
                            color: 'var(--text-secondary)',
                            fontSize: 'var(--text-sm)',
                            lineHeight: 'var(--leading-normal)',
                          }}
                        >
                          {stage}
                        </span>
                      </Inline>
                    ))}
                  </div>
                </Stack>
              ) : null}

              {error ? (
                <Card
                  tone="default"
                  style={{
                    padding: 'var(--space-4)',
                    backgroundColor: 'rgba(248, 113, 113, 0.1)',
                    borderColor: 'rgba(248, 113, 113, 0.28)',
                  }}
                >
                  <Inline gap="sm" align="center">
                    <AlertCircle size={16} style={{ color: 'var(--status-danger)' }} />
                    <span
                      style={{
                        color: 'var(--status-danger)',
                        fontSize: 'var(--text-sm)',
                        lineHeight: 'var(--leading-normal)',
                      }}
                    >
                      {error}
                    </span>
                  </Inline>
                </Card>
              ) : null}
            </Stack>
          </Card>
        </motion.div>
      ) : (
        <Stack gap="lg" className="pres-content">
          <Card
            className="w-full"
            style={{
              padding: 'var(--space-4) var(--space-5)',
              backgroundColor: 'var(--bg-surface-1)',
            }}
          >
            <Inline justify="space-between" align="center" wrap>
              <Inline gap="sm" align="center" wrap>
                <CheckCircle size={16} style={{ color: 'var(--status-success)' }} />
                <span
                  style={{
                    color: 'var(--text-primary)',
                    fontSize: 'var(--text-md)',
                    fontWeight: 600,
                  }}
                >
                  {structure.title}
                </span>
              </Inline>
              <Inline gap="sm" align="center" wrap>
                <Badge variant="success">{slides.length} слайдов</Badge>
                <StatusPill status="success" label="Структура готова" />
              </Inline>
            </Inline>
          </Card>

          {error ? (
            <Card
              tone="default"
              style={{
                padding: 'var(--space-4)',
                backgroundColor: 'rgba(248, 113, 113, 0.1)',
                borderColor: 'rgba(248, 113, 113, 0.28)',
              }}
            >
              <Inline gap="sm" align="center">
                <AlertCircle size={16} style={{ color: 'var(--status-danger)' }} />
                <span
                  style={{
                    color: 'var(--status-danger)',
                    fontSize: 'var(--text-sm)',
                    lineHeight: 'var(--leading-normal)',
                  }}
                >
                  {error}
                </span>
              </Inline>
            </Card>
          ) : null}

          <div className="pres-workspace">
            <div className="pres-thumbs">
              <p className="pres-thumbs__header">Слайды</p>
              {slides.map((slide, index) => (
                <SlideThumb
                  key={index}
                  slide={slide}
                  index={index}
                  active={index === activeIdx}
                  onClick={() => setActiveIdx(index)}
                />
              ))}
            </div>

            <div className="pres-detail-wrap">
              <AnimatePresence mode="wait">
                {slides[activeIdx] ? (
                  <SlideDetail
                    slide={slides[activeIdx]}
                    index={activeIdx}
                    total={slides.length}
                    onPrev={() => setActiveIdx(current => Math.max(0, current - 1))}
                    onNext={() => setActiveIdx(current => Math.min(slides.length - 1, current + 1))}
                  />
                ) : null}
              </AnimatePresence>
            </div>
          </div>
        </Stack>
      )}
    </Stack>
  )
}
