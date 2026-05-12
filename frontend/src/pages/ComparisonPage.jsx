import React, { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Upload, Loader2, GitCompare, Brain, Wrench, CheckCircle, XCircle, AlertTriangle, FileText, ScanText } from 'lucide-react'
import { apiCreateSession, apiCompareUpload, apiCompareSemantic, apiCompareTechnical, apiCompareExact } from '../lib/api'

// ── Exact diff viewer ────────────────────────────────────────────────────────

function CharLine({ ops, bg, marker, highlight }) {
  return (
    <div style={{ background: bg, fontFamily: 'monospace', fontSize: 13, padding: '2px 12px 2px 8px', whiteSpace: 'pre-wrap', wordBreak: 'break-all', display: 'flex', gap: 8 }}>
      <span style={{ opacity: 0.45, userSelect: 'none', minWidth: 12 }}>{marker}</span>
      <span>
        {ops.map((op, i) =>
          op.type === highlight
            ? <mark key={i} style={{ background: highlight === 'delete' ? '#fca5a5' : '#6ee7b7', color: 'inherit', borderRadius: 2 }}>{op.text}</mark>
            : <span key={i}>{op.text}</span>
        )}
      </span>
    </div>
  )
}

function DiffViewer({ result }) {
  const [expanded, setExpanded] = useState(new Set())

  const segments = useMemo(() => {
    const segs = []
    let i = 0
    const lines = result.diff_lines
    while (i < lines.length) {
      if (lines[i].type === 'equal') {
        let j = i
        while (j < lines.length && lines[j].type === 'equal') j++
        segs.push({ kind: 'equal', lines: lines.slice(i, j), startIdx: i })
        i = j
      } else {
        segs.push({ kind: 'change', line: lines[i], idx: i })
        i++
      }
    }
    return segs
  }, [result.diff_lines])

  if (result.is_identical) return (
    <div className="card text-center py-12">
      <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
      <h3 className="text-xl font-bold text-green-700">Документы идентичны</h3>
      <p className="text-gray-500 mt-2">Все {result.doc1_chars.toLocaleString()} символов совпадают до единой буквы</p>
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <ScanText className="w-6 h-6 text-red-500" />
          <h3 className="text-xl font-bold">Точное сравнение</h3>
          <span className="ml-auto bg-red-100 text-red-700 text-sm font-bold px-3 py-1 rounded-full">
            {result.diff_count} несоответстви{result.diff_count === 1 ? 'е' : result.diff_count < 5 ? 'я' : 'й'}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-gray-50 p-3 rounded-lg text-center">
            <p className="text-lg font-bold">{result.doc1_chars.toLocaleString()}</p>
            <p className="text-xs text-gray-500">символов в документе 1</p>
          </div>
          <div className="bg-gray-50 p-3 rounded-lg text-center">
            <p className="text-lg font-bold">{result.doc2_chars.toLocaleString()}</p>
            <p className="text-xs text-gray-500">символов в документе 2</p>
          </div>
          <div className="bg-red-50 p-3 rounded-lg text-center">
            <p className="text-lg font-bold text-red-600">{Math.abs(result.doc1_chars - result.doc2_chars).toLocaleString()}</p>
            <p className="text-xs text-gray-500">разница символов</p>
          </div>
        </div>
        <div className="flex gap-4 mt-4 text-xs">
          <span className="flex items-center gap-1"><span style={{display:'inline-block',width:12,height:12,background:'#fee2e2',borderRadius:2}}/> Удалено (документ 1)</span>
          <span className="flex items-center gap-1"><span style={{display:'inline-block',width:12,height:12,background:'#d1fae5',borderRadius:2}}/> Добавлено (документ 2)</span>
          <span className="flex items-center gap-1"><span style={{display:'inline-block',width:12,height:12,background:'#fca5a5',borderRadius:2}}/> Изменённые символы</span>
        </div>
      </div>

      {/* Diff */}
      <div className="card p-0 overflow-hidden">
        <div style={{ maxHeight: 600, overflowY: 'auto', fontSize: 13 }}>
          {segments.map((seg, si) => {
            if (seg.kind === 'equal') {
              const lines = seg.lines
              const isLong = lines.length > 6
              const isOpen = expanded.has(si)
              if (!isLong) return lines.map((l, li) => (
                <div key={`${si}-${li}`} style={{ fontFamily: 'monospace', padding: '1px 12px 1px 8px', whiteSpace: 'pre-wrap', wordBreak: 'break-all', display: 'flex', gap: 8, opacity: 0.55 }}>
                  <span style={{ userSelect: 'none', minWidth: 12 }}> </span>
                  <span>{l.text}</span>
                </div>
              ))
              return (
                <div key={si}>
                  {lines.slice(0, 3).map((l, li) => (
                    <div key={li} style={{ fontFamily: 'monospace', padding: '1px 12px 1px 8px', whiteSpace: 'pre-wrap', wordBreak: 'break-all', display: 'flex', gap: 8, opacity: 0.55 }}>
                      <span style={{ userSelect: 'none', minWidth: 12 }}> </span><span>{l.text}</span>
                    </div>
                  ))}
                  {isOpen
                    ? <>
                        {lines.slice(3, lines.length - 3).map((l, li) => (
                          <div key={li} style={{ fontFamily: 'monospace', padding: '1px 12px 1px 8px', whiteSpace: 'pre-wrap', wordBreak: 'break-all', display: 'flex', gap: 8, opacity: 0.55 }}>
                            <span style={{ userSelect: 'none', minWidth: 12 }}> </span><span>{l.text}</span>
                          </div>
                        ))}
                        <button onClick={() => setExpanded(s => { const n = new Set(s); n.delete(si); return n })}
                          style={{ display:'block', width:'100%', padding:'4px', background:'#f1f5f9', border:'none', cursor:'pointer', fontSize:12, color:'#64748b' }}>
                          ▲ Свернуть
                        </button>
                      </>
                    : <button onClick={() => setExpanded(s => new Set([...s, si]))}
                        style={{ display:'block', width:'100%', padding:'4px', background:'#f1f5f9', border:'none', cursor:'pointer', fontSize:12, color:'#64748b' }}>
                        ··· {lines.length - 6} строк совпадают — нажмите чтобы развернуть
                      </button>
                  }
                  {lines.slice(lines.length - 3).map((l, li) => (
                    <div key={li} style={{ fontFamily: 'monospace', padding: '1px 12px 1px 8px', whiteSpace: 'pre-wrap', wordBreak: 'break-all', display: 'flex', gap: 8, opacity: 0.55 }}>
                      <span style={{ userSelect: 'none', minWidth: 12 }}> </span><span>{l.text}</span>
                    </div>
                  ))}
                </div>
              )
            }

            const { line } = seg
            if (line.type === 'delete') return (
              <div key={si} style={{ background: '#fee2e2', fontFamily: 'monospace', fontSize: 13, padding: '2px 12px 2px 8px', whiteSpace: 'pre-wrap', wordBreak: 'break-all', display: 'flex', gap: 8 }}>
                <span style={{ color: '#dc2626', minWidth: 12 }}>−</span>
                <span>{line.text}</span>
              </div>
            )
            if (line.type === 'insert') return (
              <div key={si} style={{ background: '#d1fae5', fontFamily: 'monospace', fontSize: 13, padding: '2px 12px 2px 8px', whiteSpace: 'pre-wrap', wordBreak: 'break-all', display: 'flex', gap: 8 }}>
                <span style={{ color: '#059669', minWidth: 12 }}>+</span>
                <span>{line.text}</span>
              </div>
            )
            if (line.type === 'replace') {
              const oldOps = line.char_ops.filter(o => o.type === 'equal' || o.type === 'delete')
              const newOps = line.char_ops.filter(o => o.type === 'equal' || o.type === 'insert')
              return (
                <div key={si}>
                  <CharLine ops={oldOps} bg="#fee2e2" marker="−" highlight="delete" />
                  <CharLine ops={newOps} bg="#d1fae5" marker="+" highlight="insert" />
                </div>
              )
            }
            return null
          })}
        </div>
      </div>
    </div>
  )
}

function ComparisonPage() {
    const [sessionId, setSessionId] = useState(null)
    const [file1, setFile1] = useState(null)
    const [file2, setFile2] = useState(null)
    const [uploading, setUploading] = useState(false)
    const [comparing, setComparing] = useState(false)
    const [result, setResult] = useState(null)
    const [mode, setMode] = useState(null)
    const [error, setError] = useState('')
    const navigate = useNavigate()

    const allowedFormats = ['.pdf','.docx','.doc','.pptx','.ppt','.xlsx','.xls','.html','.htm','.txt','.png','.jpg','.jpeg','.tiff','.tex']

    const handleFile1 = (e) => {
        const f = e.target.files[0]
        if (f) {
            const ext = '.' + f.name.split('.').pop().toLowerCase()
            if (!allowedFormats.includes(ext)) { setError('Неподдерживаемый формат файла 1'); return }
            setFile1(f); setError('')
        }
    }

    const handleFile2 = (e) => {
        const f = e.target.files[0]
        if (f) {
            const ext = '.' + f.name.split('.').pop().toLowerCase()
            if (!allowedFormats.includes(ext)) { setError('Неподдерживаемый формат файла 2'); return }
            setFile2(f); setError('')
        }
    }

    const handleUpload = async () => {
        if (!file1 || !file2) return
        setUploading(true); setError('')
        try {
            const { session_id: sid } = await apiCreateSession()
            setSessionId(sid)
            await apiCompareUpload(sid, file1, file2)
            setUploading(false)
        } catch (err) {
            setError(err.message || 'Ошибка загрузки')
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
            setError(err.message || 'Ошибка сравнения')
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
                    <h2 className="text-2xl font-bold">Сравнение документов</h2>
                    <p className="text-gray-500 text-sm">Сравните два документа по смыслу или техническим характеристикам</p>
                </div>
            </div>

            {!sessionId && (
                <div className="card">
                    <div className="grid grid-cols-2 gap-6 mb-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Документ 1</label>
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
                                        <p className="text-sm text-gray-500">Выберите файл 1</p>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Документ 2</label>
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
                                        <p className="text-sm text-gray-500">Выберите файл 2</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {error && <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">{error}</div>}

                    <button onClick={handleUpload} disabled={!file1 || !file2 || uploading} className="btn-primary w-full flex items-center justify-center gap-2">
                        {uploading ? <><Loader2 className="w-5 h-5 animate-spin" />Загрузка...</> : <><GitCompare className="w-5 h-5" />Загрузить для сравнения</>}
                    </button>
                </div>
            )}

            {sessionId && !result && !comparing && (
                <div className="card text-center py-10">
                    <GitCompare className="w-16 h-16 text-primary mx-auto mb-4" />
                    <h3 className="text-xl font-bold mb-2">Выберите режим сравнения</h3>
                    <p className="text-gray-500 mb-8">Как вы хотите сравнить документы?</p>
                    <div className="grid grid-cols-3 gap-4 max-w-2xl mx-auto">
                        <button onClick={() => handleCompare('semantic')} className="card hover:shadow-lg hover:border-primary transition-all text-left">
                            <Brain className="w-10 h-10 text-secondary mb-3" />
                            <h4 className="font-bold text-lg mb-1">По смыслу</h4>
                            <p className="text-sm text-gray-500">Общие темы, различия в содержании, схожесть текстов</p>
                        </button>
                        <button onClick={() => handleCompare('technical')} className="card hover:shadow-lg hover:border-primary transition-all text-left">
                            <Wrench className="w-10 h-10 text-accent mb-3" />
                            <h4 className="font-bold text-lg mb-1">Технические спецификации</h4>
                            <p className="text-sm text-gray-500">Параметры товаров, характеристики, совпадения по спекам</p>
                        </button>
                        <button onClick={() => handleCompare('exact')} className="card hover:shadow-lg hover:border-red-400 transition-all text-left">
                            <ScanText className="w-10 h-10 text-red-500 mb-3" />
                            <h4 className="font-bold text-lg mb-1">Точное сравнение</h4>
                            <p className="text-sm text-gray-500">Побуквенный diff — каждый символ должен совпадать</p>
                        </button>
                    </div>
                </div>
            )}

            {comparing && (
                <div className="card text-center py-12">
                    <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
                    <h3 className="text-lg font-medium">
                        {mode === 'semantic' ? 'Анализируем смысловое содержание...'
                        : mode === 'technical' ? 'Сравниваем технические характеристики...'
                        : 'Выполняем точное посимвольное сравнение...'}
                    </h3>
                    <p className="text-gray-500 text-sm mt-2">Это может занять 10-30 секунд</p>
                </div>
            )}

            {result && mode === 'semantic' && (
                <div className="space-y-6">
                    <div className="card">
                        <div className="flex items-center gap-3 mb-4">
                            <Brain className="w-6 h-6 text-secondary" />
                            <h3 className="text-xl font-bold">Сравнение по смыслу</h3>
                        </div>
                        <div className="grid grid-cols-3 gap-4 mb-6">
                            <div className="bg-green-50 p-4 rounded-lg text-center">
                                <p className="text-2xl font-bold text-green-600">{result.summary?.similar_sections || 0}</p>
                                <p className="text-sm text-gray-600">Схожих разделов</p>
                            </div>
                            <div className="bg-blue-50 p-4 rounded-lg text-center">
                                <p className="text-2xl font-bold text-blue-600">{result.summary?.unique_doc1_sections || 0}</p>
                                <p className="text-sm text-gray-600">Только в документе 1</p>
                            </div>
                            <div className="bg-orange-50 p-4 rounded-lg text-center">
                                <p className="text-2xl font-bold text-orange-600">{result.summary?.unique_doc2_sections || 0}</p>
                                <p className="text-sm text-gray-600">Только в документе 2</p>
                            </div>
                        </div>
                    </div>

                    {result.similarities?.length > 0 && (
                        <div className="card">
                            <h4 className="font-bold text-green-700 mb-4 flex items-center gap-2"><CheckCircle className="w-5 h-5" />Схожие разделы</h4>
                            <div className="space-y-3">
                                {result.similarities.map((item, i) => (
                                    <div key={i} className="bg-green-50 p-4 rounded-lg">
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="text-xs bg-green-200 text-green-800 px-2 py-1 rounded">Совпадение: {(item.similarity_score * 100).toFixed(0)}%</span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4 text-sm">
                                            <div><p className="text-gray-500 text-xs mb-1">Документ 1:</p><p className="text-gray-700">{item.doc1_text}</p></div>
                                            <div><p className="text-gray-500 text-xs mb-1">Документ 2:</p><p className="text-gray-700">{item.doc2_text}</p></div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {result.unique_to_doc1?.length > 0 && (
                        <div className="card">
                            <h4 className="font-bold text-blue-700 mb-4 flex items-center gap-2"><AlertTriangle className="w-5 h-5" />Только в "{result.doc1_name}"</h4>
                            <div className="space-y-2">
                                {result.unique_to_doc1.map((text, i) => <p key={i} className="text-sm text-gray-600 bg-blue-50 p-3 rounded">{text}</p>)}
                            </div>
                        </div>
                    )}

                    {result.unique_to_doc2?.length > 0 && (
                        <div className="card">
                            <h4 className="font-bold text-orange-700 mb-4 flex items-center gap-2"><AlertTriangle className="w-5 h-5" />Только в "{result.doc2_name}"</h4>
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
                            <h3 className="text-xl font-bold">Сравнение технических спецификаций</h3>
                        </div>
                        <div className="mb-6">
                            <div className="flex items-center justify-between mb-2">
                                <span className="font-medium">Совпадение характеристик</span>
                                <span className="text-2xl font-bold text-primary">{result.match_percentage}%</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-3">
                                <div className="bg-primary h-3 rounded-full transition-all" style={{ width: `${result.match_percentage}%` }} />
                            </div>
                            <p className="text-sm text-gray-500 mt-2">{result.comparison?.matched?.length || 0} из {result.comparison?.total_parameters || 0} параметров совпадают</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4 mb-6">
                            <div className="bg-gray-50 p-4 rounded-lg">
                                <p className="text-sm text-gray-500 mb-1">Документ 1</p>
                                <p className="font-bold">{result.doc1_specs?.product_name || 'Не определено'}</p>
                            </div>
                            <div className="bg-gray-50 p-4 rounded-lg">
                                <p className="text-sm text-gray-500 mb-1">Документ 2</p>
                                <p className="font-bold">{result.doc2_specs?.product_name || 'Не определено'}</p>
                            </div>
                        </div>
                    </div>

                    {result.comparison?.matched?.length > 0 && (
                        <div className="card">
                            <h4 className="font-bold text-green-700 mb-4 flex items-center gap-2"><CheckCircle className="w-5 h-5" />Совпадающие параметры ({result.comparison.matched.length})</h4>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-green-50">
                                        <tr><th className="text-left p-3 rounded-tl-lg">Параметр</th><th className="text-left p-3">Значение</th><th className="text-left p-3 rounded-tr-lg">Ед. изм.</th></tr>
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
                            <h4 className="font-bold text-red-600 mb-4 flex items-center gap-2"><XCircle className="w-5 h-5" />Различающиеся параметры ({result.comparison.mismatched.length})</h4>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-red-50">
                                        <tr><th className="text-left p-3 rounded-tl-lg">Параметр</th><th className="text-left p-3">Документ 1</th><th className="text-left p-3">Документ 2</th><th className="text-left p-3 rounded-tr-lg">Ед. изм.</th></tr>
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
                            <h4 className="font-bold text-blue-700 mb-4">Только в документе 1 ({result.comparison.only_in_doc1.length})</h4>
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
                            <h4 className="font-bold text-orange-700 mb-4">Только в документе 2 ({result.comparison.only_in_doc2.length})</h4>
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
                        🔄 Сравнить другие документы
                    </button>
                </div>
            )}
        </div>
    )
}

export default ComparisonPage
