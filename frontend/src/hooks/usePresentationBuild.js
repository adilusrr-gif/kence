import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/shared/ui/toast'
import { getToken } from '../lib/api'

export function usePresentationBuild({ sessionId, theme, selectedIds, onSuccess, onError }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [building,     setBuilding]     = useState(false)
  const [buildStatus,  setBuildStatus]  = useState('')

  const handleBuild = useCallback(async () => {
    if (selectedIds.length === 0) { onError(t('presentation.errors.noSlides')); return }
    setBuilding(true)
    onError('')
    setBuildStatus(t('presentation.errors.preparing'))

    const token = getToken()
    const url = `/api/presentations/build/stream?${new URLSearchParams({
      session_id: sessionId,
      theme,
      slide_ids: selectedIds.join(','),
    })}`

    let res
    try {
      res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    } catch (e) {
      setBuilding(false); setBuildStatus('')
      const msg = t('presentation.errors.connectionFailed', { msg: e.message })
      onError(msg); toast.error(msg)
      return
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }))
      setBuilding(false); setBuildStatus('')
      const msg = err.detail || t('presentation.errors.buildFailed')
      onError(msg); toast.error(msg)
      return
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop()
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (raw === '[DONE]') { setBuilding(false); setBuildStatus(''); return }
          try {
            const payload = JSON.parse(raw)
            if (payload.error) {
              throw new Error(payload.error)
            } else if (payload.done) {
              setBuilding(false); setBuildStatus('')
              onSuccess()
              return
            } else if (payload.status) {
              setBuildStatus(payload.status)
            }
          } catch (parseErr) {
            if (parseErr.message !== 'Unexpected end') throw parseErr
          }
        }
      }
    } catch (e) {
      const msg = e.message || t('presentation.errors.buildFailed')
      onError(msg); toast.error(msg)
    } finally {
      setBuilding(false); setBuildStatus('')
    }
  }, [selectedIds, sessionId, theme, onSuccess, onError, t, toast])

  return { building, buildStatus, handleBuild }
}
