import { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  apiGetChatHistory, apiClearChatHistory, apiVisualDescribe,
  apiTranslate, apiTranslateExport, apiDownloadPath,
  copyToClipboard, getBaseUrl,
} from '../lib/api'
import { streamWithEvents } from '../lib/sseAdapter'

export function useChatMessages(sessionId, isImageDoc) {
  const { t } = useTranslation()

  const [messages,   setMessages]   = useState(() => [{ role: 'assistant', content: t('workspace.greeting') }])
  const [input,      setInput]      = useState('')
  const [loading,    setLoading]    = useState(false)
  const [copied,     setCopied]     = useState(null)
  const [chatMode,   setChatMode]   = useState('precise')
  const [visualizing, setVisualizing] = useState(false)
  const [translating, setTranslating] = useState(false)

  const inputRef       = useRef(null)
  const messagesEndRef = useRef(null)

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

  // Scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = useCallback(async () => {
    const question = input.trim()
    if (!question || loading) return
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
      onError:  (err)     => setMessages(prev => { const m=[...prev]; m[m.length-1]={role:'assistant',content:t('common.errorMsg',{msg:err.message||'—'}),streaming:false,isError:true}; return m }),
    })
    setLoading(false)
  }, [input, loading, chatMode, isImageDoc, sessionId, t])

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

  return {
    messages, input, setInput, loading, copied,
    chatMode, setChatMode, visualizing, translating,
    inputRef, messagesEndRef,
    handleSend, handleClearHistory, handleVisualDescribe,
    handleTranslate, handleExport, handleCopy,
  }
}
