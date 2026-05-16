import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Send, Bot, User, Loader2, Languages, FileDown, FileText, Copy, BarChart2, GitCompare, RefreshCw, AlertTriangle, Upload, BookOpen, Check, SlidersHorizontal } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { apiTranslate, apiTranslateExport, apiDownloadPath, apiGetDocumentContext, apiSaveDocumentContext, apiDeleteDocumentContext, copyToClipboard } from '../lib/api'
import { streamChat } from '../lib/streamChat'

const TIPS = [
  'Краткое содержание документа',
  'Какие ключевые выводы?',
  'Перечисли все даты и события',
]

export default function ChatPage({ sessionId, documentName }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Привет! Задайте вопрос по загруженному документу.', confidence: null },
  ])
  const [input,       setInput]       = useState('')
  const [loading,     setLoading]     = useState(false)
  const [translating, setTranslating] = useState(false)
  const [docContext,     setDocContext]     = useState('')
  const [contextSaving,  setContextSaving]  = useState(false)
  const [contextSaved,   setContextSaved]   = useState(false)
  const messagesEndRef = useRef(null)
  const navigate       = useNavigate()

  const loadDocContext = useCallback(async () => {
    if (!documentName) { setDocContext(''); return }
    try {
      const data = await apiGetDocumentContext(documentName)
      setDocContext(data.context || '')
    } catch { setDocContext('') }
  }, [documentName])

  useEffect(() => { loadDocContext() }, [loadDocContext])

  const handleContextSave = async () => {
    if (!documentName) return
    setContextSaving(true)
    try {
      if (docContext.trim()) {
        await apiSaveDocumentContext(documentName, docContext.trim())
      } else {
        await apiDeleteDocumentContext(documentName).catch(() => {})
      }
      setContextSaved(true)
      setTimeout(() => setContextSaved(false), 2500)
    } catch { /* ignore */ } finally {
      setContextSaving(false)
    }
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || loading) return
    const question = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: question }])
    setLoading(true)

    setMessages(prev => [...prev, {
      role: 'assistant', content: '', status: '…', streaming: true, confidence: null,
    }])

    await streamChat(sessionId, question, {
      onStatus: (status) => setMessages(prev => { const m=[...prev]; m[m.length-1]={...m[m.length-1],status}; return m }),
      onChunk:  (_, full) => setMessages(prev => { const m=[...prev]; m[m.length-1]={...m[m.length-1],content:full,status:null}; return m }),
      onDone:   (full)    => setMessages(prev => { const m=[...prev]; m[m.length-1]={role:'assistant',content:full,confidence:null,streaming:false}; return m }),
      onError:  (err)     => setMessages(prev => { const m=[...prev]; m[m.length-1]={role:'assistant',content:'Ошибка: '+(err.message||'—'),confidence:null,streaming:false,isError:true}; return m }),
    })
    setLoading(false)
  }

  const handleTranslate = async (lang) => {
    if (translating) return
    setTranslating(lang)
    const langNames = { kz: '🇰🇿 Казахский', ru: '🇷🇺 Русский', en: '🇬🇧 English' }
    setMessages(prev => [...prev, { role: 'user', content: `Перевести документ на ${langNames[lang]}` }])
    try {
      const data = await apiTranslate(sessionId, lang)
      setMessages(prev => [...prev, { role: 'assistant', content: data.translated, confidence: null }])
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Ошибка перевода: ' + (err.message || '—'), confidence: null, isError: true }])
    } finally { setTranslating(false) }
  }

  const handleExport = async (lang, format) => {
    if (!sessionId) return
    setLoading(true)
    try {
      const meta = await apiTranslateExport(sessionId, lang, format)
      const blob = await apiDownloadPath(meta.download_url)
      const url  = window.URL.createObjectURL(blob)
      const a    = Object.assign(document.createElement('a'), { href: url, download: `translated_${lang}.${format}` })
      document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(url)
      setMessages(prev => [...prev, { role: 'assistant', content: `Экспорт (${lang.toUpperCase()}, ${format.toUpperCase()}) скачан.`, confidence: null }])
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Ошибка экспорта: ' + (err.message || '—'), confidence: null, isError: true }])
    } finally { setLoading(false) }
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const LANGS = [
    { code: 'kz', label: '🇰🇿 KZ' },
    { code: 'ru', label: '🇷🇺 RU' },
    { code: 'en', label: '🇬🇧 EN' },
  ]

  return (
    <div className="chat-v2">

      {/* ── Main chat column ── */}
      <div className="chat-v2-main">

        {/* Header */}
        <div className="chat-v2-header">
          <div className="chat-v2-header-left">
            <span className="chat-v2-title">Чат с документом</span>
            {sessionId && documentName && (
              <span className="chat-v2-doc-badge">
                <FileText size={10} />
                {documentName}
              </span>
            )}
          </div>
          <div className="chat-v2-header-actions">
            <button className="chat-v2-action-btn" onClick={() => navigate('/convert')}>
              <RefreshCw size={12} />
              Конвертер
            </button>
            <button className="chat-v2-action-btn chat-v2-action-btn--blue" onClick={() => navigate('/presentation')}>
              <BarChart2 size={12} />
              Презентация
            </button>
            <button
              className="chat-v2-action-btn"
              onClick={() => navigate('/ai-settings')}
              title="Настройки промпта"
              aria-label="Настройки AI"
            >
              <SlidersHorizontal size={12} />
              Промпт
            </button>
          </div>
        </div>

        {/* Translation bar */}
        <div className="chat-v2-translate">
          <span className="chat-v2-translate-label">
            <Languages size={13} />
            Перевод документа:
          </span>
          {LANGS.map((l) => (
            <div key={l.code} className="chat-v2-lang-group">
              <button
                className={`chat-v2-lang-btn${translating === l.code ? ' chat-v2-lang-btn--active' : ''}`}
                onClick={() => handleTranslate(l.code)}
                disabled={!!translating || loading || !sessionId}
              >
                {translating === l.code
                  ? <><Loader2 size={11} style={{ animation: 'spin 0.7s linear infinite' }} /> {l.label}</>
                  : l.label}
              </button>
              <div className="chat-v2-export-wrap">
                <button className="chat-v2-export-btn" disabled={loading || !sessionId} title="Скачать перевод">
                  <FileDown size={13} />
                </button>
                <div className="chat-v2-export-menu">
                  {['txt', 'md', 'docx'].map((fmt) => (
                    <button key={fmt} className="chat-v2-export-item" onClick={() => handleExport(l.code, fmt)}>
                      {fmt.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Messages */}
        <div className="chat-v2-messages" role="log" aria-label="История чата" aria-live="polite">
          {messages.map((msg, i) => (
            <div key={i} className={`chat-v2-msg${msg.role === 'user' ? ' chat-v2-msg--user' : ''}`}>
              <div className={`chat-v2-avatar${msg.role === 'user' ? ' chat-v2-avatar--user' : ' chat-v2-avatar--bot'}`}>
                {msg.role === 'user'
                  ? <User size={15} />
                  : <Bot size={15} />}
              </div>
              <div className="chat-v2-bubble-wrap">
                <div className={`chat-v2-bubble${msg.role === 'user' ? ' chat-v2-bubble--user' : ' chat-v2-bubble--bot'}${msg.isError ? '' : ''}`}
                  style={msg.isError ? { borderColor: 'rgba(248,113,113,0.25)', color: '#fca5a5' } : {}}>
                  {msg.streaming && !msg.content
                    ? <span style={{ opacity: 0.5 }}>{msg.status || '…'}</span>
                    : <>
                        {msg.role === 'assistant' && msg.content
                          ? <div className="chat-md">
                              <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ table: ({node, ...p}) => <div className="table-wrap"><table {...p} /></div> }}>{msg.content}</ReactMarkdown>
                            </div>
                          : msg.content
                        }
                        {msg.streaming && (
                          <span style={{ display: 'inline-block', width: 2, height: '1em', background: 'currentColor', marginLeft: 2, verticalAlign: 'text-bottom', animation: 'chat-cursor-blink 0.7s steps(1) infinite' }} />
                        )}
                      </>
                  }
                </div>
                {msg.role === 'assistant' && msg.content && !msg.streaming && (
                  <div className="chat-v2-meta">
                    <button className="chat-v2-copy" onClick={() => copyToClipboard(msg.content)} title="Копировать" aria-label="Копировать ответ">
                      <Copy size={11} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && !messages[messages.length - 1]?.streaming && (
            <div className="chat-v2-msg">
              <div className="chat-v2-avatar chat-v2-avatar--bot"><Bot size={15} /></div>
              <div className="chat-v2-bubble chat-v2-bubble--bot chat-v2-bubble--typing">
                <span className="chat-v2-typing-dot" />
                <span className="chat-v2-typing-dot" />
                <span className="chat-v2-typing-dot" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="chat-v2-input-area">
          {!sessionId ? (
            <button className="chat-v2-no-session" onClick={() => navigate('/upload')}>
              <AlertTriangle size={14} />
              Сначала загрузите документ — нажмите для перехода к загрузке
            </button>
          ) : (
            <div className="chat-v2-input-bar">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Введите вопрос по документу…"
                rows={1}
                className="chat-v2-input"
                disabled={loading}
                aria-label="Сообщение"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || loading}
                className="chat-v2-send-btn"
                aria-label="Отправить"
              >
                <Send size={16} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Document sidebar ── */}
      <div className="chat-v2-sidebar">

        {/* Document info */}
        <div className="chat-v2-sidebar-section">
          <div className="chat-v2-sidebar-title">Документ</div>
          {sessionId ? (
            <div className="chat-v2-doc-card">
              <div className="chat-v2-doc-name">{documentName || 'Документ загружен'}</div>
              <div className="chat-v2-doc-row">
                <span className="chat-v2-doc-key">Сессия</span>
                <span className="chat-v2-doc-val" style={{ fontFamily: 'monospace', fontSize: '0.65rem' }}>
                  {sessionId.slice(0, 8)}…
                </span>
              </div>
              <div className="chat-v2-doc-row">
                <span className="chat-v2-doc-key">Статус</span>
                <span className="chat-v2-doc-val chat-v2-doc-val--ok">● Активен</span>
              </div>
            </div>
          ) : (
            <div className="chat-v2-empty-doc">
              <FileText size={24} style={{ opacity: 0.35 }} />
              <span>Документ не загружен</span>
              <button className="dash-empty-cta-btn" onClick={() => navigate('/upload')} style={{ fontSize: '0.72rem' }}>
                <Upload size={12} />
                Загрузить
              </button>
            </div>
          )}
        </div>

        {/* Quick actions */}
        {sessionId && (
          <div className="chat-v2-sidebar-section">
            <div className="chat-v2-sidebar-title">Действия</div>
            <div className="chat-v2-doc-actions">
              <button className="chat-v2-doc-action" onClick={() => navigate('/presentation')}>
                <BarChart2 size={13} />
                Создать презентацию
              </button>
              <button className="chat-v2-doc-action" onClick={() => navigate('/compare')}>
                <GitCompare size={13} />
                Сравнить документы
              </button>
              <button className="chat-v2-doc-action" onClick={() => navigate('/convert')}>
                <RefreshCw size={13} />
                Конвертировать
              </button>
            </div>
          </div>
        )}

        {/* Document context */}
        {sessionId && (
          <div className="chat-v2-sidebar-section">
            <div className="chat-v2-sidebar-title" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <BookOpen size={12} />
              Контекст документа
            </div>
            <div style={{ fontSize: 11, opacity: 0.55, marginBottom: 6, lineHeight: 1.4 }}>
              Опишите документ — ИИ будет учитывать это при ответах
            </div>
            <textarea
              value={docContext}
              onChange={e => { setDocContext(e.target.value); setContextSaved(false) }}
              placeholder="Например: Это договор аренды на 2025 год. Стороны — ТОО «Алмаз» и физлицо Иванов А.А."
              aria-label="Контекст документа для ИИ"
              rows={4}
              style={{
                width: '100%', boxSizing: 'border-box', resize: 'vertical',
                padding: '0.5rem 0.65rem', borderRadius: 8,
                border: '1px solid var(--border, #d1d5db)',
                background: 'var(--input-bg, #f9fafb)', color: 'inherit',
                fontSize: 12, lineHeight: 1.5, outline: 'none',
                fontFamily: 'inherit',
              }}
            />
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <button
                onClick={handleContextSave}
                disabled={contextSaving}
                aria-label="Сохранить контекст документа"
                style={{
                  flex: 1, padding: '0.4rem 0.6rem', borderRadius: 7, border: 'none',
                  background: contextSaved
                    ? '#d1fae5' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  color: contextSaved ? '#065f46' : '#fff',
                  fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                  transition: 'all 0.2s',
                }}
              >
                {contextSaved
                  ? <><Check size={11} /> Сохранено</>
                  : contextSaving ? '…' : 'Сохранить'}
              </button>
              {docContext && (
                <button
                  onClick={async () => {
                    setDocContext('')
                    setContextSaved(false)
                    if (documentName) {
                      await apiDeleteDocumentContext(documentName).catch(() => {})
                    }
                  }}
                  aria-label="Очистить контекст документа"
                  style={{
                    padding: '0.4rem 0.65rem', borderRadius: 7,
                    border: '1px solid var(--border, #e5e7eb)',
                    background: 'transparent', color: 'inherit',
                    fontSize: 12, cursor: 'pointer', opacity: 0.7,
                  }}
                >
                  Очистить
                </button>
              )}
            </div>
          </div>
        )}

        {/* Tips */}
        <div className="chat-v2-sidebar-section">
          <div className="chat-v2-sidebar-title">Примеры вопросов</div>
          <div className="chat-v2-tips">
            {TIPS.map((tip, i) => (
              <button key={i} className="chat-v2-tip" onClick={() => setInput(tip)}>
                {tip}
              </button>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
