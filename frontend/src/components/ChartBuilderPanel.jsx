import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Plus, Trash2, BarChart2, TrendingUp, PieChart, Activity } from 'lucide-react'
import {
  BarChart, Bar, LineChart, Line, PieChart as RechartsPie, Pie, Cell,
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'

const CHART_TYPES = [
  { key: 'bar',  label: 'Столбчатый', Icon: BarChart2 },
  { key: 'line', label: 'Линейный',   Icon: TrendingUp },
  { key: 'pie',  label: 'Круговой',   Icon: PieChart },
  { key: 'area', label: 'Площадь',    Icon: Activity },
]

const COLORS = [
  'var(--color-cyan-400)',
  'var(--color-blue-400)',
  'var(--color-violet-400)',
  'var(--color-green-400)',
  'var(--color-amber-400)',
  'var(--color-red-400)',
]

const DEFAULT_ROWS = [
  { label: '', value: '' },
  { label: '', value: '' },
  { label: '', value: '' },
]

function buildDirective(type, title, rows) {
  const data = rows
    .filter(r => r.label.trim())
    .map(r => ({ label: r.label.trim(), value: parseFloat(r.value) || 0 }))
  const json = JSON.stringify(data)
  const safeTitle = title.replace(/"/g, "'")
  return `[CHART type="${type}" title="${safeTitle}" data='${json}']`
}

function ChartPreview({ type, title, data }) {
  if (!data.length) {
    return <div className="chart-preview__empty">Добавьте данные для предпросмотра</div>
  }

  const rechartData = data.map(r => ({ name: r.label || '—', value: parseFloat(r.value) || 0 }))

  const commonProps = {
    data: rechartData,
    margin: { top: 4, right: 4, bottom: 4, left: -12 },
  }

  const tooltipStyle = {
    contentStyle: {
      background: 'var(--bg-surface-2)',
      border: '1px solid var(--border-default)',
      borderRadius: 6,
      fontSize: 11,
    },
  }

  let chart
  if (type === 'bar') {
    chart = (
      <BarChart {...commonProps}>
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} />
        <YAxis tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} />
        <Tooltip {...tooltipStyle} />
        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
          {rechartData.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    )
  } else if (type === 'line') {
    chart = (
      <LineChart {...commonProps}>
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} />
        <YAxis tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} />
        <Tooltip {...tooltipStyle} />
        <Line
          type="monotone" dataKey="value"
          stroke="var(--color-cyan-400)" strokeWidth={2}
          dot={{ fill: 'var(--color-cyan-400)', r: 3 }}
        />
      </LineChart>
    )
  } else if (type === 'area') {
    chart = (
      <AreaChart {...commonProps}>
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-cyan-400)" stopOpacity={0.3} />
            <stop offset="95%" stopColor="var(--color-cyan-400)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} />
        <YAxis tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} />
        <Tooltip {...tooltipStyle} />
        <Area
          type="monotone" dataKey="value"
          stroke="var(--color-cyan-400)" strokeWidth={2}
          fill="url(#areaGrad)"
        />
      </AreaChart>
    )
  } else {
    // pie
    chart = (
      <RechartsPie margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
        <Pie
          data={rechartData} dataKey="value" nameKey="name"
          innerRadius={40} outerRadius={70}
          paddingAngle={2}
        >
          {rechartData.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip {...tooltipStyle} />
        <Legend
          wrapperStyle={{ fontSize: 10, color: 'var(--text-tertiary)' }}
          iconSize={8}
        />
      </RechartsPie>
    )
  }

  return (
    <div className="chart-preview" style={{ flex: 1 }}>
      {title && <div className="chart-preview__title">{title}</div>}
      <ResponsiveContainer width="100%" height={200}>
        {chart}
      </ResponsiveContainer>
    </div>
  )
}

export default function ChartBuilderPanel({
  open,
  onClose,
  onInsert,
  onReplace,
  initialType,
  initialTitle,
  initialData,
}) {
  const [type, setType]   = useState('bar')
  const [title, setTitle] = useState('')
  const [rows, setRows]   = useState(DEFAULT_ROWS)

  // Reset / pre-fill when opened
  useEffect(() => {
    if (open) {
      setType(initialType || 'bar')
      setTitle(initialTitle || '')
      if (initialData && Array.isArray(initialData)) {
        setRows(initialData.map(d => ({ label: String(d.label ?? ''), value: String(d.value ?? '') })))
      } else {
        setRows([...DEFAULT_ROWS])
      }
    }
  }, [open, initialType, initialTitle, initialData])

  // Escape to close
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  // Debounced preview data — update immediately (no need to debounce for small datasets)
  const previewData = useMemo(
    () => rows.filter(r => r.label.trim()),
    [rows]
  )

  const setRow = (i, field, val) =>
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r))

  const addRow    = () => rows.length < 50 && setRows(p => [...p, { label: '', value: '' }])
  const removeRow = (i) => rows.length > 1 && setRows(p => p.filter((_, idx) => idx !== i))

  const handleAction = (replace) => {
    const directive = buildDirective(type, title, rows)
    if (replace && onReplace) onReplace(directive)
    else onInsert(directive)
    onClose()
  }

  const isReplaceMode = Boolean(onReplace && (initialType || initialTitle || initialData))

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
          className="builder-panel builder-panel--chart"
          initial={{ scale: 0.96, y: 14 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.96, y: 8, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          role="dialog"
          aria-modal="true"
          aria-label="Редактор графика"
        >
          {/* Header */}
          <div className="builder-panel__header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <BarChart2 size={16} style={{ color: 'var(--accent-primary)' }} />
              <span className="builder-panel__title">
                {isReplaceMode ? 'Редактировать график' : 'Создать график'}
              </span>
            </div>
            <button className="builder-panel__close-btn" onClick={onClose} aria-label="Закрыть">
              <X size={16} />
            </button>
          </div>

          {/* Body */}
          <div className="builder-panel__body">
            <div className="chart-builder__body">

              {/* Settings column */}
              <div className="chart-builder__settings">

                {/* Type selector */}
                <div>
                  <label className="chart-builder__label">Тип графика</label>
                  <div className="chart-builder__type-grid">
                    {CHART_TYPES.map(({ key, label, Icon }) => (
                      <button
                        key={key}
                        className={`chart-builder__type-card${type === key ? ' chart-builder__type-card--active' : ''}`}
                        onClick={() => setType(key)}
                        type="button"
                      >
                        <Icon size={18} />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Title */}
                <div>
                  <label className="chart-builder__label">Заголовок</label>
                  <input
                    className="chart-builder__input"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="Название графика"
                  />
                </div>

                {/* Data rows */}
                <div>
                  <label className="chart-builder__label">Данные</label>
                  <div className="chart-builder__data-section">
                    <div className="chart-builder__data-header">
                      <span>Метка</span>
                      <span>Значение</span>
                      <span />
                    </div>
                    {rows.map((row, i) => (
                      <div key={i} className="chart-builder__data-row">
                        <input
                          className="chart-builder__input"
                          value={row.label}
                          onChange={e => setRow(i, 'label', e.target.value)}
                          placeholder={`Метка ${i + 1}`}
                        />
                        <input
                          className="chart-builder__input"
                          style={{ flex: '0 0 90px' }}
                          value={row.value}
                          onChange={e => setRow(i, 'value', e.target.value)}
                          placeholder="0"
                          type="number"
                          min="0"
                          step="any"
                        />
                        <button
                          className="chart-builder__row-del"
                          onClick={() => removeRow(i)}
                          aria-label="Удалить строку"
                          disabled={rows.length <= 1}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                    <button className="chart-builder__add-row" onClick={addRow} type="button">
                      <Plus size={12} /> Добавить строку
                    </button>
                  </div>
                </div>
              </div>

              {/* Preview column */}
              <div className="chart-builder__preview-col">
                <label className="chart-builder__label">Предпросмотр</label>
                <ChartPreview type={type} title={title} data={previewData} />
                <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: 0, lineHeight: 1.4 }}>
                  График будет вставлен как директива в документ и отображён в области просмотра.
                </p>
              </div>

            </div>
          </div>

          {/* Footer */}
          <div className="builder-panel__footer">
            <button className="builder-panel__cancel-btn" onClick={onClose}>Отмена</button>
            {isReplaceMode ? (
              <button className="builder-panel__insert-btn" onClick={() => handleAction(true)}>
                Сохранить изменения
              </button>
            ) : (
              <button className="builder-panel__insert-btn" onClick={() => handleAction(false)}>
                Вставить график
              </button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  )
}
