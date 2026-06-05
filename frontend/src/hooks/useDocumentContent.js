import { useState, useEffect } from 'react'
import { apiGetDocumentContent } from '../lib/api'

function extractHeadings(md) {
  if (!md) return []
  return md.split('\n').reduce((acc, line, i) => {
    const m = line.match(/^(#{1,3})\s+(.+)/)
    if (m) acc.push({ level: m[1].length, text: m[2].trim(), lineIndex: i })
    return acc
  }, [])
}

export function useDocumentContent(sessionId) {
  const [markdown,   setMarkdown]   = useState('')
  const [htmlDoc,    setHtmlDoc]    = useState('')
  const [loadingDoc, setLoadingDoc] = useState(true)
  const [headings,   setHeadings]   = useState([])

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

  return { markdown, htmlDoc, loadingDoc, headings }
}
