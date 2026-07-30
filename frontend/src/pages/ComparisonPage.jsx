import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Upload, Loader2, GitCompare, Brain, Wrench, CheckCircle, XCircle, AlertTriangle, FileText, ScanText, Download, ChevronDown, ChevronRight, Layers } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { apiCreateSession, apiCompareUpload, apiCompareSemantic, apiCompareTechnical, apiCompareExact, apiCompareThematic } from '../lib/api'
import { useToast } from '@/shared/ui/toast'
import Skeleton from '@/shared/ui/skeleton/Skeleton'
import DiffViewer from '@/components/DiffViewer'

// Expandable snippet — click to see full text
function Snippet({ text, maxLen = 200 }) {
  const [expanded, setExpanded] = useState(false)
  const isLong = text && text.length > maxLen
  return (
    <span>
      {expanded || !isLong ? text : text.slice(0, maxLen) + '…'}
      {isLong && (
        <button
          onClick={() => setExpanded(e => !e)}
          style={{ marginLeft: 6, fontSize: 11, color: 'var(--accent-primary)', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          {expanded ? '↑ свернуть' : '↓ показать полностью'}
        </button>
      )}
    </span>
  )
}

function ComparisonPage() {
  const { t } = useTranslation()
  const [sessionId, setSessionId] = useState(null)
  const [file1, setFile1] = useState(null)
  const [file2, setFile2] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [comparing, setComparing] = useState(false)
  const [result, setResult] = useState(null)
  const [mode, setMode] = useState(null)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const toast = useToast()
  const allowedFormats = ['.pdf','.docx','.doc','.pptx','.ppt','.xlsx','.xls','.html','.htm','.txt','.png','.jpg','.jpeg','.tiff','.tex']

  const handleFile1 = (e) => {
    const f = e.target.files[0]
    if (f) {
      const ext = '.' + f.name.split('.').pop().toLowerCase()
      if (!allowedFormats.includes(ext)) { setError(t('compare.badFormat1')); return }
      setFile1(f); setError('')
    }
  }

  const handleFile2 = (e) => {
    const f = e.target.files[0]
    if (f) {
      const ext = '.' + f.name.split('.').pop().toLowerCase()
      if (!allowedFormats.includes(ext)) { setError(t('compare.badFormat2')); return }
      setFile2(f); setError('')
    }
  }

  const handleUpload = async () => {
    if (!file1 || !file2) return
    setUploading(true); setError('')
    try {
      const { session_id: sid } = await apiCreateSession()
      await apiCompareUpload(sid, file1, file2)
      setSessionId(sid)
      setUploading(false)
    } catch (err) {
      const msg = err.message || t('compare.errorUpload')
      setError(msg)
      toast.error(msg)
      setUploading(false)
    }
  }

  const handleCompare = async (compareMode) => {
    if (!sessionId) return
    setComparing(true); setMode(compareMode); setResult(null); setError('')
    try {
      const data = compareMode === 'semantic'  ? await apiCompareSemantic(sessionId)
                 : compareMode === 'technical' ? await apiCompareTechnical(sessionId)
                 : compareMode === 'thematic'  ? await apiCompareThematic(sessionId)
                 : await apiCompareExact(sessionId)
      setResult(data)
    } catch (err) {
      const msg = err.message || t('compare.errorCompare')
      setError(msg)
      toast.error(msg)
    } finally {
      setComparing(false)
    }
  }

  const handleExport = () => {
    if (!result) return
    let md = `# Сравнение документов\n**Режим:** ${mode}\n**Документ 1:** ${result.doc1_name}\n**Документ 2:** ${result.doc2_name}\n\n`
    if (result.verdict) md += `## Вердикт\n${result.verdict}\n\n`
    if (result.synthesis) md += `## Тематический синтез\n${result.synthesis}\n\n`
    if (result.similarities?.length) {
      md += `## Схожие фрагменты (${result.similarities.length})\n`
      result.similarities.forEach((s, i) => {
        md += `\n### ${i+1}. Сходство ${(s.similarity_score*100).toFixed(0)}%\n`
        md += `**Документ 1:** ${s.doc1_text}\n**Документ 2:** ${s.doc2_text}\n`
      })
    }
    if (result.report_markdown) md += result.report_markdown
    const blob = new Blob([md], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = Object.assign(document.createElement('a'), { href: url, download: `comparison_${mode}_${Date.now()}.md` })
    a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => navigate('/')} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
          <ArrowLeft className="w-6 h-6 text-gray-600" />
        </button>
        <div>
          <h2 className="text-2xl font-bold">{t('compare.title')}</h2>
          <p className="text-gray-500 text-sm">{t('compare.subtitle')}</p>
        </div>
      </div>

      {!sessionId && (
        <div className="card">
          <div className="grid grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('compare.doc1Label')}</label>
              <div onClick={() => document.getElementById('file1').click()} className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${file1 ? 'border-primary bg-primary/5' : 'border-gray-300 hover:border-primary'}`}>
                <input id="file1" type="file" className="hidden" onChange={handleFile1} />
                {file1 ? (
                  <div>
                    <FileText className="w-8 h-8 text-primary mx-auto mb-2" />
                    <p className="text-sm font-medium truncate">{file1.name}</p>
                    <p className="text-xs text-gray-400">{(file1.size/1024/1024).toFixed(2)} MB</p>
                  </div>
                ) : (
                  <div>
                    <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">{t('compare.selectFile1')}</p>
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('compare.doc2Label')}</label>
              <div onClick={() => document.getElementById('file2').click()} className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${file2 ? 'border-primary bg-primary/5' : 'border-gray-300 hover:border-primary'}`}>
                <input id="file2" type="file" className="hidden" onChange={handleFile2} />
                {file2 ? (
                  <div>
                    <FileText className="w-8 h-8 text-primary mx-auto mb-2" />
                    <p className="text-sm font-medium truncate">{file2.name}</p>
                    <p className="text-xs text-gray-400">{(file2.size/1024/1024).toFixed(2)} MB</p>
                  </div>
                ) : (
                  <div>
                    <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">{t('compare.selectFile2')}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {error && <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">{error}</div>}

          <button onClick={handleUpload} disabled={!file1 || !file2 || uploading} className="btn-primary w-full flex items-center justify-center gap-2">
            {uploading
              ? <><Loader2 className="w-5 h-5 animate-spin" />{t('compare.uploading')}</>
              : <><GitCompare className="w-5 h-5" />{t('compare.uploadBtn')}</>}
          </button>
        </div>
      )}

      {sessionId && !result && !comparing && (
        <div className="card text-center py-10">
          <GitCompare className="w-16 h-16 text-primary mx-auto mb-4" />
          <h3 className="text-xl font-bold mb-2">{t('compare.selectMode')}</h3>
          <p className="text-gray-500 mb-8">{t('compare.selectModeDesc')}</p>
          <div className="grid grid-cols-2 gap-4 max-w-3xl mx-auto" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
            <button onClick={() => handleCompare('semantic')} className="card hover:shadow-lg hover:border-primary transition-all text-left">
              <Brain className="w-10 h-10 text-secondary mb-3" />
              <h4 className="font-bold text-lg mb-1">{t('compare.modeSemantic')}</h4>
              <p className="text-sm text-gray-500">{t('compare.modeSemanticDesc')}</p>
            </button>
            <button onClick={() => handleCompare('thematic')} className="card hover:shadow-lg transition-all text-left" style={{ borderColor: 'var(--color-violet-400)' }}>
              <Layers className="w-10 h-10 mb-3" style={{ color: 'var(--color-violet-400)' }} />
              <h4 className="font-bold text-lg mb-1">{t('compare.modeThematic', 'Тематический анализ')}</h4>
              <p className="text-sm text-gray-500">{t('compare.modeThematicDesc', 'Темы, аргументы, позиции и тон каждого документа')}</p>
            </button>
            <button onClick={() => handleCompare('technical')} className="card hover:shadow-lg hover:border-primary transition-all text-left">
              <Wrench className="w-10 h-10 text-accent mb-3" />
              <h4 className="font-bold text-lg mb-1">{t('compare.modeTechnical')}</h4>
              <p className="text-sm text-gray-500">{t('compare.modeTechnicalDesc')}</p>
            </button>
            <button onClick={() => handleCompare('exact')} className="card hover:shadow-lg hover:border-red-400 transition-all text-left">
              <ScanText className="w-10 h-10 text-red-500 mb-3" />
              <h4 className="font-bold text-lg mb-1">{t('compare.modeExact')}</h4>
              <p className="text-sm text-gray-500">{t('compare.modeExactDesc')}</p>
            </button>
          </div>
        </div>
      )}

      {comparing && (
        <div className="card" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <Loader2 size={16} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent, #6366f1)' }} />
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              {mode === 'semantic' ? t('compare.analyzingSemantic')
              : mode === 'technical' ? t('compare.analyzingTechnical')
              : t('compare.analyzingExact')}
            </span>
          </div>
          <Skeleton height="14px" width="85%" />
          <Skeleton height="14px" />
          <Skeleton height="14px" width="70%" />
          <Skeleton height="14px" width="90%" />
          <Skeleton height="14px" width="60%" />
        </div>
      )}

      {result && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <button onClick={handleExport} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: 'var(--bg-surface-2)', border: '1px solid var(--border-default)', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text-primary)' }}>
            <Download size={14} /> Экспорт в Markdown
          </button>
        </div>
      )}

      {result && mode === 'semantic' && (
        <div className="space-y-6">
          <div className="card">
            <div className="flex items-center gap-3 mb-4">
              <Brain className="w-6 h-6 text-secondary" />
              <h3 className="text-xl font-bold">{t('compare.semanticTitle')}</h3>
            </div>
            {/* Overall similarity bar */}
            {result.summary?.overall_similarity_pct !== undefined && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 13 }}>Общее смысловое сходство</span>
                  <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent-primary)' }}>{result.summary.overall_similarity_pct}%</span>
                </div>
                <div style={{ background: 'var(--bg-surface-2)', borderRadius: 6, height: 8, overflow: 'hidden' }}>
                  <div style={{ width: `${result.summary.overall_similarity_pct}%`, height: '100%', background: 'var(--gradient-accent)', transition: 'width 0.5s' }} />
                </div>
              </div>
            )}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-green-50 p-4 rounded-lg text-center">
                <p className="text-2xl font-bold text-green-600">{result.summary?.similar_sections || 0}</p>
                <p className="text-sm text-gray-600">{t('compare.semanticSimilar')}</p>
              </div>
              <div className="bg-blue-50 p-4 rounded-lg text-center">
                <p className="text-2xl font-bold text-blue-600">{result.summary?.unique_doc1_sections || 0}</p>
                <p className="text-sm text-gray-600">{t('compare.semanticOnlyDoc1')}</p>
              </div>
              <div className="bg-orange-50 p-4 rounded-lg text-center">
                <p className="text-2xl font-bold text-orange-600">{result.summary?.unique_doc2_sections || 0}</p>
                <p className="text-sm text-gray-600">{t('compare.semanticOnlyDoc2')}</p>
              </div>
            </div>
            {/* LLM Verdict */}
            {result.verdict && (
              <div style={{ padding: '12px 16px', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 10, borderLeft: '3px solid var(--accent-primary)' }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent-primary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>⚡ Вердикт AI</p>
                <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-primary)' }}>{result.verdict}</p>
              </div>
            )}
          </div>

          {result.similarities?.length > 0 && (
            <div className="card">
              <h4 className="font-bold text-green-700 mb-4 flex items-center gap-2"><CheckCircle className="w-5 h-5" />{t('compare.semanticSections')}</h4>
              <div className="space-y-3">
                {result.similarities.map((item, i) => (
                  <div key={i} className="bg-green-50 p-4 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs bg-green-200 text-green-800 px-2 py-1 rounded">{t('compare.semanticMatch', { pct: (item.similarity_score * 100).toFixed(0) })}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div><p className="text-gray-500 text-xs mb-1">{t('compare.semanticDoc1')}</p><p className="text-gray-700">{item.doc1_text}</p></div>
                      <div><p className="text-gray-500 text-xs mb-1">{t('compare.semanticDoc2')}</p><p className="text-gray-700">{item.doc2_text}</p></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.unique_to_doc1?.length > 0 && (
            <div className="card">
              <h4 className="font-bold text-blue-700 mb-4 flex items-center gap-2"><AlertTriangle className="w-5 h-5" />{t('compare.semanticUniqueDoc1', { name: result.doc1_name })}</h4>
              <div className="space-y-2">
                {result.unique_to_doc1.map((text, i) => <p key={i} className="text-sm text-gray-600 bg-blue-50 p-3 rounded"><Snippet text={text} /></p>)}
              </div>
            </div>
          )}

          {result.unique_to_doc2?.length > 0 && (
            <div className="card">
              <h4 className="font-bold text-orange-700 mb-4 flex items-center gap-2"><AlertTriangle className="w-5 h-5" />{t('compare.semanticUniqueDoc2', { name: result.doc2_name })}</h4>
              <div className="space-y-2">
                {result.unique_to_doc2.map((text, i) => <p key={i} className="text-sm text-gray-600 bg-orange-50 p-3 rounded"><Snippet text={text} /></p>)}
              </div>
            </div>
          )}
        </div>
      )}

      {result && mode === 'thematic' && (
        <div className="space-y-6">
          <div className="card">
            <div className="flex items-center gap-3 mb-4">
              <Layers className="w-6 h-6" style={{ color: 'var(--color-violet-400)' }} />
              <h3 className="text-xl font-bold">Тематический анализ</h3>
            </div>
            {/* Doc themes side by side */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              {[['doc1_themes', result.doc1_name], ['doc2_themes', result.doc2_name]].map(([key, name]) => {
                const th = result[key] || {}
                return (
                  <div key={key} style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 10, padding: '14px 16px' }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', marginBottom: 8 }}>{name}</p>
                    {th.main_theme && <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>📌 {th.main_theme}</p>}
                    {th.tone && <p style={{ fontSize: 11, marginBottom: 6 }}>Тон: <strong>{th.tone}</strong></p>}
                    {th.stance && <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>{th.stance}</p>}
                    {th.key_arguments?.length > 0 && (
                      <div>
                        <p style={{ fontSize: 11, fontWeight: 600, marginBottom: 4, color: 'var(--text-faint)' }}>Аргументы:</p>
                        <ul style={{ paddingLeft: 16, margin: 0 }}>
                          {th.key_arguments.slice(0, 4).map((a, i) => <li key={i} style={{ fontSize: 12, marginBottom: 3 }}>{a}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            {/* Synthesis */}
            {result.synthesis && (
              <div style={{ padding: '12px 16px', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 10, borderLeft: '3px solid var(--color-violet-400)' }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-violet-400)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>⚡ Тематический синтез</p>
                <p style={{ fontSize: 13, lineHeight: 1.6 }}>{result.synthesis}</p>
              </div>
            )}
          </div>
          {/* Concepts */}
          <div className="grid grid-cols-3 gap-4">
            {result.shared_concepts?.length > 0 && (
              <div className="card">
                <h4 className="font-bold text-green-700 mb-3 flex items-center gap-2"><CheckCircle className="w-4 h-4" />Общие концепции ({result.shared_concepts.length})</h4>
                <div className="flex flex-wrap gap-2">{result.shared_concepts.map((c,i) => <span key={i} style={{ padding: '2px 8px', background: 'color-mix(in srgb, var(--status-success) 12%, transparent)', color: 'var(--status-success)', borderRadius: 999, fontSize: 12 }}>{c}</span>)}</div>
              </div>
            )}
            {result.unique_to_doc1?.length > 0 && (
              <div className="card">
                <h4 className="font-bold text-blue-700 mb-3">Только в «{result.doc1_name}»</h4>
                <div className="flex flex-wrap gap-2">{result.unique_to_doc1.map((c,i) => <span key={i} style={{ padding: '2px 8px', background: 'var(--bg-surface-2)', borderRadius: 999, fontSize: 12 }}>{c}</span>)}</div>
              </div>
            )}
            {result.unique_to_doc2?.length > 0 && (
              <div className="card">
                <h4 className="font-bold text-orange-700 mb-3">Только в «{result.doc2_name}»</h4>
                <div className="flex flex-wrap gap-2">{result.unique_to_doc2.map((c,i) => <span key={i} style={{ padding: '2px 8px', background: 'var(--bg-surface-2)', borderRadius: 999, fontSize: 12 }}>{c}</span>)}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {result && mode === 'technical' && (
        <div className="space-y-6">
          <div className="card">
            <div className="flex items-center gap-3 mb-4">
              <Wrench className="w-6 h-6 text-accent" />
              <h3 className="text-xl font-bold">{t('compare.technicalTitle')}</h3>
            </div>
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">{t('compare.technicalMatchLabel')}</span>
                <span className="text-2xl font-bold text-primary">{result.match_percentage}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div className="bg-primary h-3 rounded-full transition-all" style={{ width: `${result.match_percentage}%` }} />
              </div>
              <p className="text-sm text-gray-500 mt-2">{t('compare.technicalMatchCount', { matched: result.comparison?.matched?.length || 0, total: result.comparison?.total_parameters || 0 })}</p>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-500 mb-1">{t('compare.technicalDoc1')}</p>
                <p className="font-bold">{result.doc1_specs?.product_name || t('compare.technicalUndefined')}</p>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-500 mb-1">{t('compare.technicalDoc2')}</p>
                <p className="font-bold">{result.doc2_specs?.product_name || t('compare.technicalUndefined')}</p>
              </div>
            </div>
          </div>

          {result.comparison?.matched?.length > 0 && (
            <div className="card">
              <h4 className="font-bold text-green-700 mb-4 flex items-center gap-2"><CheckCircle className="w-5 h-5" />{t('compare.technicalMatched', { count: result.comparison.matched.length })}</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-green-50">
                    <tr><th className="text-left p-3 rounded-tl-lg">{t('compare.colParam')}</th><th className="text-left p-3">{t('compare.colValue')}</th><th className="text-left p-3 rounded-tr-lg">{t('compare.colUnit')}</th></tr>
                  </thead>
                  <tbody>
                    {result.comparison.matched.map((item, i) => (
                      <tr key={i} className="border-b border-gray-100">
                        <td className="p-3 font-medium">{item.parameter}</td>
                        <td className="p-3 text-green-600">{item.value}</td>
                        <td className="p-3 text-gray-500">{item.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {result.comparison?.mismatched?.length > 0 && (
            <div className="card">
              <h4 className="font-bold text-red-600 mb-4 flex items-center gap-2"><XCircle className="w-5 h-5" />{t('compare.technicalMismatched', { count: result.comparison.mismatched.length })}</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-red-50">
                    <tr><th className="text-left p-3 rounded-tl-lg">{t('compare.colParam')}</th><th className="text-left p-3">{t('compare.technicalDoc1')}</th><th className="text-left p-3">{t('compare.technicalDoc2')}</th><th className="text-left p-3 rounded-tr-lg">{t('compare.colUnit')}</th></tr>
                  </thead>
                  <tbody>
                    {result.comparison.mismatched.map((item, i) => (
                      <tr key={i} className="border-b border-gray-100">
                        <td className="p-3 font-medium">{item.parameter}</td>
                        <td className="p-3 text-blue-600">{item.doc1_value}</td>
                        <td className="p-3 text-orange-600">{item.doc2_value}</td>
                        <td className="p-3 text-gray-500">{item.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {result.comparison?.only_in_doc1?.length > 0 && (
            <div className="card">
              <h4 className="font-bold text-blue-700 mb-4">{t('compare.technicalOnlyDoc1', { count: result.comparison.only_in_doc1.length })}</h4>
              <div className="space-y-2">
                {result.comparison.only_in_doc1.map((item, i) => (
                  <div key={i} className="flex justify-between bg-blue-50 p-3 rounded text-sm">
                    <span className="font-medium">{item.parameter}</span>
                    <span className="text-gray-600">{item.value} {item.unit}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.comparison?.only_in_doc2?.length > 0 && (
            <div className="card">
              <h4 className="font-bold text-orange-700 mb-4">{t('compare.technicalOnlyDoc2', { count: result.comparison.only_in_doc2.length })}</h4>
              <div className="space-y-2">
                {result.comparison.only_in_doc2.map((item, i) => (
                  <div key={i} className="flex justify-between bg-orange-50 p-3 rounded text-sm">
                    <span className="font-medium">{item.parameter}</span>
                    <span className="text-gray-600">{item.value} {item.unit}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {result && mode === 'exact' && (
        <DiffViewer result={result} />
      )}

      {result && (
        <div className="text-center mt-8">
          <button onClick={() => { setSessionId(null); setFile1(null); setFile2(null); setResult(null); setMode(null); setError(''); }} className="btn-secondary">
            {t('compare.resetBtn')}
          </button>
        </div>
      )}
    </div>
  )
}

export default ComparisonPage
