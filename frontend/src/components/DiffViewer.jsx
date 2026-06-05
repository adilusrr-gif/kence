import { useState, useMemo } from 'react'
import { CheckCircle, ScanText } from 'lucide-react'
import { useTranslation } from 'react-i18next'

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

export default function DiffViewer({ result }) {
  const { t } = useTranslation()
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
      <h3 className="text-xl font-bold text-green-700">{t('compare.exactIdentical')}</h3>
      <p className="text-gray-500 mt-2">{t('compare.exactIdenticalDesc', { chars: result.doc1_chars.toLocaleString() })}</p>
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <ScanText className="w-6 h-6 text-red-500" />
          <h3 className="text-xl font-bold">{t('compare.exactTitle')}</h3>
          <span className="ml-auto bg-red-100 text-red-700 text-sm font-bold px-3 py-1 rounded-full">
            {t('compare.exactDiffCount', { count: result.diff_count })}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-gray-50 p-3 rounded-lg text-center">
            <p className="text-lg font-bold">{result.doc1_chars.toLocaleString()}</p>
            <p className="text-xs text-gray-500">{t('compare.exactCharsDoc1')}</p>
          </div>
          <div className="bg-gray-50 p-3 rounded-lg text-center">
            <p className="text-lg font-bold">{result.doc2_chars.toLocaleString()}</p>
            <p className="text-xs text-gray-500">{t('compare.exactCharsDoc2')}</p>
          </div>
          <div className="bg-red-50 p-3 rounded-lg text-center">
            <p className="text-lg font-bold text-red-600">{Math.abs(result.doc1_chars - result.doc2_chars).toLocaleString()}</p>
            <p className="text-xs text-gray-500">{t('compare.exactCharsDiff')}</p>
          </div>
        </div>
        <div className="flex gap-4 mt-4 text-xs">
          <span className="flex items-center gap-1"><span style={{display:'inline-block',width:12,height:12,background:'#fee2e2',borderRadius:2}}/> {t('compare.exactLegendRemoved')}</span>
          <span className="flex items-center gap-1"><span style={{display:'inline-block',width:12,height:12,background:'#d1fae5',borderRadius:2}}/> {t('compare.exactLegendAdded')}</span>
          <span className="flex items-center gap-1"><span style={{display:'inline-block',width:12,height:12,background:'#fca5a5',borderRadius:2}}/> {t('compare.exactLegendChanged')}</span>
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
                          {t('compare.exactCollapse')}
                        </button>
                      </>
                    : <button onClick={() => setExpanded(s => new Set([...s, si]))}
                        style={{ display:'block', width:'100%', padding:'4px', background:'#f1f5f9', border:'none', cursor:'pointer', fontSize:12, color:'#64748b' }}>
                        {t('compare.exactExpand', { count: lines.length - 6 })}
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
