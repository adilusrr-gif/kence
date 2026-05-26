import React, { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sun, Moon, LogOut, User, Shield, Cpu, FileText, Layers,
  LayoutDashboard, Upload, MessageSquare, GitCompare, Presentation, RefreshCw,
  Search, Bell, CheckCircle, Loader2 as LoaderIcon, AlertCircle, Info,
} from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { useShellStore } from '@/shared/stores/shellStore'
import { useEventStore } from '@/shared/stores/eventStore'
import CommandPalette from '@/widgets/command-palette/CommandPalette'

function notifRelTime(ts) {
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60000)
  const h = Math.floor(diff / 3600000)
  if (h >= 1) return `${h}ч назад`
  if (m >= 1) return `${m}мин назад`
  return 'только что'
}

const EVENT_META = {
  DOCUMENT_READY:      { Icon: CheckCircle, color: '#22c55e' },
  DOCUMENT_UPLOADING:  { Icon: LoaderIcon,  color: '#60a5fa' },
  DOCUMENT_ERROR:      { Icon: AlertCircle, color: '#ef4444' },
}

function NotificationBell() {
  const recentEvents = useEventStore((s) => s.recentEvents)
  const clearEvents  = useEventStore((s) => s.clearEvents)
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)
  const unread = recentEvents.length

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div className="notif-bell-wrapper" ref={wrapRef}>
      <button
        type="button"
        className="top-bar__icon-btn"
        aria-label="Notifications"
        onClick={() => setOpen((v) => !v)}
      >
        <Bell size={16} />
        {unread > 0 && <span className="notification-badge" aria-hidden="true" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="notification-dropdown"
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
          >
            {recentEvents.length === 0
              ? <div className="notification-empty">Нет уведомлений</div>
              : recentEvents.slice(0, 5).map((ev, i) => {
                  const meta = EVENT_META[ev.type] || { Icon: Info, color: '#94a3b8' }
                  return (
                    <div key={i} className="notification-item">
                      <meta.Icon size={13} style={{ color: meta.color, flexShrink: 0, marginTop: 1 }} />
                      <span className="notification-item__text">{ev.message}</span>
                      <span className="notification-item__time">{notifRelTime(ev.timestamp)}</span>
                    </div>
                  )
                })
            }
            {recentEvents.length > 0 && (
              <button className="notification-clear" onClick={() => { clearEvents(); setOpen(false) }}>
                Очистить
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

const ROUTE_META = {
  '/':             { label: 'Dashboard',    Icon: LayoutDashboard },
  '/upload':       { label: 'Upload',       Icon: Upload },
  '/workspace':    { label: 'Workspace',    Icon: MessageSquare },
  '/compare':      { label: 'Compare',      Icon: GitCompare },
  '/presentation': { label: 'Presentation', Icon: Presentation },
  '/convert':      { label: 'Convert',      Icon: RefreshCw },
  '/profile':      { label: 'Profile',      Icon: User },
  '/admin':        { label: 'Admin',        Icon: Shield },
  '/ai-settings':  { label: 'AI Settings',  Icon: Cpu },
}

function UserMenu({ user, onLogout, onNavigate }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (!menuRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const initials = user?.username ? user.username.slice(0, 2).toUpperCase() : '?'
  const isAdmin = user?.role === 'admin'
  const roleColor = isAdmin ? 'var(--color-warning, #F59E0B)' : 'var(--accent-primary, #60A5FA)'

  const menuItems = [
    { icon: User,   label: 'Profile',      action: () => { onNavigate('/profile'); setOpen(false) } },
    ...(isAdmin ? [
      { icon: Cpu,    label: 'AI Settings', action: () => { onNavigate('/ai-settings'); setOpen(false) } },
      { icon: Shield, label: 'Admin Panel', action: () => { onNavigate('/admin'); setOpen(false) } },
    ] : []),
  ]

  return (
    <div className="top-bar__user-menu-wrapper" ref={menuRef}>
      <button
        type="button"
        className="top-bar__avatar-btn"
        aria-label="User menu"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="top-bar__avatar" style={{ background: roleColor, color: '#020617' }}>
          {initials}
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="top-bar__user-dropdown"
            role="menu"
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
          >
            <div className="top-bar__dropdown-header">
              <span className="top-bar__dropdown-name">{user?.username || 'User'}</span>
              <span className="top-bar__dropdown-role" style={{ color: roleColor }}>
                {user?.role || 'user'}
              </span>
            </div>
            <div className="top-bar__dropdown-divider" role="separator" />
            {menuItems.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className="top-bar__dropdown-item"
                onClick={item.action}
              >
                <item.icon size={14} />
                <span>{item.label}</span>
              </button>
            ))}
            <div className="top-bar__dropdown-divider" role="separator" />
            <button
              type="button"
              role="menuitem"
              className="top-bar__dropdown-item top-bar__dropdown-item--danger"
              onClick={() => { onLogout(); setOpen(false) }}
            >
              <LogOut size={14} />
              <span>Logout</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function TopCommandBar({ user, onLogout, onNavigate, documentName }) {
  const { pathname } = useLocation()
  const theme = useShellStore((s) => s.theme)
  const toggleTheme = useShellStore((s) => s.toggleTheme)
  const setRightPanelOpen = useShellStore((s) => s.setRightPanelOpen)
  const rightPanelOpen = useShellStore((s) => s.rightPanelShell.open)
  const [paletteOpen, setPaletteOpen] = useState(false)

  const meta = ROUTE_META[pathname] || { label: 'KENCE.ai', Icon: FileText }
  const PageIcon = meta.Icon

  // Global Ctrl+K shortcut
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const handlePaletteNavigate = useCallback((path) => {
    if (onNavigate) onNavigate(path)
  }, [onNavigate])

  return (
    <header className="top-command-bar" role="banner">
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onNavigate={handlePaletteNavigate}
      />

      {/* Left: breadcrumb */}
      <div className="top-bar__breadcrumb">
        <span className="top-bar__page-icon" aria-hidden="true">
          <PageIcon size={16} />
        </span>
        <span className="top-bar__page-title">{meta.label}</span>

        <AnimatePresence mode="wait">
          {documentName && (
            <motion.div
              key={documentName}
              className="top-bar__doc-chip"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.15 }}
            >
              <FileText size={12} aria-hidden="true" />
              <span className="top-bar__doc-chip-name" title={documentName}>
                {documentName}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Center — Command Palette trigger */}
      <div className="top-bar__center">
        <button
          type="button"
          className="top-bar__palette-trigger"
          aria-label="Open command palette"
          onClick={() => setPaletteOpen(true)}
        >
          <Search size={13} />
          <span className="top-bar__palette-label">Поиск команд…</span>
          <kbd className="top-bar__palette-kbd">Ctrl K</kbd>
        </button>
      </div>

      {/* Right: status cluster */}
      <div className="top-bar__status-cluster">
        <button
          type="button"
          className={`top-bar__icon-btn${rightPanelOpen ? ' top-bar__icon-btn--active' : ''}`}
          aria-label="Toggle intelligence panel"
          aria-pressed={rightPanelOpen}
          title="Intelligence panel"
          onClick={() => setRightPanelOpen(!rightPanelOpen)}
        >
          <Layers size={16} />
        </button>

        <NotificationBell />

        <button
          type="button"
          className="top-bar__icon-btn"
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          title="Toggle theme"
          onClick={toggleTheme}
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        <UserMenu
          user={user}
          onLogout={onLogout}
          onNavigate={onNavigate}
        />
      </div>
    </header>
  )
}
