import React, { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, FileText, Loader2, CheckCircle, FileSpreadsheet, FileImage, FileCode } from 'lucide-react'
import { SplineSceneBasic } from '@/components/ui/spline-scene-demo'
import { apiCreateSession, apiUploadDocument } from '../lib/api'

const FORMAT_ICONS = {
  '.pdf': FileText, '.docx': FileText, '.doc': FileText,
  '.pptx': FileText, '.ppt': FileText, '.xlsx': FileSpreadsheet,
  '.xls': FileSpreadsheet, '.html': FileCode, '.htm': FileCode,
  '.txt': FileText, '.png': FileImage, '.jpg': FileImage,
  '.jpeg': FileImage, '.tiff': FileImage, '.tex': FileCode,
}

const ALLOWED = ['.pdf','.docx','.doc','.pptx','.ppt','.xlsx','.xls',
                 '.html','.htm','.txt','.png','.jpg','.jpeg','.tiff','.tex']

const STAGES = [
  { label: 'Загрузка',     icon: '⬆' },
  { label: 'Парсинг',      icon: '⚙' },
  { label: 'Извлечение',   icon: '🔍' },
  { label: 'Векторизация', icon: '✦' },
]

export default function UploadPage({ sessionId, setSessionId, setDocumentName }) {
  const [file,      setFile]      = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploaded,  setUploaded]  = useState(false)
  const [error,     setError]     = useState('')
  const [dragging,  setDragging]  = useState(false)
  const [stageIdx,  setStageIdx]  = useState(-1)
  const [preview,   setPreview]   = useState(null)
  const [charCount, setCharCount] = useState(0)
  const fileInputRef = useRef(null)
  const navigate     = useNavigate()

  const validate = f => {
    const ext = '.' + f.name.split('.').pop().toLowerCase()
    if (!ALLOWED.includes(ext)) { setError(`Формат не поддерживается`); return false }
    return true
  }

  const pick = f => { if (f && validate(f)) { setFile(f); setError(''); setUploaded(false); setStageIdx(-1) } }
  const handleSelect = e => pick(e.target.files[0])
  const handleDrop   = e => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files[0]) }

  const handleUpload = async () => {
    if (!file) return
    setUploading(true); setError(''); setStageIdx(0)
    try {
      const { session_id: sid } = await apiCreateSession()
      setSessionId(sid)
      setStageIdx(1)
      const data = await apiUploadDocument(sid, file)
      setStageIdx(2); await new Promise(r => setTimeout(r, 500))
      setStageIdx(3); await new Promise(r => setTimeout(r, 600))
      setDocumentName(file.name)
      setPreview(data.preview || null)
      setCharCount(data.char_count || 0)
      setUploaded(true)
    } catch (err) {
      setError(err.message || 'Ошибка загрузки'); setStageIdx(-1)
    } finally { setUploading(false) }
  }

  const FileIcon = file
    ? (FORMAT_ICONS['.' + file.name.split('.').pop().toLowerCase()] || FileText)
    : Upload

  return (
    <div className="us-scene">

      {/* ── Full-screen robot background ── */}
      <div className="us-canvas">
        <SplineSceneBasic />
      </div>

      {/* ── Floating upload module (chest level) ── */}
      <div className="us-ui">
        <motion.div
          className="us-module"
          initial={{ opacity: 0, y: 32, scale: 0.96 }}
          animate={{ opacity: 1, y: 0,  scale: 1 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          {/* Badge */}
          <div className="us-badge">
            <span className="us-badge__dot" />
            AI · Document Assistant
          </div>

          {/* Drop zone */}
          <motion.div
            className={`us-drop ${dragging ? 'us-drop--drag' : ''} ${file ? 'us-drop--has' : ''}`}
            onClick={() => !uploading && !uploaded && fileInputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            animate={{ scale: dragging ? 1.02 : 1 }}
            transition={{ duration: 0.15 }}
          >
            <input ref={fileInputRef} type="file" accept={ALLOWED.join(',')}
              onChange={handleSelect} className="hidden" />

            <AnimatePresence mode="wait">
              {file ? (
                <motion.div key="file" className="us-drop__content"
                  initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}>
                  <FileIcon className="us-drop__file-icon" />
                  <p className="us-drop__filename">{file.name}</p>
                  <p className="us-drop__size">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </motion.div>
              ) : (
                <motion.div key="empty" className="us-drop__content"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <motion.div animate={{ y: [0, -5, 0] }}
                    transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}>
                    <Upload className="us-drop__icon" />
                  </motion.div>
                  <p className="us-drop__hint">Нажмите или перетащите файл</p>
                  <p className="us-drop__sub">PDF · DOCX · XLSX · PNG и другие</p>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.p className="us-error"
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}>
                {error}
              </motion.p>
            )}
          </AnimatePresence>

          {/* Processing stages */}
          <AnimatePresence>
            {uploading && stageIdx >= 0 && (
              <motion.div className="us-stages"
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}>
                {STAGES.map((s, i) => (
                  <div key={i} className={`us-stage ${i < stageIdx ? 'done' : i === stageIdx ? 'active' : 'pending'}`}>
                    <span className="us-stage__icon">
                      {i < stageIdx  ? '✓' :
                       i === stageIdx ? <Loader2 size={11} className="animate-spin" /> :
                       s.icon}
                    </span>
                    <span className="us-stage__label">{s.label}</span>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Upload button */}
          <motion.button
            onClick={handleUpload}
            disabled={!file || uploading || uploaded}
            className="us-btn"
            whileHover={!uploading && !uploaded && file ? { scale: 1.03 } : {}}
            whileTap={!uploading && !uploaded && file ? { scale: 0.97 } : {}}
          >
            {uploading ? <><Loader2 className="animate-spin w-4 h-4" /> Обработка…</>
             : uploaded  ? <><CheckCircle className="w-4 h-4" /> Готово</>
             : 'Загрузить и обработать'}
          </motion.button>

          {/* Success actions */}
          <AnimatePresence>
            {uploaded && (
              <motion.div
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}>

                {/* Document preview */}
                {preview && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                    style={{ marginBottom: 12 }}
                  >
                    <div style={{
                      background: 'rgba(87,197,182,0.07)',
                      border: '1px solid rgba(87,197,182,0.25)',
                      borderRadius: 10,
                      padding: '10px 12px',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 11, opacity: 0.6 }}>
                        <span>📄 Предпросмотр извлечённого текста</span>
                        <span>{charCount.toLocaleString()} символов</span>
                      </div>
                      <pre style={{
                        fontFamily: 'monospace', fontSize: 11, lineHeight: 1.5,
                        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                        maxHeight: 120, overflowY: 'auto', margin: 0, opacity: 0.85,
                      }}>
                        {preview}
                      </pre>
                    </div>
                  </motion.div>
                )}

                <div className="us-success">
                  <motion.button onClick={() => navigate('/chat')} className="us-action us-action--sec"
                    whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
                    💬 Чат
                  </motion.button>
                  <motion.button onClick={() => navigate('/presentation')} className="us-action us-action--pri"
                    whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
                    📊 Презентация
                  </motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  )
}
