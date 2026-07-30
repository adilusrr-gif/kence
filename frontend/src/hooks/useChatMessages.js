import { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  apiGetChatHistory, apiClearChatHistory, apiVisualDescribe,
  apiTranslate, apiTranslateExport, apiDownloadPath,
  apiCancelGeneration,
  copyToClipboard, getBaseUrl,
} from '../lib/api'
import { streamWithEvents } from '../lib/sseAdapter'

const NOT_FOUND_PHRASES = [
  'не содержит', 'нет информации', 'не упоминается', 'не найдено',
  'не могу найти', 'отсутствует в документе', 'в документе нет',
  'not found', 'cannot find', 'not mentioned', 'not in the document',
]

export function detectNotFound(text) {
  const lower = (text || '').toLowerCase()
  return NOT_FOUND_PHRASES.some(p => lower.includes(p))
}

export function useChatMessages(sessionId, isImageDoc) {
  const { t } = useTranslation()

  const [messages,   setMessages]   = useState(() => [{ role: 'assistant', content: t('workspace.greeting') }])
  const [input,      setInput]      = useState('')
  const [loading,    setLoading]    = useState(false)
  const [copied,     setCopied]     = useState(null)
  const [chatMode,   setChatMode]   = useState('exact')
  const [visualizing, setVisualizing] = useState(false)
  const [translating, setTranslating] = useState(false)

  const inputRef       = useRef(null)
  const messagesEndRef = useRef(null)
  const messagesScrollRef = useRef(null)
  const abortRef       = useRef(null)
  // Mirrors `messages` for callbacks (handleRegenerate) that need the latest
  // list at CALL time but must not change identity on every render — if they
  // depended on `messages` directly, their useCallback reference would churn
  // on every SSE token (messages updates once per chunk while streaming),
  // which defeats React.memo(ChatMessage) since onRegenerate is passed to
  // every row.
  const messagesRef = useRef(messages)
  useEffect(() => { messagesRef.current = messages }, [messages])

  // Cancel any active stream when the component unmounts (user navigates away)
  useEffect(() => {
    return () => { abortRef.current?.abort() }
  }, [])

  // Load chat history when session opens
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
          { role: 'assistant', content: t('workspace.greeting') },
        ])
      })
      .catch(() => {})
  }, [sessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to bottom on new message — but only if the user is already near the
  // bottom (don't yank them back down if they scrolled up to re-read earlier
  // messages), and without `smooth` while actively streaming: a smooth scroll
  // re-triggered on every batched chunk fights its own previous animation and
  // reads as jitter rather than a smooth follow.
  useEffect(() => {
    const container = messagesScrollRef.current
    const nearBottom = !container ||
      container.scrollHeight - container.scrollTop - container.clientHeight < 120
    if (!nearBottom) return
    const streaming = messages[messages.length - 1]?.streaming
    messagesEndRef.current?.scrollIntoView({ behavior: streaming ? 'auto' : 'smooth' })
  }, [messages])

  // Chunks arrive over SSE roughly once per token — at model speed that's easily
  // 20-50 setState calls/sec, each re-rendering + re-parsing the growing Markdown
  // string. Coalesce them to one flush per animation frame (browser paint rate)
  // instead of one per token — same perceived "live typing" effect, far fewer
  // renders during a fast stream.
  const pendingChunkRef = useRef(null)
  const chunkFlushScheduledRef = useRef(false)

  const flushPendingChunk = useCallback(() => {
    chunkFlushScheduledRef.current = false
    const full = pendingChunkRef.current
    if (full === null) return
    pendingChunkRef.current = null
    setMessages(prev => { const m=[...prev]; m[m.length-1]={...m[m.length-1],content:full,status:null}; return m })
  }, [])

  // Shared stream callbacks builder
  const makeStreamHandlers = useCallback(() => ({
    onStatus:  (status)  => setMessages(prev => { const m=[...prev]; m[m.length-1]={...m[m.length-1],status}; return m }),
    onChunk:   (_, full) => {
      pendingChunkRef.current = full
      if (!chunkFlushScheduledRef.current) {
        chunkFlushScheduledRef.current = true
        requestAnimationFrame(flushPendingChunk)
      }
    },
    onDone:    (full)    => {
      pendingChunkRef.current = null  // supersede any pending partial chunk
      setMessages(prev => { const m=[...prev]; m[m.length-1]={role:'assistant',content:full,streaming:false,ts:Date.now(),notFound:detectNotFound(full)}; return m })
    },
    onError:   (err)     => {
      pendingChunkRef.current = null
      setMessages(prev => { const m=[...prev]; m[m.length-1]={role:'assistant',content:t('common.errorMsg',{msg:err.message||'—'}),streaming:false,isError:true}; return m })
    },
    onSources: (sources) => setMessages(prev => { const m=[...prev]; if(m[m.length-1]?.role==='assistant') m[m.length-1]={...m[m.length-1],sources}; return m }),
  }), [t, flushPendingChunk])

  const handleSend = useCallback(async (overrideQuestion = null) => {
    const question = overrideQuestion ?? input.trim()
    if (!question || loading) return
    if (!overrideQuestion) setInput('')
    setMessages(prev => [...prev, { role: 'user', content: question, ts: Date.now() }])
    setLoading(true)
    setMessages(prev => [...prev, { role: 'assistant', content: '', status: 'typing', streaming: true }])

    // Abort any previous in-flight stream before starting a new one
    abortRef.current?.abort()
    abortRef.current = new AbortController()

    const streamUrl = chatMode === 'visual' && isImageDoc
      ? `${getBaseUrl()}/api/chat/visual-stream?session_id=${sessionId}&question=${encodeURIComponent(question)}`
      : null

    await streamWithEvents(sessionId, question, {
      mode: chatMode === 'visual' ? 'precise' : chatMode,
      customUrl: streamUrl,
      signal: abortRef.current.signal,
      ...makeStreamHandlers(),
    })
    setLoading(false)
  }, [input, loading, chatMode, isImageDoc, sessionId, makeStreamHandlers])

  // Stop generation: abort the SSE fetch immediately, notify the backend so it
  // frees the LLM queue/semaphore slot (Task 1), and mark the message as stopped.
  const handleStop = useCallback(() => {
    abortRef.current?.abort()
    if (sessionId) apiCancelGeneration(sessionId).catch(() => {})
    setMessages(prev => {
      const m = [...prev]
      const last = m[m.length - 1]
      if (last?.role === 'assistant' && last.streaming) {
        m[m.length - 1] = { ...last, streaming: false, status: null, stopped: true, ts: Date.now() }
      }
      return m
    })
    setLoading(false)
  }, [sessionId])

  const handleRegenerate = useCallback(async (botMsgIndex) => {
    if (loading) return
    // Reads messagesRef (not `messages` state) so this callback's identity
    // stays stable across the per-chunk re-renders of an active stream — it's
    // passed as `onRegenerate` to every ChatMessage row, so a churning
    // reference here would defeat React.memo(ChatMessage) for the whole list.
    const prevUser = messagesRef.current.slice(0, botMsgIndex).reverse().find(m => m.role === 'user')
    if (!prevUser) return
    setMessages(prev => prev.slice(0, botMsgIndex))
    setLoading(true)
    setMessages(prev => [...prev, { role: 'assistant', content: '', status: 'typing', streaming: true }])
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    await streamWithEvents(sessionId, prevUser.content, {
      mode: chatMode === 'visual' ? 'precise' : chatMode,
      signal: abortRef.current.signal,
      ...makeStreamHandlers(),
    })
    setLoading(false)
  }, [loading, chatMode, sessionId, makeStreamHandlers])

  const handleExportChat = useCallback(() => {
    const lines = messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .filter(m => !m.historical && !m.streaming)
      .map(m => `**${m.role === 'user' ? t('workspace.you', 'Вы') : 'AI'}:** ${m.content}`)
    if (!lines.length) return
    const md = `# ${t('workspace.chatExportTitle', 'Чат')}\n\n${lines.join('\n\n---\n\n')}`
    const blob = new Blob([md], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = Object.assign(document.createElement('a'), {
      href: url,
      download: `chat_${Date.now()}.md`,
    })
    a.click()
    URL.revokeObjectURL(url)
  }, [messages, t])

  const handleClearHistory = useCallback(async () => {
    if (!sessionId) return
    await apiClearChatHistory(sessionId).catch(() => {})
    setMessages([{ role: 'assistant', content: t('workspace.greeting') }])
  }, [sessionId, t])

  const handleVisualDescribe = useCallback(async () => {
    if (!sessionId || visualizing) return
    setVisualizing(true)
    setMessages(prev => [...prev,
      { role: 'user', content: t('workspace.describeImage'), ts: Date.now() },
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
        m[m.length - 1] = { role: 'assistant', content: t('common.errorMsg', { msg: err.message }), streaming: false, isError: true }
        return m
      })
    } finally { setVisualizing(false) }
  }, [sessionId, visualizing, t])

  const handleTranslate = useCallback(async (lang) => {
    if (translating || !sessionId) return
    setTranslating(lang)
    setMessages(prev => [...prev, { role: 'user', content: t('workspace.translateMsg', { lang: t(`workspace.langNames.${lang}`) }) }])
    try {
      const data = await apiTranslate(sessionId, lang)
      setMessages(prev => [...prev, { role: 'assistant', content: data.translated }])
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: t('workspace.translateError', { msg: err.message||'—' }), isError: true }])
    } finally { setTranslating(false) }
  }, [sessionId, translating, t])

  const handleExport = useCallback(async (lang, fmt) => {
    if (!sessionId) return
    setLoading(true)
    try {
      const meta = await apiTranslateExport(sessionId, lang, fmt)
      const blob = await apiDownloadPath(meta.download_url)
      const url = window.URL.createObjectURL(blob)
      const a = Object.assign(document.createElement('a'), { href: url, download: `translated_${lang}.${fmt}` })
      document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(url)
      setMessages(prev => [...prev, { role: 'assistant', content: t('workspace.exportDownloaded', { lang: lang.toUpperCase(), fmt: fmt.toUpperCase() }) }])
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: t('workspace.exportError', { msg: err.message||'—' }), isError: true }])
    } finally { setLoading(false) }
  }, [sessionId, t])

  const handleCopy = useCallback((idx, content) => {
    copyToClipboard(content)
    setCopied(idx)
    setTimeout(() => setCopied(null), 1800)
  }, [])

  // Phase 5: Explain Simply — rewrite complex answer in plain language
  const handleExplainSimply = useCallback(async (msgIndex, content) => {
    if (loading) return
    const simplifyPrompt = (
      `Объясни следующий ответ максимально простым языком для человека без технического образования.\n` +
      `Избегай жаргона, сложных терминов и длинных предложений.\n` +
      `Структурируй как: 1) Что произошло, 2) Почему это важно, 3) Что делать дальше.\n\n` +
      `Ответ для упрощения:\n${content}`
    )
    setLoading(true)
    setMessages(prev => [...prev, { role: 'assistant', content: '', status: 'typing', streaming: true, isSimplified: true }])
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    await streamWithEvents(sessionId, simplifyPrompt, {
      mode: 'precise',
      signal: abortRef.current.signal,
      ...makeStreamHandlers(),
      onDone: (full) => setMessages(prev => {
        const m = [...prev]
        m[m.length - 1] = { role: 'assistant', content: full, streaming: false, ts: Date.now(), isSimplified: true }
        return m
      }),
    })
    setLoading(false)
  }, [loading, sessionId, makeStreamHandlers])

  return {
    messages, input, setInput, loading, copied,
    chatMode, setChatMode, visualizing, translating,
    inputRef, messagesEndRef, messagesScrollRef,
    handleSend, handleStop, handleClearHistory, handleVisualDescribe,
    handleTranslate, handleExport, handleCopy,
    handleRegenerate, handleExportChat, handleExplainSimply,
  }
}
