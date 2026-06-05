import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle,
  FileDown,
  FileText,
  FileType,
  AlignLeft,
  Loader2,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { apiConvert, apiDownloadConverted } from '../lib/api'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { EmptyState } from '@/shared/ui/empty-state'
import { Inline } from '@/shared/ui/inline'
import { SectionHeader } from '@/shared/ui/section-header'
import { Stack } from '@/shared/ui/stack'
import { StatusPill } from '@/shared/ui/status-pill'

function buildFormats(t) {
  return [
    {
      id: 'txt',
      label: 'Plain Text',
      ext: '.txt',
      icon: AlignLeft,
      description: t('convert.formats.txt'),
      tone: 'neutral',
      accentColor: 'var(--text-secondary)',
    },
    {
      id: 'md',
      label: 'Markdown',
      ext: '.md',
      icon: FileType,
      description: t('convert.formats.md'),
      tone: 'info',
      accentColor: 'var(--status-info)',
    },
    {
      id: 'docx',
      label: 'Word DOCX',
      ext: '.docx',
      icon: FileText,
      description: t('convert.formats.docx'),
      tone: 'accent',
      accentColor: 'var(--accent-secondary)',
    },
    {
      id: 'pdf',
      label: 'PDF Document',
      ext: '.pdf',
      icon: FileDown,
      description: t('convert.formats.pdf'),
      tone: 'danger',
      accentColor: 'var(--status-danger)',
    },
  ]
}

function FormatOption({ format, active, onSelect }) {
  const Icon = format.icon

  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full rounded-[var(--radius-xl)] border text-left transition-all"
      style={{
        padding: 'var(--space-4)',
        borderColor: active
          ? 'color-mix(in srgb, var(--accent-primary) 48%, transparent)'
          : 'var(--border-subtle)',
        backgroundColor: active
          ? 'color-mix(in srgb, var(--accent-primary) 8%, var(--bg-surface-1))'
          : 'var(--bg-surface-1)',
        boxShadow: active ? 'var(--shadow-sm)' : 'none',
      }}
      aria-pressed={active}
    >
      <Inline align="center" gap="md" className="w-full">
        <div
          aria-hidden="true"
          className="shrink-0 rounded-[var(--radius-lg)]"
          style={{
            width: '2.75rem',
            height: '2.75rem',
            display: 'grid',
            placeItems: 'center',
            color: format.accentColor,
            backgroundColor: active
              ? 'color-mix(in srgb, var(--accent-primary) 14%, transparent)'
              : 'var(--bg-surface-2)',
          }}
        >
          <Icon size={20} />
        </div>

        <Stack gap="xs" className="min-w-0 flex-1">
          <Inline gap="sm" align="center" wrap>
            <span
              style={{
                color: 'var(--text-primary)',
                fontSize: 'var(--text-md)',
                fontWeight: 600,
                lineHeight: 'var(--leading-snug)',
              }}
            >
              {format.label}
            </span>
            <Badge variant={format.tone} size="sm">
              {format.ext}
            </Badge>
          </Inline>
          <p
            style={{
              margin: 0,
              color: 'var(--text-secondary)',
              fontSize: 'var(--text-sm)',
              lineHeight: 'var(--leading-normal)',
            }}
          >
            {format.description}
          </p>
        </Stack>

        {active ? <CheckCircle size={18} style={{ color: 'var(--accent-primary)' }} /> : null}
      </Inline>
    </button>
  )
}

function ConvertPage({ sessionId }) {
  const { t } = useTranslation()
  const [selectedFormat, setSelectedFormat] = useState(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const FORMATS = buildFormats(t)
  const selectedMeta = FORMATS.find(format => format.id === selectedFormat) || null

  const handleConvert = async () => {
    if (!selectedFormat || loading) return

    setLoading(true)
    setDone(false)
    setError('')

    try {
      await apiConvert(sessionId, selectedFormat)
      const blob = await apiDownloadConverted(sessionId, selectedFormat)
      const url = window.URL.createObjectURL(blob)
      const link = Object.assign(document.createElement('a'), {
        href: url,
        download: `document${selectedMeta?.ext || ''}`,
      })

      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
      setDone(true)
    } catch (err) {
      setError(err.message || t('convert.errorMsg'))
    } finally {
      setLoading(false)
    }
  }

  if (!sessionId) {
    return (
      <div className="mx-auto max-w-2xl">
        <EmptyState
          size="lg"
          icon={<FileText size={32} />}
          title={t('convert.noSessionTitle')}
          description={t('convert.noSessionDesc')}
          actions={
            <Button onClick={() => navigate('/upload')} leadingIcon={<FileText size={16} />}>
              {t('convert.noSessionBtn')}
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <Stack gap="xl" className="mx-auto max-w-2xl">
      <SectionHeader
        title={t('convert.title')}
        subtitle={t('convert.subtitle')}
        actions={
          <Button
            variant="ghost"
            size="sm"
            leadingIcon={<ArrowLeft size={16} />}
            onClick={() => navigate('/')}
          >
            {t('convert.back')}
          </Button>
        }
      />

      <Card
        className="w-full"
        style={{
          padding: 'var(--space-6)',
          backgroundColor: 'var(--bg-surface-1)',
        }}
      >
        <Stack gap="lg">
          <Inline justify="space-between" align="center" wrap>
            <SectionHeader
              dense
              title={t('convert.selectFormat')}
              subtitle={t('convert.selectSubtitle')}
            />
            <StatusPill
              status={loading ? 'streaming' : done ? 'success' : 'idle'}
              pulse={loading}
              label={
                loading
                  ? t('convert.statusConverting')
                  : done
                    ? t('convert.statusDone')
                    : selectedMeta
                      ? t('convert.statusSelected', { ext: selectedMeta.ext })
                      : t('convert.statusNone')
              }
            />
          </Inline>

          <Stack gap="md">
            {FORMATS.map(format => (
              <FormatOption
                key={format.id}
                format={format}
                active={selectedFormat === format.id}
                onSelect={() => {
                  setSelectedFormat(format.id)
                  setDone(false)
                  setError('')
                }}
              />
            ))}
          </Stack>

          {error ? (
            <Card
              tone="default"
              style={{
                padding: 'var(--space-4)',
                backgroundColor: 'color-mix(in srgb, var(--status-danger) 10%, transparent)',
                borderColor: 'color-mix(in srgb, var(--status-danger) 28%, transparent)',
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

          {done ? (
            <Card
              tone="default"
              style={{
                padding: 'var(--space-4)',
                backgroundColor: 'color-mix(in srgb, var(--status-success) 10%, transparent)',
                borderColor: 'color-mix(in srgb, var(--status-success) 28%, transparent)',
              }}
            >
              <Inline gap="sm" align="center">
                <CheckCircle size={16} style={{ color: 'var(--status-success)' }} />
                <span
                  style={{
                    color: 'var(--status-success)',
                    fontSize: 'var(--text-sm)',
                    lineHeight: 'var(--leading-normal)',
                  }}
                >
                  {t('convert.successMsg')}
                </span>
              </Inline>
            </Card>
          ) : null}

          <Button
            block
            size="lg"
            onClick={handleConvert}
            disabled={!selectedFormat || loading}
            loading={loading}
            leadingIcon={!loading ? <FileDown size={18} /> : null}
          >
            {loading ? t('convert.convertingBtn') : t('convert.convertBtn')}
          </Button>
        </Stack>
      </Card>
    </Stack>
  )
}

export default ConvertPage
