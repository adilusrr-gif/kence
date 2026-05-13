import React, { useState, useEffect, useCallback } from 'react'
import { Navigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageSquare, LayoutTemplate, Settings2, ScanSearch, RotateCcw, Save, AlertTriangle } from 'lucide-react'
import { apiGetPrompts, apiUpdatePrompt, apiResetPrompt, apiResetAllPrompts } from '../lib/api'

const TABS = [
  {
    key: 'chat_prompt',
    Icon: MessageSquare,
    label: 'Чат (RAG)',
    hint: 'Переменные: {context} — фрагменты документа, {question} — вопрос пользователя.',
  },
  {
    key: 'presentation_prompt',
    Icon: LayoutTemplate,
    label: 'Презентация',
    hint: 'Переменные: {context} — содержание документа. Ответ должен быть JSON с "title" и "slides". Для JSON-скобок используйте {{ }}.',
  },
  {
    key: 'comparison_technical_prompt',
    Icon: Settings2,
    label: 'Тех. сравнение',
    hint: 'Переменные: {text} — текст документа. Ответ JSON: "product_name", "specifications", "key_features". Для JSON-скобок используйте {{ }}.',
  },
  {
    key: 'comparison_semantic_prompt',
    Icon: ScanSearch,
    label: 'Сем. анализ',
    hint: 'Переменные: {text} — текст документа.',
  },
]

const s = {
  card: {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    overflow: 'hidden',
  },
  btn: (variant = 'ghost') => ({
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '0.45rem 0.9rem', borderRadius: 7, border: 'none',
    fontSize: 13, fontWeight: 600, cursor: 'pointer',
    transition: 'all 0.15s',
    ...(variant === 'ghost' && {
      border: '1px solid var(--border)',
      background: 'transparent',
      color: 'var(--text-base)',
    }),
    ...(variant === 'primary' && {
      background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
      color: '#fff',
    }),
    ...(variant === 'disabled' && {
      background: 'var(--bg-raised)',
      color: 'var(--text-faint)',
      cursor: 'not-allowed',
    }),
    ...(variant === 'danger' && {
      background: '#fef2f2',
      border: '1px solid #fecaca',
      color: '#dc2626',
    }),
  }),
}

function SkeletonBlock({ h = 20, w = '100%', mb = 0 }) {
  return (
    <div style={{
      height: h, width: w, borderRadius: 6, marginBottom: mb,
      background: 'linear-gradient(90deg, var(--bg-raised) 25%, var(--bg-hover) 50%, var(--bg-raised) 75%)',
      backgroundSize: '200% 100%',
      animation: 'skeleton-shimmer 1.4s ease-in-out infinite',
    }} />
  )
}

export default function AISettingsPage({ currentUser }) {
  if (currentUser?.role !== 'admin') return <Navigate to="/" replace />

  const [activeTab, setActiveTab]     = useState('chat_prompt')
  const [prompts, setPrompts]         = useState({})
  const [editValues, setEditValues]   = useState({})
  const [saving, setSaving]           = useState(null)
  const [resetting, setResetting]     = useState(null)
  const [loading, setLoading]         = useState(true)
  const [toast, setToast]             = useState(null)
  const [confirmReset, setConfirmReset]   = useState(null)  // key or 'all'
  const [confirmAllReset, setConfirmAllReset] = useState(false)

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  const loadPrompts = useCallback(async () => {
    try {
      setLoading(true)
      const data = await apiGetPrompts()
      setPrompts(data.prompts)
      setEditValues(data.prompts)
    } catch (err) {
      showToast(err.message, false)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadPrompts() }, [loadPrompts])

  const handleSave = async (key) => {
    setSaving(key)
    try {
      await apiUpdatePrompt(key, editValues[key])
      setPrompts(prev => ({ ...prev, [key]: editValues[key] }))
      showToast('Промпт сохранён')
    } catch (err) {
      showToast(err.message, false)
    } finally {
      setSaving(null)
    }
  }

  const handleReset = async (key) => {
    if (confirmReset !== key) {
      setConfirmReset(key)
      setTimeout(() => setConfirmReset(r => r === key ? null : r), 4000)
      return
    }
    setConfirmReset(null)
    setResetting(key)
    try {
      const data = await apiResetPrompt(key)
      setPrompts(prev => ({ ...prev, [key]: data.content }))
      setEditValues(prev => ({ ...prev, [key]: data.content }))
      showToast('Промпт сброшен к дефолту')
    } catch (err) {
      showToast(err.message, false)
    } finally {
      setResetting(null)
    }
  }

  const handleResetAll = async () => {
    if (!confirmAllReset) {
      setConfirmAllReset(true)
      setTimeout(() => setConfirmAllReset(false), 4000)
      return
    }
    setConfirmAllReset(false)
    try {
      await apiResetAllPrompts()
      await loadPrompts()
      showToast('Все промпты сброшены')
    } catch (err) {
      showToast(err.message, false)
    }
  }

  const activeTabInfo = TABS.find(t => t.key === activeTab)
  const isDirty = editValues[activeTab] !== prompts[activeTab]

  return (
    <div style={{ maxWidth: 940, margin: '0 auto', padding: '2rem 1rem', position: 'relative' }}>

      {/* Skeleton shimmer keyframe injected once */}
      <style>{`
        @keyframes skeleton-shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            role="status"
            aria-live="polite"
            style={{
              position: 'fixed', top: 20, right: 24, zIndex: 9999,
              padding: '0.75rem 1.25rem', borderRadius: 10, fontSize: 14, fontWeight: 600,
              background: toast.ok ? '#d1fae5' : '#fee2e2',
              color:      toast.ok ? '#065f46' : '#991b1b',
              boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            }}
          >
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.5rem', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800 }}>Настройки ИИ</h1>
          <p style={{ margin: '0.25rem 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
            Управление промптами генерации — только для администраторов
          </p>
        </div>
        <button
          onClick={handleResetAll}
          aria-label="Сбросить все промпты к дефолту"
          style={{
            ...s.btn(confirmAllReset ? 'danger' : 'ghost'),
            flexShrink: 0,
            gap: 5,
          }}
        >
          <AlertTriangle size={13} style={{ opacity: confirmAllReset ? 1 : 0.6 }} />
          {confirmAllReset ? 'Подтвердить сброс всех' : 'Сбросить всё'}
        </button>
      </div>

      {loading ? (
        /* Skeleton */
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 16 }}>
          <div style={{ ...s.card, padding: '0.5rem' }}>
            {[...Array(4)].map((_, i) => (
              <div key={i} style={{ padding: '0.85rem 1rem', borderBottom: '1px solid var(--border)' }}>
                <SkeletonBlock h={14} w="80%" />
              </div>
            ))}
          </div>
          <div style={{ ...s.card, padding: '1.5rem' }}>
            <SkeletonBlock h={16} w="40%" mb={8} />
            <SkeletonBlock h={12} w="70%" mb={20} />
            <SkeletonBlock h={320} />
          </div>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 16, alignItems: 'start' }}
        >
          {/* Tab list */}
          <div style={s.card}>
            {TABS.map(({ key, Icon, label }) => {
              const dirty = editValues[key] !== prompts[key]
              const active = activeTab === key
              return (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  aria-pressed={active}
                  aria-label={`Редактировать промпт: ${label}`}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 9,
                    padding: '0.85rem 1.1rem', border: 'none', textAlign: 'left',
                    background: active ? 'color-mix(in srgb, #6366f1 12%, var(--bg-surface))' : 'transparent',
                    borderLeft: `3px solid ${active ? '#6366f1' : 'transparent'}`,
                    color: 'var(--text-base)', cursor: 'pointer', fontSize: 13.5,
                    fontWeight: active ? 700 : 500,
                    borderBottom: '1px solid var(--border-soft)',
                    transition: 'background 0.15s, border-color 0.15s',
                  }}
                >
                  <Icon size={15} style={{ opacity: active ? 1 : 0.55, flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>{label}</span>
                  {dirty && (
                    <span aria-label="Несохранённые изменения" style={{
                      width: 7, height: 7, borderRadius: '50%',
                      background: '#f59e0b', flexShrink: 0,
                    }} />
                  )}
                </button>
              )
            })}
          </div>

          {/* Editor panel */}
          <div style={s.card}>
            {/* Editor header */}
            <div style={{
              padding: '1.1rem 1.5rem 0.9rem',
              borderBottom: '1px solid var(--border-soft)',
              display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: 3, color: 'var(--text-base)' }}>
                  {activeTabInfo?.label}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  {activeTabInfo?.hint}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 7, flexShrink: 0 }}>
                {/* Reset button — two-step confirmation */}
                {confirmReset === activeTab ? (
                  <>
                    <button
                      onClick={() => setConfirmReset(null)}
                      aria-label="Отменить сброс"
                      style={{ ...s.btn('ghost'), fontSize: 12 }}
                    >
                      Отмена
                    </button>
                    <button
                      onClick={() => handleReset(activeTab)}
                      disabled={resetting === activeTab}
                      aria-label="Подтвердить сброс промпта"
                      style={{ ...s.btn('danger'), fontSize: 12 }}
                    >
                      <RotateCcw size={11} />
                      {resetting === activeTab ? '…' : 'Подтвердить'}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => handleReset(activeTab)}
                    disabled={resetting === activeTab}
                    aria-label="Сбросить промпт к значению по умолчанию"
                    style={{ ...s.btn('ghost'), opacity: 0.8 }}
                  >
                    <RotateCcw size={12} />
                    Сбросить
                  </button>
                )}
                <button
                  onClick={() => handleSave(activeTab)}
                  disabled={saving === activeTab || !isDirty}
                  aria-label={isDirty ? 'Сохранить промпт' : 'Нет изменений для сохранения'}
                  style={saving === activeTab || !isDirty ? s.btn('disabled') : s.btn('primary')}
                >
                  <Save size={12} />
                  {saving === activeTab ? 'Сохранение…' : 'Сохранить'}
                </button>
              </div>
            </div>

            {/* Textarea */}
            <label style={{ display: 'block' }}>
              <span className="sr-only" style={{
                position: 'absolute', width: 1, height: 1,
                overflow: 'hidden', clip: 'rect(0,0,0,0)',
              }}>
                {`Редактор промпта: ${activeTabInfo?.label}`}
              </span>
              <textarea
                value={editValues[activeTab] || ''}
                onChange={e => setEditValues(prev => ({ ...prev, [activeTab]: e.target.value }))}
                aria-label={`Редактор промпта: ${activeTabInfo?.label}`}
                spellCheck={false}
                style={{
                  display: 'block', width: '100%', minHeight: 400, padding: '1.1rem 1.5rem',
                  border: 'none', outline: 'none', resize: 'vertical',
                  fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
                  fontSize: 12.5, lineHeight: 1.75,
                  background: 'var(--input-bg)',
                  color: 'var(--text-base)',
                  boxSizing: 'border-box',
                }}
              />
            </label>

            {/* Unsaved indicator */}
            <AnimatePresence>
              {isDirty && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  style={{
                    padding: '0.5rem 1.5rem',
                    borderTop: '1px solid var(--border-soft)',
                    fontSize: 12, color: '#f59e0b', fontWeight: 600,
                  }}
                >
                  ● Несохранённые изменения
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </div>
  )
}
