import React, { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, LayoutDashboard, Upload, MessageSquare,
  GitCompare, Presentation, RefreshCw, User, Shield,
  Cpu, X, ArrowRight, FileText, Command,
} from 'lucide-react'
import { useSessionTabsStore } from '@/shared/stores/sessionTabsStore'
import { useWorkspaceStore } from '@/shared/stores/workspaceStore'

const STATIC_COMMANDS = [
  { id: 'nav-dashboard',    label: 'Dashboard',          desc: 'Главная страница',          icon: LayoutDashboard, path: '/',             group: 'Навигация' },
  { id: 'nav-upload',       label: 'Загрузить документ', desc: 'Загрузка и обработка файла', icon: Upload,          path: '/upload',        group: 'Навигация' },
  { id: 'nav-workspace',    label: 'Рабочее пространство', desc: 'Чат с документом',         icon: MessageSquare,   path: '/workspace',     group: 'Навигация' },
  { id: 'nav-compare',      label: 'Сравнение',          desc: 'Семантическое и техническое', icon: GitCompare,     path: '/compare',       group: 'Навигация' },
  { id: 'nav-presentation', label: 'Презентация',        desc: 'Сгенерировать PPTX',         icon: Presentation,   path: '/presentation',  group: 'Навигация' },
  { id: 'nav-convert',      label: 'Конвертация',        desc: 'Изменить формат документа',  icon: RefreshCw,      path: '/convert',       group: 'Навигация' },
  { id: 'nav-profile',      label: 'Профиль',            desc: 'Настройки пользователя',     icon: User,           path: '/profile',       group: 'Аккаунт'  },
  { id: 'nav-admin',        label: 'Панель админа',      desc: 'Управление пользователями',  icon: Shield,         path: '/admin',         group: 'Аккаунт'  },
  { id: 'nav-ai-settings',  label: 'AI настройки',       desc: 'Промпты и поведение модели', icon: Cpu,            path: '/ai-settings',   group: 'Аккаунт'  },
]

function highlight(text, query) {
  if (!query) return text
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: 'rgba(99,102,241,0.3)', color: 'inherit', borderRadius: 2, padding: '0 1px' }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  )
}

export default function CommandPalette({ open, onClose, onNavigate }) {
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef(null)
  const listRef  = useRef(null)
  const openTab  = useSessionTabsStore((s) => s.openTab)
  const documentName = useWorkspaceStore((s) => s.activeDocumentName)

  // Build commands list, optionally prepending active document
  const allCommands = React.useMemo(() => {
    const docCmds = documentName
      ? [{
          id: 'current-doc',
          label: documentName,
          desc: 'Текущий документ → Workspace',
          icon: FileText,
          path: '/workspace',
          group: 'Документ',
        }]
      : []
    return [...docCmds, ...STATIC_COMMANDS]
  }, [documentName])

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return allCommands
    return allCommands.filter(
      (c) => c.label.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q) || c.group.toLowerCase().includes(q)
    )
  }, [query, allCommands])

  // Reset active index when filtered list changes
  useEffect(() => { setActiveIdx(0) }, [filtered.length, query])

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIdx(0)
      setTimeout(() => inputRef.current?.focus(), 30)
    }
  }, [open])

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.children[activeIdx]
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx])

  const handleSelect = useCallback((cmd) => {
    openTab({ routePath: cmd.path })
    if (onNavigate) onNavigate(cmd.path)
    onClose()
  }, [openTab, onNavigate, onClose])

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[activeIdx]) handleSelect(filtered[activeIdx])
    }
  }

  // Group items for rendering
  const grouped = React.useMemo(() => {
    const groups = {}
    filtered.forEach((cmd) => {
      if (!groups[cmd.group]) groups[cmd.group] = []
      groups[cmd.group].push(cmd)
    })
    return groups
  }, [filtered])

  // Flat index map for keyboard nav across groups
  const flatItems = filtered

  const portal = (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="cmd-palette-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Dialog */}
          <motion.div
            className="cmd-palette"
            role="dialog"
            aria-label="Command palette"
            aria-modal="true"
            initial={{ opacity: 0, scale: 0.96, y: -12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -12 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            onKeyDown={handleKeyDown}
          >
            {/* Search input */}
            <div className="cmd-palette__search">
              <Search size={15} className="cmd-palette__search-icon" aria-hidden="true" />
              <input
                ref={inputRef}
                type="text"
                className="cmd-palette__input"
                placeholder="Поиск команд и страниц…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search commands"
                autoComplete="off"
                spellCheck="false"
              />
              {query && (
                <button
                  type="button"
                  className="cmd-palette__clear"
                  aria-label="Clear search"
                  onClick={() => { setQuery(''); inputRef.current?.focus() }}
                >
                  <X size={13} />
                </button>
              )}
              <kbd className="cmd-palette__esc-hint">ESC</kbd>
            </div>

            <div className="cmd-palette__divider" />

            {/* Results */}
            <div className="cmd-palette__results" role="listbox" ref={listRef}>
              {filtered.length === 0 ? (
                <div className="cmd-palette__empty">
                  <Command size={22} style={{ opacity: 0.3, marginBottom: 8 }} />
                  <p>Ничего не найдено</p>
                </div>
              ) : (
                Object.entries(grouped).map(([groupName, items]) => (
                  <div key={groupName} className="cmd-palette__group">
                    <div className="cmd-palette__group-label">{groupName}</div>
                    {items.map((cmd) => {
                      const flatIdx = flatItems.indexOf(cmd)
                      const isActive = flatIdx === activeIdx
                      const Icon = cmd.icon
                      return (
                        <button
                          key={cmd.id}
                          type="button"
                          role="option"
                          aria-selected={isActive}
                          className={`cmd-palette__item${isActive ? ' cmd-palette__item--active' : ''}`}
                          onClick={() => handleSelect(cmd)}
                          onMouseEnter={() => setActiveIdx(flatIdx)}
                        >
                          <span className="cmd-palette__item-icon"><Icon size={15} /></span>
                          <span className="cmd-palette__item-text">
                            <span className="cmd-palette__item-label">{highlight(cmd.label, query)}</span>
                            <span className="cmd-palette__item-desc">{highlight(cmd.desc, query)}</span>
                          </span>
                          {isActive && <ArrowRight size={13} className="cmd-palette__item-arrow" />}
                        </button>
                      )
                    })}
                  </div>
                ))
              )}
            </div>

            {/* Footer hint */}
            <div className="cmd-palette__footer">
              <span><kbd>↑↓</kbd> навигация</span>
              <span><kbd>Enter</kbd> открыть</span>
              <span><kbd>Esc</kbd> закрыть</span>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )

  return createPortal(portal, document.body)
}
