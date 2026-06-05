import { useState, useEffect, useCallback } from 'react'
import { apiGetDocumentContext, apiSaveDocumentContext, apiDeleteDocumentContext } from '../lib/api'

export function useDocContext(documentName) {
  const [docContext, setDocContextRaw] = useState('')
  const [ctxSaving,  setCtxSaving]    = useState(false)
  const [ctxSaved,   setCtxSaved]     = useState(false)
  const [showCtx,    setShowCtx]      = useState(false)

  const load = useCallback(async () => {
    if (!documentName) { setDocContextRaw(''); return }
    try {
      const d = await apiGetDocumentContext(documentName)
      setDocContextRaw(d.context || '')
    } catch { setDocContextRaw('') }
  }, [documentName])

  useEffect(() => { load() }, [load])

  // Wrap setter so editing always clears the "saved" checkmark
  const setDocContext = useCallback((v) => {
    setDocContextRaw(v)
    setCtxSaved(false)
  }, [])

  const handleSave = useCallback(async () => {
    if (!documentName) return
    setCtxSaving(true)
    try {
      if (docContext.trim()) await apiSaveDocumentContext(documentName, docContext.trim())
      else await apiDeleteDocumentContext(documentName).catch(() => {})
      setCtxSaved(true)
      setTimeout(() => setCtxSaved(false), 2500)
    } catch { } finally { setCtxSaving(false) }
  }, [documentName, docContext])

  const handleClear = useCallback(async () => {
    setDocContextRaw('')
    if (documentName) await apiDeleteDocumentContext(documentName).catch(() => {})
  }, [documentName])

  return { docContext, setDocContext, ctxSaving, ctxSaved, showCtx, setShowCtx, handleSave, handleClear }
}
