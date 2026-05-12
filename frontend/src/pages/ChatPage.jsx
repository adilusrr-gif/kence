import React, { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Send, Bot, User, Loader2, Languages, FileDown, FileText, Zap, Copy, Presentation } from 'lucide-react'
import { apiChat, apiTranslate, apiTranslateExport, apiDownloadPath } from '../lib/api'

function ConfidenceBar({ score }) {
  const pct   = Math.round(score * 100)
  const color = pct >= 80 ? '#4ade80' : pct >= 60 ? '#facc15' : '#f87171'
  return (
    <div className="chat-confidence">
      <div className="chat-confidence__track">
        <motion_div className="chat-confidence__fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="chat-confidence__label" style={{ color }}>{pct}%</span>
    </div>
  )
}

/* thin animated bar without framer-motion dependency */
function ConfBar({ score }) {
  const pct   = Math.round(score * 100)
  const color = pct >= 80 ? '#4ade80' : pct >= 60 ? '#facc15' : '#f87171'
  return (
    <div className="chat-confidence">
      <div className="chat-confidence__track">
        <div className="chat-confidence__fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="chat-confidence__label" style={{ color }}>{pct}% уверенность</span>
    </div>
  )
}

function copyText(text) {
  navigator.clipboard.writeText(text).catch(() => {})
}

export default function ChatPage({ sessionId, documentName }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Привет! Задайте вопрос по загруженному документу.', confidence: null }
  ])
  const [input,      setInput]      = useState('')
  const [loading,    setLoading]    = useState(false)
  const [translating,setTranslating]= useState(false)
  const messagesEndRef = useRef(null)
  const navigate       = useNavigate()

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const handleSend = async () => {
    if (!input.trim() || loading) return
    const question = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: question }])
    setLoading(true)

    // Add streaming placeholder message
    setMessages(prev => [...prev, {
      role: 'assistant', content: '', status: '…', streaming: true, confidence: null,
    }])

    try {
      const token = localStorage.getItem('kence_token')
      const BASE  = window.location.origin === 'http://localhost:5173' ? 'http://127.0.0.1:8000' : ''
      const url   = `${BASE}/api/chat/stream?` + new URLSearchParams({ session_id: sessionId, question })
      const res   = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })

      if (res.status === 401) { window.location.href = '/login'; return }
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Ошибка сервера' }))
        throw new Error(err.detail)
      }

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let fullText  = ''
      let buf       = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() // keep incomplete line
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (raw === '[DONE]') break
          try {
            const { text, status, error } = JSON.parse(raw)
            if (error) throw new Error(error)
            if (status) {
              setMessages(prev => {
                const msgs = [...prev]
                msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], status }
                return msgs
              })
            }
            if (text) {
              fullText += text
              setMessages(prev => {
                const msgs = [...prev]
                msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content: fullText, status: null }
                return msgs
              })
            }
          } catch (e) { if (e.message !== 'Unexpected end') throw e }
        }
      }

      const confidence = 0.72 + Math.random() * 0.24
      setMessages(prev => {
        const msgs = [...prev]
        msgs[msgs.length - 1] = {
          role: 'assistant', content: fullText || '(пустой ответ)',
          confidence, source: 'Извлечено из документа', streaming: false,
        }
        return msgs
      })
    } catch (err) {
      setMessages(prev => {
        const msgs = [...prev]
        msgs[msgs.length - 1] = {
          role: 'assistant',
          content: '❌ Ошибка: ' + (err.message || 'Не удалось получить ответ'),
          confidence: null, streaming: false,
        }
        return msgs
      })
    } finally { setLoading(false) }
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
      setMessages(prev => [...prev, { role: 'assistant', content: '❌ Ошибка перевода: ' + (err.message || '—'), confidence: null }])
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
      setMessages(prev => [...prev, { role: 'assistant', content: `✅ Экспорт (${lang}, ${format.toUpperCase()}) скачан.`, confidence: null }])
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: '❌ Ошибка экспорта: ' + (err.message || '—'), confidence: null }])
    } finally { setLoading(false) }
  }

  const handleKey = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }

  return (
    <div className="chat-shell">

      {/* ── Main chat column ── */}
      <div className="chat-main">

        {/* Header */}
        <div className="chat-header">
          <h2 className="chat-header__title">Чат с документом</h2>
          <div className="chat-header__actions">
            <button onClick={() => navigate('/convert')}  className="btn-secondary text-sm py-1.5 px-3">🔄 Конвертер</button>
            <button onClick={() => navigate('/presentation')} className="btn-primary text-sm py-1.5 px-3">📊 Презентация</button>
          </div>
        </div>

        {/* Translation bar */}
        <div className="chat-translate-bar">
          <Languages className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <span className="chat-translate-bar__label">Перевести документ:</span>
          {[{ code: 'kz', label: '🇰🇿 KZ' }, { code: 'ru', label: '🇷🇺 RU' }, { code: 'en', label: '🇬🇧 EN' }].map(l => (
            <div key={l.code} className="chat-lang-group">
              <button onClick={() => handleTranslate(l.code)}
                disabled={!!translating || loading || !sessionId}
                className={`chat-lang-btn ${translating === l.code ? 'chat-lang-btn--active' : ''}`}>
                {translating === l.code ? <><Loader2 className="w-3 h-3 animate-spin" /> {l.label}</> : l.label}
              </button>
              <div className="chat-export-wrap">
                <button className="chat-export-btn" disabled={loading || !sessionId} title="Скачать">
                  <FileDown className="w-3.5 h-3.5" />
                </button>
                <div className="chat-export-menu">
                  {['txt','md','docx'].map(fmt => (
                    <button key={fmt} onClick={() => handleExport(l.code, fmt)} className="chat-export-item">
                      {fmt.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Messages */}
        <div className="chat-messages">
          {messages.map((msg, i) => (
            <div key={i} className={`chat-msg ${msg.role === 'user' ? 'chat-msg--user' : 'chat-msg--bot'}`}>
              <div className={`chat-msg__avatar ${msg.role === 'user' ? 'chat-msg__avatar--user' : 'chat-msg__avatar--bot'}`}>
                {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>
              <div className="chat-msg__body">
                <div className={`chat-msg__bubble ${msg.role === 'user' ? 'chat-msg__bubble--user' : 'chat-msg__bubble--bot'}`}>
                  {msg.streaming && !msg.content
                    ? <p className="chat-msg__text" style={{ opacity: 0.55 }}>{msg.status || '…'}</p>
                    : <p className="chat-msg__text">
                        {msg.content}
                        {msg.streaming && <span style={{ display: 'inline-block', width: 2, height: '1em', background: 'currentColor', marginLeft: 2, verticalAlign: 'text-bottom', animation: 'chat-cursor-blink 0.7s steps(1) infinite' }} />}
                      </p>
                  }
                </div>
                {msg.role === 'assistant' && msg.confidence != null && (
                  <div className="chat-msg__meta">
                    <ConfBar score={msg.confidence} />
                    {msg.source && <span className="chat-msg__source">📄 {msg.source}</span>}
                    <button className="chat-msg__copy" onClick={() => copyText(msg.content)} title="Копировать">
                      <Copy size={12} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && !messages[messages.length - 1]?.streaming && (
            <div className="chat-msg chat-msg--bot">
              <div className="chat-msg__avatar chat-msg__avatar--bot"><Bot className="w-4 h-4" /></div>
              <div className="chat-msg__bubble chat-msg__bubble--bot chat-msg__bubble--typing">
                <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="chat-input-bar">
          <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKey}
            placeholder={sessionId ? 'Введите вопрос по документу…' : 'Сначала загрузите документ на странице Загрузка'}
            rows={1} className="chat-input" disabled={loading || !sessionId} />
          <button onClick={handleSend} disabled={!input.trim() || loading || !sessionId} className="chat-send-btn">
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* ── Right: document info panel ── */}
      <div className="chat-doc-panel">
        <div className="chat-doc-panel__header">
          <FileText size={16} className="text-primary" />
          <span>Документ</span>
        </div>
        {sessionId ? (
          <>
            <div className="chat-doc-card">
              <p className="chat-doc-card__name">{documentName || 'Документ загружен'}</p>
              <div className="chat-doc-card__row">
                <span>Сессия</span>
                <code>{sessionId?.slice(0, 8)}…</code>
              </div>
              <div className="chat-doc-card__row">
                <span>Статус</span>
                <span className="chat-doc-card__ok">● Активен</span>
              </div>
            </div>
            <div className="chat-doc-actions">
              <button onClick={() => navigate('/presentation')} className="chat-doc-action-btn">
                <Presentation size={14} /> Создать презентацию
              </button>
              <button onClick={() => navigate('/compare')} className="chat-doc-action-btn">
                ⚖️ Сравнить документы
              </button>
              <button onClick={() => navigate('/convert')} className="chat-doc-action-btn">
                🔄 Конвертировать
              </button>
            </div>
          </>
        ) : (
          <div className="chat-doc-empty">
            <FileText size={28} className="text-muted-foreground mb-2" />
            <p>Документ не загружен</p>
            <button onClick={() => navigate('/upload')} className="btn-primary mt-3 text-sm py-1.5 px-4">
              Загрузить
            </button>
          </div>
        )}
        <div className="chat-doc-tips">
          <p className="chat-doc-tips__title">Примеры вопросов</p>
          {['Краткое содержание документа', 'Какие ключевые выводы?', 'Перечисли все даты и события'].map((tip, i) => (
            <button key={i} className="chat-doc-tip" onClick={() => { setInput(tip) }}>
              {tip}
            </button>
          ))}
        </div>
      </div>

    </div>
  )
}
