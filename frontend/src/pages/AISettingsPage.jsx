import React, { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { MessageSquare, FileSearch, MessagesSquare, Settings2, ScanSearch, RotateCcw, Save, AlertTriangle, User, Globe } from 'lucide-react'
import { apiGetPrompts, apiUpdatePrompt, apiResetPrompt, apiResetAllPrompts } from '../lib/api'

const TABS = [
  {
    key: 'chat_prompt',
    Icon: MessageSquare,
    labelKey: 'aiSettings.tabs.chat_prompt.label',
    hintKey: 'aiSettings.tabs.chat_prompt.hint',
  },
  {
    key: 'exact_prompt',
    Icon: FileSearch,
    labelKey: 'aiSettings.tabs.exact_prompt.label',
    hintKey: 'aiSettings.tabs.exact_prompt.hint',
  },
  {
    key: 'consultation_prompt',
    Icon: MessagesSquare,
    labelKey: 'aiSettings.tabs.consultation_prompt.label',
    hintKey: 'aiSettings.tabs.consultation_prompt.hint',
  },
  {
    key: 'comparison_technical_prompt',
    Icon: Settings2,
    labelKey: 'aiSettings.tabs.comparison_technical_prompt.label',
    hintKey: 'aiSettings.tabs.comparison_technical_prompt.hint',
  },
  {
    key: 'comparison_semantic_prompt',
    Icon: ScanSearch,
    labelKey: 'aiSettings.tabs.comparison_semantic_prompt.label',
    hintKey: 'aiSettings.tabs.comparison_semantic_prompt.hint',
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
    ...(variant === 'ghost' && { border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-base)' }),
    ...(variant === 'primary' && { background: 'linear-gradient(135deg, var(--color-violet-600), var(--color-violet-500))', color: '#fff' }),
    ...(variant === 'disabled' && { background: 'var(--bg-raised)', color: 'var(--text-faint)', cursor: 'not-allowed' }),
    ...(variant === 'danger' && { background: 'color-mix(in srgb, var(--status-danger) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--status-danger) 30%, transparent)', color: 'var(--status-danger)' }),
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
  const { t } = useTranslation()
  const isAdmin = currentUser?.role === 'admin'

  const [scope, setScope]                 = useState('user') // 'user' | 'global' (admin only)
  const [activeTab, setActiveTab]         = useState('chat_prompt')
  const [prompts, setPrompts]             = useState({})     // { [key]: { content, is_personal } }
  const [editValues, setEditValues]       = useState({})
  const [saving, setSaving]               = useState(null)
  const [resetting, setResetting]         = useState(null)
  const [loading, setLoading]             = useState(true)
  const [toast, setToast]                 = useState(null)
  const [confirmReset, setConfirmReset]   = useState(null)
  const [confirmAllReset, setConfirmAllReset] = useState(false)

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  const loadPrompts = useCallback(async (activeScope) => {
    try {
      setLoading(true)
      const data = await apiGetPrompts(activeScope)
      setPrompts(data.prompts)
      setEditValues(Object.fromEntries(Object.entries(data.prompts).map(([k, v]) => [k, v.content])))
    } catch (err) {
      showToast(err.message, false)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadPrompts(scope) }, [loadPrompts, scope])

  const handleSave = async (key) => {
    setSaving(key)
    try {
      await apiUpdatePrompt(key, editValues[key], scope)
      setPrompts(prev => ({ ...prev, [key]: { ...prev[key], content: editValues[key], is_personal: scope === 'user' ? true : prev[key]?.is_personal } }))
      showToast(t('aiSettings.savedMsg'))
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
      const data = await apiResetPrompt(key, scope)
      setPrompts(prev => ({ ...prev, [key]: { content: data.content, is_personal: scope === 'global' ? false : false } }))
      setEditValues(prev => ({ ...prev, [key]: data.content }))
      showToast(t('aiSettings.resetMsg'))
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
      await loadPrompts(scope)
      showToast(t('aiSettings.resetAllMsg'))
    } catch (err) {
      showToast(err.message, false)
    }
  }

  const activeTabInfo = TABS.find(tab => tab.key === activeTab)
  const currentContent = prompts[activeTab]?.content ?? ''
  const isDirty = editValues[activeTab] !== currentContent
  const isPersonal = !!prompts[activeTab]?.is_personal

  return (
    <div style={{ maxWidth: 940, margin: '0 auto', padding: '2rem 1rem', position: 'relative' }}>

      <style>{`
        @keyframes skeleton-shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

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
              background: toast.ok
                ? 'color-mix(in srgb, var(--status-success) 20%, var(--bg-surface))'
                : 'color-mix(in srgb, var(--status-danger) 20%, var(--bg-surface))',
              color: toast.ok ? 'var(--status-success)' : 'var(--status-danger)',
              boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            }}
          >
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1rem', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 className="text-gradient-accent" style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800 }}>{t('aiSettings.title')}</h1>
          <p style={{ margin: '0.25rem 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
            {t('aiSettings.subtitle')}
          </p>
        </div>
        {isAdmin && scope === 'global' && (
          <button
            onClick={handleResetAll}
            aria-label={t('aiSettings.confirmResetAll')}
            style={{ ...s.btn(confirmAllReset ? 'danger' : 'ghost'), flexShrink: 0, gap: 5 }}
          >
            <AlertTriangle size={13} style={{ opacity: confirmAllReset ? 1 : 0.6 }} />
            {confirmAllReset ? t('aiSettings.confirmResetAll') : t('aiSettings.resetAll')}
          </button>
        )}
      </div>

      {isAdmin && (
        <div style={{ display: 'flex', gap: 6, marginBottom: '1.25rem' }}>
          {[
            { key: 'user', label: t('aiSettings.scopeUser'), Icon: User },
            { key: 'global', label: t('aiSettings.scopeGlobal'), Icon: Globe },
          ].map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => setScope(key)}
              aria-pressed={scope === key}
              style={{
                ...s.btn(scope === key ? 'primary' : 'ghost'),
                fontSize: 12.5,
              }}
            >
              <Icon size={12} />
              {label}
            </button>
          ))}
        </div>
      )}

      {loading ? (
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
          <div style={s.card}>
            {TABS.map(({ key, Icon, labelKey }) => {
              const dirty = editValues[key] !== (prompts[key]?.content ?? '')
              const active = activeTab === key
              const personal = !!prompts[key]?.is_personal
              return (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  aria-pressed={active}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 9,
                    padding: '0.85rem 1.1rem', border: 'none', textAlign: 'left',
                    background: active ? 'color-mix(in srgb, var(--color-violet-600) 12%, var(--bg-surface))' : 'transparent',
                    borderLeft: `3px solid ${active ? 'var(--color-violet-600)' : 'transparent'}`,
                    color: 'var(--text-base)', cursor: 'pointer', fontSize: 13.5,
                    fontWeight: active ? 700 : 500,
                    borderBottom: '1px solid var(--border-soft)',
                    transition: 'background 0.15s, border-color 0.15s',
                  }}
                >
                  <Icon size={15} style={{ opacity: active ? 1 : 0.55, flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>{t(labelKey)}</span>
                  {scope === 'user' && personal && (
                    <span
                      title={t('aiSettings.personalBadge')}
                      style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--accent-primary)', border: '1px solid color-mix(in srgb, var(--accent-primary) 40%, transparent)', borderRadius: 5, padding: '1px 5px', flexShrink: 0 }}
                    >
                      {t('aiSettings.personalBadge')}
                    </span>
                  )}
                  {dirty && (
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--status-warning)', flexShrink: 0 }} />
                  )}
                </button>
              )
            })}
          </div>

          <div style={s.card}>
            <div style={{
              padding: '1.1rem 1.5rem 0.9rem',
              borderBottom: '1px solid var(--border-soft)',
              display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: 3, color: 'var(--text-base)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  {activeTabInfo && t(activeTabInfo.labelKey)}
                  {scope === 'user' && (
                    <span style={{
                      fontSize: 10, fontWeight: 700, borderRadius: 5, padding: '1px 6px',
                      color: isPersonal ? 'var(--accent-primary)' : 'var(--text-muted)',
                      border: `1px solid ${isPersonal ? 'color-mix(in srgb, var(--accent-primary) 40%, transparent)' : 'var(--border)'}`,
                    }}>
                      {isPersonal ? t('aiSettings.personalBadge') : t('aiSettings.globalBadge')}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  {activeTabInfo && t(activeTabInfo.hintKey)}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 7, flexShrink: 0 }}>
                {confirmReset === activeTab ? (
                  <>
                    <button onClick={() => setConfirmReset(null)} style={{ ...s.btn('ghost'), fontSize: 12 }}>
                      {t('aiSettings.cancel')}
                    </button>
                    <button
                      onClick={() => handleReset(activeTab)}
                      disabled={resetting === activeTab}
                      title={scope === 'user' ? t('aiSettings.resetHint') : undefined}
                      style={{ ...s.btn('danger'), fontSize: 12 }}
                    >
                      <RotateCcw size={11} />
                      {resetting === activeTab ? '…' : t('aiSettings.confirmReset')}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => handleReset(activeTab)}
                    disabled={resetting === activeTab || (scope === 'user' && !isPersonal)}
                    title={scope === 'user' ? t('aiSettings.resetHint') : undefined}
                    style={{ ...s.btn(scope === 'user' && !isPersonal ? 'disabled' : 'ghost'), opacity: scope === 'user' && !isPersonal ? undefined : 0.8 }}
                  >
                    <RotateCcw size={12} />
                    {t('aiSettings.reset')}
                  </button>
                )}
                <button
                  onClick={() => handleSave(activeTab)}
                  disabled={saving === activeTab || !isDirty}
                  style={saving === activeTab || !isDirty ? s.btn('disabled') : s.btn('primary')}
                >
                  <Save size={12} />
                  {saving === activeTab ? t('aiSettings.saving') : t('aiSettings.save')}
                </button>
              </div>
            </div>

            <label style={{ display: 'block' }}>
              <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)' }}>
                {activeTabInfo && t(activeTabInfo.labelKey)}
              </span>
              <textarea
                value={editValues[activeTab] || ''}
                onChange={e => setEditValues(prev => ({ ...prev, [activeTab]: e.target.value }))}
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

            <AnimatePresence>
              {isDirty && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  style={{
                    padding: '0.5rem 1.5rem',
                    borderTop: '1px solid var(--border-soft)',
                    fontSize: 12, color: 'var(--status-warning)', fontWeight: 600,
                  }}
                >
                  {t('aiSettings.unsaved')}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </div>
  )
}
