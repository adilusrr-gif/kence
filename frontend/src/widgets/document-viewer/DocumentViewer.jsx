import React, { forwardRef, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageSquare } from 'lucide-react'
import DOMPurify from 'dompurify'

const DocumentViewer = forwardRef(function DocumentViewer({ markdown = '', html = '', onSelection }, outerRef) {
  const [MD, setMD] = useState(null)
  const [remarkGfm, setRemarkGfm] = useState(null)
  const [pill, setPill] = useState(null)
  const innerRef = useRef(null)
  // Use outer ref if provided, otherwise inner
  const containerRef = outerRef || innerRef

  useEffect(() => {
    Promise.all([
      import('react-markdown').then(m => m.default),
      import('remark-gfm').then(m => m.default),
    ]).then(([md, gfm]) => {
      setMD(() => md)
      setRemarkGfm(() => gfm)
    })
  }, [])

  useEffect(() => {
    const handleUp = () => {
      const sel = window.getSelection()
      const text = sel?.toString().trim()
      if (!text || text.length < 4) { setPill(null); return }
      const range = sel.getRangeAt(0)
      const rect = range.getBoundingClientRect()
      const container = containerRef.current?.getBoundingClientRect()
      if (!container) return
      setPill({
        text,
        x: rect.left + rect.width / 2 - container.left,
        y: rect.top - container.top - 36,
      })
    }
    document.addEventListener('mouseup', handleUp)
    return () => document.removeEventListener('mouseup', handleUp)
  }, [])

  const handleAsk = () => {
    if (pill?.text && onSelection) {
      onSelection(pill.text)
      setPill(null)
      window.getSelection()?.removeAllRanges()
    }
  }

  const hasHtml = html && html.trim().length > 0
  const hasContent = hasHtml || (markdown && markdown.trim().length > 0)

  return (
    <div
      ref={containerRef}
      className="dv-root"
      style={{ position: 'relative', height: '100%', overflowY: 'auto', padding: '1.5rem 2rem' }}
    >
      <AnimatePresence>
        {pill && (
          <motion.button
            key="pill"
            initial={{ opacity: 0, scale: 0.85, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={{ duration: 0.15 }}
            onClick={handleAsk}
            style={{
              position: 'absolute',
              left: Math.max(8, Math.min(pill.x - 72, 9999)),
              top: Math.max(8, pill.y),
              zIndex: 40,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 12px',
              borderRadius: 20,
              background: 'var(--accent-primary)',
              color: '#fff',
              fontSize: 12,
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
              whiteSpace: 'nowrap',
            }}
          >
            <MessageSquare size={12} />
            Спросить AI
          </motion.button>
        )}
      </AnimatePresence>

      {!hasContent && (
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: '3rem', fontSize: 14 }}>
          Документ загружается…
        </div>
      )}

      {/* HTML рендеринг — если есть HTML от Docling (с картинками) */}
      {hasHtml && (
        <div
          className="dv-html-content"
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html, { ADD_TAGS: ['style'] }) }}
        />
      )}

      {/* Markdown fallback — если HTML отсутствует */}
      {!hasHtml && markdown && MD && remarkGfm && (
        <div
          className="dv-content"
          style={{
            fontSize: 14,
            lineHeight: 1.75,
            color: 'var(--text-primary)',
            maxWidth: '72ch',
            margin: '0 auto',
          }}
        >
          <MD remarkPlugins={[remarkGfm]}>{markdown}</MD>
        </div>
      )}

      {!hasHtml && markdown && !MD && (
        <pre
          style={{
            fontSize: 13,
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            color: 'var(--text-primary)',
          }}
        >
          {markdown}
        </pre>
      )}
    </div>
  )
})

export default DocumentViewer
