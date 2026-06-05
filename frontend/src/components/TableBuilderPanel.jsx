import { useState, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Plus, Minus, Table2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

const DEFAULT_ROWS = 4
const DEFAULT_COLS = 3
const MAX_ROWS = 20
const MAX_COLS = 10

function makeGrid(rows, cols) {
  return Array.from({ length: rows }, () => Array(cols).fill(''))
}

export default function TableBuilderPanel({ open, onClose, onInsert }) {
  const { t } = useTranslation()
  const [cells, setCells] = useState(() => makeGrid(DEFAULT_ROWS, DEFAULT_COLS))
  const [hasHeader, setHasHeader] = useState(true)
  const firstCellRef = useRef(null)

  useEffect(() => {
    if (open) {
      setCells(makeGrid(DEFAULT_ROWS, DEFAULT_COLS))
      setHasHeader(true)
      setTimeout(() => firstCellRef.current?.focus(), 60)
    }
  }, [open])

  // Close on Escape at overlay level
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  const rows = cells.length
  const cols = cells[0]?.length ?? 0

  const setCell = useCallback((r, c, val) => {
    setCells(prev =>
      prev.map((row, ri) => ri === r ? row.map((v, ci) => ci === c ? val : v) : row)
    )
  }, [])

  const addRow    = () => rows < MAX_ROWS && setCells(p => [...p, Array(cols).fill('')])
  const removeRow = () => rows > 1  && setCells(p => p.slice(0, -1))
  const addCol    = () => cols < MAX_COLS && setCells(p => p.map(r => [...r, '']))
  const removeCol = () => cols > 1  && setCells(p => p.map(r => r.slice(0, -1)))

  const buildMarkdown = () => {
    const sep = Array(cols).fill('---').join(' | ')
    const rowToMd = row => '| ' + row.map(c => (c || ' ').replace(/\|/g, '\\|')).join(' | ') + ' |'
    if (hasHeader) {
      return [rowToMd(cells[0]), `| ${sep} |`, ...cells.slice(1).map(rowToMd)].join('\n')
    }
    const emptyHeader = '| ' + Array(cols).fill(' ').join(' | ') + ' |'
    return [emptyHeader, `| ${sep} |`, ...cells.map(rowToMd)].join('\n')
  }

  const handleInsert = () => {
    onInsert('\n' + buildMarkdown() + '\n')
    onClose()
  }

  const handleCellKeyDown = (e, r, c) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      let nextR = r, nextC = c
      if (e.shiftKey) {
        if (c > 0) { nextC = c - 1 }
        else if (r > 0) { nextR = r - 1; nextC = cols - 1 }
        else return
      } else {
        if (c < cols - 1) { nextC = c + 1 }
        else if (r < rows - 1) { nextR = r + 1; nextC = 0 }
        else return
      }
      document.getElementById(`tbl-cell-${nextR}-${nextC}`)?.focus()
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (r < rows - 1) {
        document.getElementById(`tbl-cell-${r + 1}-${c}`)?.focus()
      }
    }
  }

  if (!open) return null

  return createPortal(
    <AnimatePresence>
      <motion.div
        className="builder-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={e => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          className="builder-panel builder-panel--table"
          initial={{ scale: 0.96, y: 14 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.96, y: 8, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          role="dialog"
          aria-modal="true"
          aria-label="Редактор таблицы"
        >
          {/* Header */}
          <div className="builder-panel__header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Table2 size={16} style={{ color: 'var(--accent-primary)' }} />
              <span className="builder-panel__title">Редактор таблицы</span>
            </div>
            <button className="builder-panel__close-btn" onClick={onClose} aria-label="Закрыть">
              <X size={16} />
            </button>
          </div>

          {/* Body */}
          <div className="builder-panel__body">
            {/* Controls */}
            <div className="tbl-builder__controls">
              <button
                className="tbl-builder__ctrl-btn"
                onClick={addCol}
                disabled={cols >= MAX_COLS}
                title={`Добавить столбец (макс ${MAX_COLS})`}
              >
                <Plus size={11} /> Столбец
              </button>
              <button
                className="tbl-builder__ctrl-btn"
                onClick={removeCol}
                disabled={cols <= 1}
                title="Удалить последний столбец"
              >
                <Minus size={11} /> Столбец
              </button>
              <button
                className="tbl-builder__ctrl-btn"
                onClick={addRow}
                disabled={rows >= MAX_ROWS}
                title={`Добавить строку (макс ${MAX_ROWS})`}
              >
                <Plus size={11} /> Строка
              </button>
              <button
                className="tbl-builder__ctrl-btn"
                onClick={removeRow}
                disabled={rows <= 1}
                title="Удалить последнюю строку"
              >
                <Minus size={11} /> Строка
              </button>

              <label className="tbl-builder__header-toggle">
                <input
                  type="checkbox"
                  checked={hasHeader}
                  onChange={e => setHasHeader(e.target.checked)}
                />
                Шапка
              </label>

              <span className="tbl-builder__size-hint">{rows}×{cols}</span>
            </div>

            {/* Grid */}
            <div className="tbl-builder__grid-wrap">
              <table className="tbl-builder__grid">
                <tbody>
                  {cells.map((row, r) => (
                    <tr key={r}>
                      {row.map((val, c) => {
                        const isHeader = hasHeader && r === 0
                        const Tag = isHeader ? 'th' : 'td'
                        return (
                          <Tag key={c} style={isHeader ? { fontWeight: 600 } : {}}>
                            <input
                              id={`tbl-cell-${r}-${c}`}
                              ref={r === 0 && c === 0 ? firstCellRef : undefined}
                              className="tbl-builder__cell-input"
                              value={val}
                              onChange={e => setCell(r, c, e.target.value)}
                              onKeyDown={e => handleCellKeyDown(e, r, c)}
                              placeholder={isHeader ? `Заголовок ${c + 1}` : ''}
                              style={isHeader ? { fontWeight: 600 } : {}}
                            />
                          </Tag>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: '6px 0 0' }}>
              Tab — следующая ячейка · Shift+Tab — назад · Enter — строка ниже
            </p>
          </div>

          {/* Footer */}
          <div className="builder-panel__footer">
            <button className="builder-panel__cancel-btn" onClick={onClose}>Отмена</button>
            <button className="builder-panel__insert-btn" onClick={handleInsert}>
              Вставить таблицу
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  )
}
