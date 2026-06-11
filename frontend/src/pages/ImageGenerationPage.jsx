import React, { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import { ImagePlus, Wand2, Trash2, AlertCircle } from 'lucide-react'
import {
  apiImageGenStatus, apiImageOptions, apiGenerateImage,
  apiListImages, apiDeleteImage, apiGetImageBlob,
} from '../lib/api'
import { useToast } from '@/shared/ui/toast'
import { Card } from '@/shared/ui/card'
import { Stack } from '@/shared/ui/stack'
import { Inline } from '@/shared/ui/inline'
import { Button } from '@/shared/ui/button'
import { Textarea } from '@/shared/ui/textarea'
import { Select } from '@/shared/ui/select'
import { Loader } from '@/shared/ui/loader'
import { EmptyState } from '@/shared/ui/empty-state'

export default function ImageGenerationPage() {
  const { t } = useTranslation()
  const toast = useToast()

  const [available, setAvailable] = useState(null)
  const [options, setOptions] = useState(null)
  const [prompt, setPrompt] = useState('')
  const [aspectRatio, setAspectRatio] = useState('square')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [gallery, setGallery] = useState([])
  const [imageUrls, setImageUrls] = useState({})
  const [resultId, setResultId] = useState(null)

  const urlsRef = useRef({})

  useEffect(() => {
    apiImageGenStatus().then(d => setAvailable(!!d.available)).catch(() => setAvailable(false))
    apiImageOptions().then(setOptions).catch(() => {})
    apiListImages().then(setGallery).catch(() => {})
  }, [])

  // Fetch authenticated blobs for any gallery image without a cached object URL
  useEffect(() => {
    let cancelled = false
    gallery.forEach(img => {
      if (urlsRef.current[img.id]) return
      apiGetImageBlob(img.id).then(blob => {
        if (cancelled) return
        const url = URL.createObjectURL(blob)
        urlsRef.current[img.id] = url
        setImageUrls(prev => ({ ...prev, [img.id]: url }))
      }).catch(() => {})
    })
    return () => { cancelled = true }
  }, [gallery])

  useEffect(() => {
    return () => {
      Object.values(urlsRef.current).forEach(url => URL.revokeObjectURL(url))
    }
  }, [])

  const aspectRatioOptions = (options?.aspect_ratios || []).map(ar => ({
    value: ar.key,
    label: t(`imageGeneration.aspectRatios.${ar.key}`, ar.key),
  }))

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError(t('imageGeneration.errors.promptRequired'))
      return
    }
    setGenerating(true)
    setError('')
    try {
      const image = await apiGenerateImage({ prompt: prompt.trim(), aspect_ratio: aspectRatio })
      setGallery(prev => [image, ...prev])
      setResultId(image.id)
    } catch (err) {
      const msg = err.message || t('imageGeneration.errors.generateFailed')
      setError(msg)
      toast.error(msg)
    } finally {
      setGenerating(false)
    }
  }

  const handleDelete = async (id) => {
    try {
      await apiDeleteImage(id)
      setGallery(prev => prev.filter(img => img.id !== id))
      if (urlsRef.current[id]) {
        URL.revokeObjectURL(urlsRef.current[id])
        delete urlsRef.current[id]
        setImageUrls(prev => {
          const next = { ...prev }
          delete next[id]
          return next
        })
      }
      if (resultId === id) setResultId(null)
    } catch (err) {
      toast.error(err.message || t('common.error'))
    }
  }

  const resultImage = gallery.find(img => img.id === resultId)

  return (
    <Stack gap="xl" className="image-gen-shell">
      <Inline gap="sm" align="center">
        <ImagePlus size={20} style={{ color: 'var(--accent-primary)' }} />
        <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
          {t('imageGeneration.title')}
        </span>
      </Inline>

      {available === false && (
        <Card style={{ padding: 'var(--space-3) var(--space-4)', borderColor: 'color-mix(in srgb, var(--status-warning, #F59E0B) 36%, transparent)', backgroundColor: 'color-mix(in srgb, var(--status-warning, #F59E0B) 8%, var(--bg-surface-1))' }}>
          <Inline gap="sm" align="center">
            <AlertCircle size={14} style={{ color: 'var(--status-warning, #F59E0B)' }} />
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{t('imageGeneration.unavailable')}</span>
          </Inline>
        </Card>
      )}

      {error && (
        <Card style={{ padding: 'var(--space-3) var(--space-4)', borderColor: 'color-mix(in srgb, var(--status-danger) 36%, transparent)', backgroundColor: 'color-mix(in srgb, var(--status-danger) 8%, var(--bg-surface-1))', color: 'var(--status-danger)' }}>
          <Inline gap="sm" align="center">
            <AlertCircle size={14} /> {error}
          </Inline>
        </Card>
      )}

      <Card style={{ padding: 'var(--space-5)' }}>
        <Stack gap="md">
          <Stack gap="xs">
            <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
              {t('imageGeneration.promptLabel')}
            </label>
            <Textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder={t('imageGeneration.promptPlaceholder')}
              rows={4}
              disabled={available === false}
            />
          </Stack>

          <Inline gap="md" wrap align="flex-end">
            <Stack gap="xs" style={{ minWidth: 220 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                {t('imageGeneration.aspectRatioLabel')}
              </label>
              <Select
                options={aspectRatioOptions}
                value={aspectRatio}
                onChange={e => setAspectRatio(e.target.value)}
                disabled={available === false}
              />
            </Stack>

            <Button
              size="md"
              onClick={handleGenerate}
              disabled={generating || available === false}
              loading={generating}
              leadingIcon={<Wand2 size={14} />}
            >
              {generating ? t('imageGeneration.generatingBtn') : t('imageGeneration.generateBtn')}
            </Button>
          </Inline>

          {generating && (
            <Inline gap="sm" align="center">
              <Loader size="sm" tone="accent" />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('imageGeneration.generatingHint')}</span>
            </Inline>
          )}

          {options && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {t('imageGeneration.modelLabel', { name: options.model_version || options.model_name })}
            </span>
          )}
        </Stack>
      </Card>

      {resultImage && imageUrls[resultImage.id] && (
        <Card style={{ padding: 'var(--space-4)' }}>
          <Stack gap="sm">
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
              {t('imageGeneration.resultHeading')}
            </span>
            <img
              src={imageUrls[resultImage.id]}
              alt={resultImage.prompt}
              style={{ maxWidth: '100%', borderRadius: 12, border: '1px solid var(--border-subtle)' }}
            />
          </Stack>
        </Card>
      )}

      <Stack gap="sm">
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
          {t('imageGeneration.galleryHeading')}
        </span>

        {gallery.length === 0 ? (
          <EmptyState
            icon={<ImagePlus size={28} />}
            title={t('imageGeneration.galleryEmpty')}
          />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
            <AnimatePresence>
              {gallery.map(img => (
                <motion.div
                  key={img.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.18 }}
                >
                  <Card style={{ padding: 0, overflow: 'hidden' }}>
                    <div style={{ aspectRatio: `${img.width} / ${img.height}`, background: 'var(--bg-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {imageUrls[img.id] ? (
                        <img src={imageUrls[img.id]} alt={img.prompt} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <Loader size="sm" />
                      )}
                    </div>
                    <Stack gap="xs" style={{ padding: 'var(--space-3)' }}>
                      <span style={{
                        fontSize: 12, color: 'var(--text-secondary)',
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                      }}>
                        {img.prompt}
                      </span>
                      <Inline justify="space-between" align="center">
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {new Date(img.created_at).toLocaleDateString()}
                        </span>
                        <button
                          onClick={() => handleDelete(img.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}
                          aria-label={t('common.delete')}
                        >
                          <Trash2 size={13} />
                        </button>
                      </Inline>
                    </Stack>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </Stack>
    </Stack>
  )
}
