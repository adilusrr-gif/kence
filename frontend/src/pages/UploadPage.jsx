import React, { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, FileText, Loader2, CheckCircle, FileSpreadsheet, FileImage, FileCode } from 'lucide-react'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { Inline } from '@/shared/ui/inline'
import { Stack } from '@/shared/ui/stack'
import { StatusPill } from '@/shared/ui/status-pill'
import { apiCreateSession, apiUploadDocument } from '../lib/api'
import { useToast } from '@/shared/ui/toast'
import { useEventStore } from '@/shared/stores/eventStore'

const FORMAT_ICONS = {
  '.pdf': FileText, '.docx': FileText, '.doc': FileText,
  '.pptx': FileText, '.ppt': FileText, '.xlsx': FileSpreadsheet,
  '.xls': FileSpreadsheet, '.html': FileCode, '.htm': FileCode,
  '.txt': FileText, '.png': FileImage, '.jpg': FileImage,
  '.jpeg': FileImage, '.tiff': FileImage, '.tex': FileCode,
}

const ALLOWED = [
  '.pdf', '.docx', '.pptx', '.xlsx',
  '.html', '.htm',
  '.png', '.jpg', '.jpeg', '.tiff', '.bmp',
  '.txt', '.md', '.csv', '.tex',
]

const STAGES = [
  { label: 'Загрузка', icon: '⬆' },
  { label: 'Парсинг', icon: '⚙' },
  { label: 'Извлечение', icon: '🔍' },
  { label: 'Векторизация', icon: '✦' },
]

export default function UploadPage({ sessionId, setSessionId, setDocumentName }) {
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploaded, setUploaded] = useState(false)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const [stageIdx, setStageIdx] = useState(-1)
  const [preview, setPreview] = useState(null)
  const [charCount, setCharCount] = useState(0)
  const fileInputRef = useRef(null)
  const navigate = useNavigate()
  const toast = useToast()
  const ingestEvent = useEventStore((s) => s.ingestEvent)

  const validate = f => {
    const ext = `.${f.name.split('.').pop().toLowerCase()}`
    if (!ALLOWED.includes(ext)) {
      setError('Формат не поддерживается')
      return false
    }
    return true
  }

  const pick = f => {
    if (f && validate(f)) {
      setFile(f)
      setError('')
      setUploaded(false)
      setStageIdx(-1)
    }
  }

  const handleSelect = e => pick(e.target.files[0])
  const handleDrop = e => {
    e.preventDefault()
    setDragging(false)
    pick(e.dataTransfer.files[0])
  }

  const handleUpload = async () => {
    if (!file) return
    setUploading(true)
    setError('')
    setStageIdx(0)
    ingestEvent({ type: 'DOCUMENT_UPLOADING', message: `Uploading ${file.name}…` })
    try {
      const { session_id: sid } = await apiCreateSession()
      setSessionId(sid)
      setStageIdx(1)
      const data = await apiUploadDocument(sid, file)
      setStageIdx(2)
      await new Promise(r => setTimeout(r, 500))
      setStageIdx(3)
      await new Promise(r => setTimeout(r, 600))
      setDocumentName(file.name)
      setPreview(data.preview || null)
      setCharCount(data.char_count || 0)
      setUploaded(true)
      ingestEvent({ type: 'DOCUMENT_READY', message: `Document ready: ${file.name}` })
      toast.success(`Документ загружен: ${file.name}`)
      setTimeout(() => navigate('/workspace'), 1500)
    } catch (err) {
      const msg = err.message || 'Ошибка загрузки'
      setError(msg)
      toast.error(msg)
      ingestEvent({ type: 'DOCUMENT_ERROR', message: msg })
      setStageIdx(-1)
    } finally {
      setUploading(false)
    }
  }

  const FileIcon = file
    ? (FORMAT_ICONS[`.${file.name.split('.').pop().toLowerCase()}`] || FileText)
    : Upload

  return (
    <div className="us-scene">
      <div className="us-ui">
        <motion.div
          className="us-module"
          initial={{ opacity: 0, y: 32, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          <Badge variant="accent" size="md" className="us-badge" style={{ alignSelf: 'flex-start' }}>
            <span className="us-badge__dot" />
            AI · Document Assistant
          </Badge>

          <motion.div
            className={`us-drop ${dragging ? 'us-drop--drag' : ''} ${file ? 'us-drop--has' : ''}`}
            onClick={() => !uploading && !uploaded && fileInputRef.current?.click()}
            onDragOver={e => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            animate={{ scale: dragging ? 1.02 : 1 }}
            transition={{ duration: 0.15 }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={ALLOWED.join(',')}
              onChange={handleSelect}
              className="hidden"
            />

            <AnimatePresence mode="wait">
              {file ? (
                <motion.div
                  key="file"
                  className="us-drop__content"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                >
                  <FileIcon className="us-drop__file-icon" />
                  <p className="us-drop__filename">{file.name}</p>
                  <p className="us-drop__size">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </motion.div>
              ) : (
                <motion.div
                  key="empty"
                  className="us-drop__content"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <motion.div
                    animate={{ y: [0, -5, 0] }}
                    transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
                  >
                    <Upload className="us-drop__icon" />
                  </motion.div>
                  <p className="us-drop__hint">Нажмите или перетащите файл</p>
                  <p className="us-drop__sub">PDF · DOCX · XLSX · PNG · TXT и другие</p>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
              >
                <Card
                  className="us-error"
                  style={{
                    padding: 'var(--space-3) var(--space-4)',
                    borderColor: 'color-mix(in srgb, var(--status-danger) 36%, transparent)',
                    backgroundColor: 'color-mix(in srgb, var(--status-danger) 8%, var(--bg-surface-1))',
                    color: 'var(--status-danger)',
                  }}
                >
                  {error}
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {uploading && stageIdx >= 0 && (
              <motion.div
                className="us-stages"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
              >
                <Inline gap="sm" wrap>
                  {STAGES.map((s, i) => (
                    <StatusPill
                      key={i}
                      status={i < stageIdx ? 'success' : i === stageIdx ? 'active' : 'idle'}
                      pulse={i === stageIdx}
                      label={s.label}
                      icon={
                        <span className="us-stage__icon">
                          {i < stageIdx ? '✓' : i === stageIdx ? <Loader2 size={11} className="animate-spin" /> : s.icon}
                        </span>
                      }
                    />
                  ))}
                </Inline>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div
            whileHover={!uploading && !uploaded && file ? { scale: 1.03 } : {}}
            whileTap={!uploading && !uploaded && file ? { scale: 0.97 } : {}}
          >
            <Button
              onClick={handleUpload}
              disabled={!file || uploading || uploaded}
              loading={uploading}
              block
              className="us-btn"
              leadingIcon={!uploading && uploaded ? <CheckCircle className="w-4 h-4" /> : null}
              style={{
                minHeight: '3.25rem',
                borderRadius: '1rem',
              }}
            >
              {uploading
                ? 'Обработка…'
                : uploaded
                  ? 'Готово'
                  : 'Загрузить и обработать'}
            </Button>
          </motion.div>

          <AnimatePresence>
            {uploaded && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                {preview && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    style={{ marginBottom: 12 }}
                  >
                    <Card tone="accent" style={{ padding: 'var(--space-3)' }}>
                      <Inline justify="space-between" wrap gap="sm" style={{ marginBottom: 6, fontSize: 11, opacity: 0.7 }}>
                        <span>📄 Предпросмотр извлечённого текста</span>
                        <span>{charCount.toLocaleString()} символов</span>
                      </Inline>
                      <pre
                        style={{
                          fontFamily: 'monospace',
                          fontSize: 11,
                          lineHeight: 1.5,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          maxHeight: 120,
                          overflowY: 'auto',
                          margin: 0,
                          opacity: 0.85,
                        }}
                      >
                        {preview}
                      </pre>
                    </Card>
                  </motion.div>
                )}

                <Stack gap="sm" className="us-success">
                  <Inline gap="sm" wrap>
                    <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} style={{ flex: 1 }}>
                      <Button
                        onClick={() => navigate('/chat')}
                        variant="secondary"
                        block
                        className="us-action us-action--sec"
                      >
                        💬 Чат
                      </Button>
                    </motion.div>
                    <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} style={{ flex: 1 }}>
                      <Button
                        onClick={() => navigate('/presentation')}
                        block
                        className="us-action us-action--pri"
                      >
                        📊 Презентация
                      </Button>
                    </motion.div>
                  </Inline>
                </Stack>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  )
}
