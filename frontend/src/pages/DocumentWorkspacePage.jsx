import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Send, Bot, User, Loader2, Copy, FileText, Check, Trash2,
  Languages, FileDown, BarChart2, GitCompare, RefreshCw,
  BookOpen, SlidersHorizontal, ChevronUp, ChevronDown,
  List, AlertTriangle, Upload, Eye, Scan,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Badge } from '@/shared/ui/badge'
import Skeleton from '@/shared/ui/skeleton/Skeleton'
import DocumentViewer from '@/widgets/document-viewer'
import {
  apiGetDocumentContent, apiTranslate, apiTranslateExport, apiDownloadPath,
  apiGetDocumentContext, apiSaveDocumentContext, apiDeleteDocumentContext,
  apiGetChatHistory, apiClearChatHistory, apiVisualDescribe,
  copyToClipboard, getBaseUrl,
} from '../lib/api'
import { streamWithEvents } from '../lib/sseAdapter'

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.tiff', '.bmp', '.webp', '.heic'])

function TypingDots() {
  return <span className="typing-dots"><span /><span /><span /></span>
}

function formatTime(ts) {
  if (!ts) return null
  const d = new Date(ts)
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

const TIPS = [
  'Краткое содержание документа',
  'Какие ключевые выводы?',
  'Перечисли все даты и события',
  'Объясни главную идею простыми словами',
]

const LANGS = [
  { code: 'kz', flag: '🇰🇿', label: 'KZ' },
  { code: 'ru', flag: '🇷🇺', label: 'RU' },
  { code: 'en', flag: '🇬🇧', label: 'EN' },
]

/* ── Extract headings from markdown for doc navigation ── */
function extractHeadings(md) {
  if (!md) return []
  const lines = md.split('\n')
  const headings = []
  lines.forEach((line, i) => {
    const m = line.match(/^(#{1,3})\s+(.+)/)
    if (m) headings.push({ level: m[1].length, text: m[2].trim(), lineIndex: i })
  })
  return headings
}

export default function DocumentWorkspacePage({ sessionId, documentName }) {
  const navigate = useNavigate()

  /* doc */
  const [markdown,   setMarkdown]   = useState('')
  const [htmlDoc,    setHtmlDoc]    = useState('')
  const [loadingDoc, setLoadingDoc] = useState(true)
  const [headings,   setHeadings]   = useState([])
  const [showToc,    setShowToc]    = useState(false)
  const docViewerRef = useRef(null)

  /* chat */
  const [messages,   setMessages]   = useState([
    { role: 'assistant', content: 'Привет! Выделите текст в документе или задайте вопрос.' },
  ])
  const [input,      setInput]      = useState('')
  const [loading,    setLoading]    = useState(false)
  const [copied,     setCopied]     = useState(null)
  const inputRef       = useRef(null)
  const messagesEndRef = useRef(null)

  /* chat mode */
  const [chatMode, setChatMode] = useState('precise') // 'precise' | 'consultation' | 'visual'

  /* visual */
  const isImageDoc = documentName ? IMAGE_EXTS.has('.' + documentName.split('.').pop().toLowerCase()) : false
  const [visualizing, setVisualizing] = useState(false)

  /* translation */
  const [translating, setTranslating] = useState(false)

  /* doc context */
  const [docContext,    setDocContext]    = useState('')
  const [ctxSaving,    setCtxSaving]    = useState(false)
  const [ctxSaved,     setCtxSaved]     = useState(false)
  const [showCtx,      setShowCtx]      = useState(false)

  /* ── Load document ── */
  useEffect(() => {
    if (!sessionId) { setLoadingDoc(false); return }
    setLoadingDoc(true)
    apiGetDocumentContent(sessionId)
      .then(d => {
        const md = d.markdown || ''
        setMarkdown(md)
        setHtmlDoc(d.html || '')
        setHeadings(extractHeadings(md))
      })
      .catch(() => { setMarkdown(''); setHtmlDoc('') })
      .finally(() => setLoadingDoc(false))
  }, [sessionId])

  /* ── Load chat history on session open ── */
  useEffect(() => {
    if (!sessionId) return
    apiGetChatHistory(sessionId, 20)
      .then((data) => {
        const msgs = data?.messages || []
        if (msgs.length === 0) return
        const historical = msgs.map((m) => ({ role: m.role, content: m.content, historical: true }))
        setMessages([
          ...historical,
          { role: 'divider' },
          { role: 'assistant', content: 'Привет! Выделите текст в документе или задайте вопрос.' },
        ])
      })
      .catch(() => {})
  }, [sessionId])

  /* ── Load doc context ── */
  const loadDocContext = useCallback(async () => {
    if (!documentName) { setDocContext(''); return }
    try { const d = await apiGetDocumentContext(documentName); setDocContext(d.context || '') }
    catch { setDocContext('') }
  }, [documentName])
  useEffect(() => { loadDocContext() }, [loadDocContext])

  /* ── Scroll messages to bottom ── */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  /* ── Text selection → fill input ── */
  const handleSelection = (text) => {
    const snippet = text.slice(0, 120) + (text.length > 120 ? '…' : '')
    setInput(`[Контекст: "${snippet}"]\n`)
    inputRef.current?.focus()
  }

  /* ── Doc heading navigation ── */
  const scrollToHeading = (idx) => {
    setShowToc(false)
    const container = docViewerRef.current
    if (!container) return
    // Find heading element by text content
    const headingEls = container.querySelectorAll('h1,h2,h3,h4,h5,h6')
    const h = headings[idx]
    if (!h) return
    for (const el of headingEls) {
      if (el.textContent.trim() === h.text) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        return
      }
    }
  }

  const scrollDocBy = (dir) => {
    const container = docViewerRef.current
    if (!container) return
    container.scrollBy({ top: dir * container.clientHeight * 0.8, behavior: 'smooth' })
  }

  /* ── Visual describe ── */
  const handleVisualDescribe = async () => {
    if (!sessionId || visualizing) return
    setVisualizing(true)
    setMessages(prev => [...prev,
      { role: 'user', content: 'Описать изображение подробно', ts: Date.now() },
      { role: 'assistant', content: '', status: 'typing', streaming: true },
    ])
    try {
      const data = await apiVisualDescribe(sessionId)
      setMessages(prev => {
        const m = [...prev]
        m[m.length - 1] = { role: 'assistant', content: data.description, streaming: false, ts: Date.now() }
        return m
      })
    } catch (err) {
      setMessages(prev => {
        const m = [...prev]
        m[m.length - 1] = { role: 'assistant', content: `Ошибка: ${err.message}`, streaming: false, isError: true }
        return m
      })
    } finally { setVisualizing(false) }
  }

  /* ── Clear history ── */
  const handleClearHistory = async () => {
    if (!sessionId) return
    await apiClearChatHistory(sessionId).catch(() => {})
    setMessages([{ role: 'assistant', content: 'Привет! Выделите текст в документе или задайте вопрос.' }])
  }

  /* ── Send chat message ── */
  const handleSend = async () => {
    if (!input.trim() || loading) return
    const question = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: question, ts: Date.now() }])
    setLoading(true)
    setMessages(prev => [...prev, { role: 'assistant', content: '', status: 'typing', streaming: true }])

    const streamUrl = chatMode === 'visual' && isImageDoc
      ? `${getBaseUrl()}/api/chat/visual-stream?session_id=${sessionId}&question=${encodeURIComponent(question)}`
      : null

    await streamWithEvents(sessionId, question, {
      mode: chatMode === 'visual' ? 'precise' : chatMode,
      customUrl: streamUrl,
      onStatus: (status) => setMessages(prev => { const m=[...prev]; m[m.length-1]={...m[m.length-1],status}; return m }),
      onChunk:  (_, full) => setMessages(prev => { const m=[...prev]; m[m.length-1]={...m[m.length-1],content:full,status:null}; return m }),
      onDone:   (full)    => setMessages(prev => { const m=[...prev]; m[m.length-1]={role:'assistant',content:full,streaming:false,ts:Date.now()}; return m }),
      onError:  (err)     => setMessages(prev => { const m=[...prev]; m[m.length-1]={role:'assistant',content:'Ошибка: '+(err.message||'—'),streaming:false,isError:true}; return m }),
    })
    setLoading(false)
  }

  /* ── Translate ── */
  const handleTranslate = async (lang) => {
    if (translating || !sessionId) return
    setTranslating(lang)
    const names = { kz: 'Казахский', ru: 'Русский', en: 'English' }
    setMessages(prev => [...prev, { role: 'user', content: `Перевести документ на ${names[lang]}` }])
    try {
      const data = await apiTranslate(sessionId, lang)
      setMessages(prev => [...prev, { role: 'assistant', content: data.translated }])
    } catch(err) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Ошибка перевода: '+(err.message||'—'), isError: true }])
    } finally { setTranslating(false) }
  }

  const handleExport = async (lang, fmt) => {
    if (!sessionId) return
    setLoading(true)
    try {
      const meta = await apiTranslateExport(sessionId, lang, fmt)
      const blob = await apiDownloadPath(meta.download_url)
      const url  = window.URL.createObjectURL(blob)
      const a = Object.assign(document.createElement('a'), { href: url, download: `translated_${lang}.${fmt}` })
      document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(url)
      setMessages(prev => [...prev, { role: 'assistant', content: `Экспорт (${lang.toUpperCase()}, ${fmt.toUpperCase()}) скачан.` }])
    } catch(err) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Ошибка экспорта: '+(err.message||'—'), isError: true }])
    } finally { setLoading(false) }
  }

  /* ── Save context ── */
  const handleCtxSave = async () => {
    if (!documentName) return
    setCtxSaving(true)
    try {
      if (docContext.trim()) await apiSaveDocumentContext(documentName, docContext.trim())
      else await apiDeleteDocumentContext(documentName).catch(() => {})
      setCtxSaved(true); setTimeout(() => setCtxSaved(false), 2500)
    } catch { /* ignore */ } finally { setCtxSaving(false) }
  }

  /* ── Render ── */
  return (
    <div className="ws-root">

      {/* ══════════ LEFT — Document ══════════ */}
      <div className="ws-doc-panel">

        {/* Doc header */}
        <div className="ws-panel-header">
          <FileText size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <span className="ws-panel-title">{documentName || 'Документ'}</span>
          {!loadingDoc && markdown && (
            <Badge variant="neutral" size="sm" style={{ marginLeft: 4 }}>
              {markdown.length.toLocaleString()} симв.
            </Badge>
          )}

          {/* Doc navigation */}
          <div className="ws-doc-nav">
            {headings.length > 0 && (
              <div style={{ position: 'relative' }}>
                <button
                  className="ws-doc-nav-btn"
                  onClick={() => setShowToc(v => !v)}
                  title="Оглавление"
                >
                  <List size={13} />
                </button>
                <AnimatePresence>
                  {showToc && (
                    <motion.div
                      className="ws-toc-dropdown"
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.13 }}
                    >
                      {headings.map((h, i) => (
                        <button
                          key={i}
                          className="ws-toc-item"
                          style={{ paddingLeft: 8 + (h.level - 1) * 12 }}
                          onClick={() => scrollToHeading(i)}
                        >
                          {h.text}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
            <button className="ws-doc-nav-btn" onClick={() => scrollDocBy(-1)} title="Вверх">
              <ChevronUp size={13} />
            </button>
            <button className="ws-doc-nav-btn" onClick={() => scrollDocBy(1)} title="Вниз">
              <ChevronDown size={13} />
            </button>
          </div>
        </div>

        {/* Doc body */}
        <div className="ws-doc-body">
          {loadingDoc
            ? <div className="ws-loading" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '20px 24px' }}>
                <Skeleton height="18px" width="70%" />
                <Skeleton height="14px" />
                <Skeleton height="14px" width="90%" />
                <Skeleton height="14px" width="80%" />
                <Skeleton height="18px" width="55%" style={{ marginTop: 8 }} />
                <Skeleton height="14px" />
                <Skeleton height="14px" width="85%" />
                <Skeleton height="14px" width="60%" />
              </div>
            : !sessionId
              ? <div className="ws-empty">
                  <FileText size={32} style={{ opacity: 0.2, marginBottom: 8 }} />
                  <p>Загрузите документ для просмотра</p>
                  <button className="ws-empty-btn" onClick={() => navigate('/upload')}>
                    <Upload size={13} /> Загрузить
                  </button>
                </div>
              : isImageDoc
                ? (
                  <div className="ws-image-preview">
                    <img
                      src={`${getBaseUrl()}/api/documents/${sessionId}/file`}
                      alt={documentName}
                      className="ws-image-preview__img"
                      onError={(e) => { e.target.style.display = 'none' }}
                    />
                    {markdown && (
                      <details className="ws-image-preview__ocr">
                        <summary>Извлечённый текст / OCR</summary>
                        <pre className="ws-image-preview__ocr-text">{markdown}</pre>
                      </details>
                    )}
                  </div>
                )
                : <DocumentViewer ref={docViewerRef} markdown={markdown} html={htmlDoc} onSelection={handleSelection} />
          }
        </div>
      </div>

      {/* ══════════ RIGHT — Chat ══════════ */}
      <div className="ws-chat-panel">

        {/* Chat header */}
        <div className="ws-panel-header">
          <Bot size={13} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
          <span className="ws-panel-title">AI-ассистент</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
            {messages.length > 1 && (
              <button className="ws-action-btn" onClick={handleClearHistory} title="Очистить историю">
                <Trash2 size={11} />
              </button>
            )}
            <button className="ws-action-btn" onClick={() => navigate('/compare')} title="Сравнение">
              <GitCompare size={11} />
            </button>
            <button className="ws-action-btn" onClick={() => navigate('/convert')} title="Конвертер">
              <RefreshCw size={11} />
            </button>
            <button className="ws-action-btn ws-action-btn--blue" onClick={() => navigate('/presentation')} title="Презентация">
              <BarChart2 size={11} />
            </button>
            <button
              className={`ws-action-btn${showCtx ? ' ws-action-btn--active' : ''}`}
              onClick={() => setShowCtx(v => !v)}
              title="Контекст документа"
            >
              <BookOpen size={11} />
            </button>
            <button className="ws-action-btn" onClick={() => navigate('/ai-settings')} title="Настройки промпта">
              <SlidersHorizontal size={11} />
            </button>
          </div>
        </div>

        {/* Translation bar */}
        <div className="ws-translate-bar">
          <Languages size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <span className="ws-translate-label">Перевод:</span>
          {LANGS.map(l => (
            <div key={l.code} className="ws-lang-group">
              <button
                className={`ws-lang-btn${translating === l.code ? ' ws-lang-btn--active' : ''}`}
                onClick={() => handleTranslate(l.code)}
                disabled={!!translating || loading || !sessionId}
              >
                {translating === l.code
                  ? <Loader2 size={10} className="animate-spin" />
                  : l.flag} {l.label}
              </button>
              <div className="ws-export-wrap">
                <button className="ws-export-btn" disabled={!sessionId || loading} title="Скачать">
                  <FileDown size={11} />
                </button>
                <div className="ws-export-menu">
                  {['txt','md','docx'].map(fmt => (
                    <button key={fmt} className="ws-export-item" onClick={() => handleExport(l.code, fmt)}>
                      {fmt.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Messages — flex-end so they stack from bottom */}
        <div className="ws-messages">
          <div className="ws-messages-inner">
            {messages.map((msg, i) => {
              if (msg.role === 'divider') {
                return <div key={i} className="ws-history-divider">Предыдущий сеанс</div>
              }
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18 }}
                  className={`ws-msg${msg.role === 'user' ? ' ws-msg--user' : ''}`}
                >
                  <div className={`ws-avatar${msg.role === 'user' ? ' ws-avatar--user' : ''}`}>
                    {msg.role === 'user' ? <User size={13} color="#fff" /> : <Bot size={13} style={{ color: 'var(--accent-primary)' }} />}
                  </div>
                  <div className={`ws-bubble${msg.role === 'user' ? ' ws-bubble--user' : ' ws-bubble--bot'}${msg.isError ? ' ws-bubble--error' : ''}`}>
                    {msg.status === 'typing' && !msg.content
                      ? <TypingDots />
                      : msg.status && !msg.content
                        ? <span style={{ opacity: 0.5, fontStyle: 'italic' }}>{msg.status}</span>
                        : msg.role === 'assistant' && msg.content
                          ? <div className="chat-md"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{ table: ({node, ...p}) => <div className="table-wrap"><table {...p} /></div> }}>{msg.content}</ReactMarkdown></div>
                          : <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
                    }
                    {msg.streaming && msg.content && <Loader2 size={11} className="animate-spin" style={{ marginLeft: 4, display: 'inline-block', opacity: 0.5 }} />}
                    {msg.role === 'assistant' && msg.content && !msg.streaming && (
                      <button className="ws-copy-btn ws-bubble__copy" onClick={() => { copyToClipboard(msg.content); setCopied(i); setTimeout(() => setCopied(null), 1800) }}>
                        {copied === i ? <Check size={10} /> : <Copy size={10} />}
                      </button>
                    )}
                    {msg.ts && !msg.historical && (
                      <div className="ws-msg-time">{formatTime(msg.ts)}</div>
                    )}
                  </div>
                </motion.div>
              )
            })}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input area — at bottom with tips above textarea */}
        <div className="ws-input-area">
          {!sessionId ? (
            <button className="ws-no-session" onClick={() => navigate('/upload')}>
              <AlertTriangle size={13} />
              Сначала загрузите документ
            </button>
          ) : (
            <>
              {/* Mode toggle + Tips chips */}
              <div className="ws-tips-row">
                <div className="ws-mode-toggle">
                  <button
                    className={`ws-mode-btn${chatMode === 'precise' ? ' ws-mode-btn--active' : ''}`}
                    onClick={() => setChatMode('precise')}
                    title="Строгий ответ только по содержимому документа"
                  >
                    Точный ответ
                  </button>
                  <button
                    className={`ws-mode-btn${chatMode === 'consultation' ? ' ws-mode-btn--active' : ''}`}
                    onClick={() => setChatMode('consultation')}
                    title="Развёрнутая консультация с интерпретацией"
                  >
                    Консультация
                  </button>
                  {isImageDoc && (
                    <button
                      className={`ws-mode-btn ws-mode-btn--vision${chatMode === 'visual' ? ' ws-mode-btn--active' : ''}`}
                      onClick={() => setChatMode('visual')}
                      title="Визуальный анализ изображения через VLM"
                    >
                      <Eye size={11} style={{ marginRight: 3 }} />
                      Визуальный
                    </button>
                  )}
                </div>
                {isImageDoc && chatMode === 'visual'
                  ? (
                    <>
                      <button className="ws-tip ws-tip--vision" onClick={handleVisualDescribe} disabled={visualizing}>
                        <Scan size={10} style={{ marginRight: 3 }} />
                        {visualizing ? 'Анализирую…' : 'Описать изображение'}
                      </button>
                      <button className="ws-tip" onClick={() => { setInput('Что изображено на этом документе?'); inputRef.current?.focus() }}>Что здесь изображено?</button>
                      <button className="ws-tip" onClick={() => { setInput('Извлеки весь текст с изображения'); inputRef.current?.focus() }}>Извлечь текст</button>
                      <button className="ws-tip" onClick={() => { setInput('Опиши данные из таблицы или графика'); inputRef.current?.focus() }}>Данные из таблицы/графика</button>
                    </>
                  )
                  : TIPS.map((t, i) => (
                    <button key={i} className="ws-tip" onClick={() => { setInput(t); inputRef.current?.focus() }}>{t}</button>
                  ))
                }
              </div>

              {/* Textarea + send */}
              <div className="ws-input-bar">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                  placeholder="Задайте вопрос по документу… (Enter — отправить)"
                  rows={2}
                  className="ws-textarea"
                  disabled={loading}
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || loading}
                  className={`ws-send-btn${input.trim() && !loading ? ' ws-send-btn--active' : ''}`}
                >
                  {loading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                </button>
              </div>

              {/* Doc context (collapsible) */}
              <AnimatePresence>
                {showCtx && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    style={{ overflow: 'hidden' }}
                  >
                    <div className="ws-ctx-panel">
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, lineHeight: 1.4 }}>
                        Опишите документ — ИИ учтёт это при ответах
                      </p>
                      <textarea
                        value={docContext}
                        onChange={e => { setDocContext(e.target.value); setCtxSaved(false) }}
                        placeholder="Например: договор аренды 2025, стороны — ТОО «Алмаз» и Иванов А.А."
                        rows={3}
                        className="ws-ctx-textarea"
                      />
                      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                        <button className={`ws-ctx-save${ctxSaved ? ' ws-ctx-save--saved' : ''}`} onClick={handleCtxSave} disabled={ctxSaving}>
                          {ctxSaved ? <><Check size={10} /> Сохранено</> : ctxSaving ? '…' : 'Сохранить'}
                        </button>
                        {docContext && (
                          <button className="ws-ctx-clear" onClick={async () => { setDocContext(''); if (documentName) await apiDeleteDocumentContext(documentName).catch(() => {}) }}>
                            Очистить
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
        </div>

      </div>
    </div>
  )
}
