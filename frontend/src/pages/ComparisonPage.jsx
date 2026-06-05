import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Upload, Loader2, GitCompare, Brain, Wrench, CheckCircle, XCircle, AlertTriangle, FileText, ScanText } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { apiCreateSession, apiCompareUpload, apiCompareSemantic, apiCompareTechnical, apiCompareExact } from '../lib/api'
import { useToast } from '@/shared/ui/toast'
import Skeleton from '@/shared/ui/skeleton/Skeleton'
import DiffViewer from '@/components/DiffViewer'

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
      const data = compareMode === 'semantic'
        ? await apiCompareSemantic(sessionId)
        : compareMode === 'technical'
        ? await apiCompareTechnical(sessionId)
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
          <div className="grid grid-cols-3 gap-4 max-w-2xl mx-auto">
            <button onClick={() => handleCompare('semantic')} className="card hover:shadow-lg hover:border-primary transition-all text-left">
              <Brain className="w-10 h-10 text-secondary mb-3" />
              <h4 className="font-bold text-lg mb-1">{t('compare.modeSemantic')}</h4>
              <p className="text-sm text-gray-500">{t('compare.modeSemanticDesc')}</p>
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

      {result && mode === 'semantic' && (
        <div className="space-y-6">
          <div className="card">
            <div className="flex items-center gap-3 mb-4">
              <Brain className="w-6 h-6 text-secondary" />
              <h3 className="text-xl font-bold">{t('compare.semanticTitle')}</h3>
            </div>
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
                {result.unique_to_doc1.map((text, i) => <p key={i} className="text-sm text-gray-600 bg-blue-50 p-3 rounded">{text}</p>)}
              </div>
            </div>
          )}

          {result.unique_to_doc2?.length > 0 && (
            <div className="card">
              <h4 className="font-bold text-orange-700 mb-4 flex items-center gap-2"><AlertTriangle className="w-5 h-5" />{t('compare.semanticUniqueDoc2', { name: result.doc2_name })}</h4>
              <div className="space-y-2">
                {result.unique_to_doc2.map((text, i) => <p key={i} className="text-sm text-gray-600 bg-orange-50 p-3 rounded">{text}</p>)}
              </div>
            </div>
          )}
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
