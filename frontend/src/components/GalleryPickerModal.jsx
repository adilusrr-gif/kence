import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { X, ImagePlus } from 'lucide-react'
import { apiListImages, apiGetImageBlob } from '../lib/api'
import { Loader } from '@/shared/ui/loader'
import { EmptyState } from '@/shared/ui/empty-state'

export default function GalleryPickerModal({ open, onClose, onSelect }) {
  const { t } = useTranslation()
  const [images, setImages] = useState([])
  const [loading, setLoading] = useState(false)
  const [imageUrls, setImageUrls] = useState({})
  const urlsRef = useRef({})

  useEffect(() => {
    if (!open) return
    setLoading(true)
    apiListImages().then(setImages).catch(() => setImages([])).finally(() => setLoading(false))
  }, [open])

  // Fetch authenticated blobs for any image without a cached object URL
  useEffect(() => {
    if (!open) return
    let cancelled = false
    images.forEach(img => {
      if (urlsRef.current[img.id]) return
      apiGetImageBlob(img.id).then(blob => {
        if (cancelled) return
        const url = URL.createObjectURL(blob)
        urlsRef.current[img.id] = url
        setImageUrls(prev => ({ ...prev, [img.id]: url }))
      }).catch(() => {})
    })
    return () => { cancelled = true }
  }, [images, open])

  // Revoke cached object URLs on unmount
  useEffect(() => {
    return () => {
      Object.values(urlsRef.current).forEach(url => URL.revokeObjectURL(url))
    }
  }, [])

  // Escape to close
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <AnimatePresence>
      <motion.div
        className="builder-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={e => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          className="builder-panel builder-panel--gallery"
          initial={{ scale: 0.96, y: 14 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.96, y: 8, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          role="dialog"
          aria-modal="true"
          aria-label={t('presentation.aiImage.galleryTitle')}
        >
          <div className="builder-panel__header">
            <span className="builder-panel__title">{t('presentation.aiImage.galleryTitle')}</span>
            <button className="builder-panel__close-btn" onClick={onClose} aria-label={t('common.close')}>
              <X size={16} />
            </button>
          </div>

          <div className="builder-panel__body">
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-6)' }}>
                <Loader />
              </div>
            ) : images.length === 0 ? (
              <EmptyState icon={<ImagePlus size={28} />} title={t('presentation.aiImage.galleryEmpty')} />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
                {images.map(img => (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => onSelect(img.id)}
                    title={img.prompt}
                    style={{
                      padding: 0, border: '1px solid var(--border-subtle)', borderRadius: 8,
                      overflow: 'hidden', cursor: 'pointer', background: 'var(--bg-surface-2)',
                      aspectRatio: `${img.width} / ${img.height}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    {imageUrls[img.id] ? (
                      <img src={imageUrls[img.id]} alt={img.prompt} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <Loader size="sm" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  )
}
