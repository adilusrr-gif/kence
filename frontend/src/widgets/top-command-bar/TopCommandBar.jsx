import React, { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sun, Moon, LogOut, User, Shield, Cpu, FileText, Layers,
  LayoutDashboard, Upload, MessageSquare, GitCompare, Presentation, RefreshCw,
  Search, Bell, CheckCircle, Loader2 as LoaderIcon, AlertCircle, Info, Building2,
} from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useShellStore } from '@/shared/stores/shellStore'
import { useEventStore } from '@/shared/stores/eventStore'
import useOrgStore from '@/shared/stores/orgStore'
import { FlagIcon } from '@/shared/ui/flag-icon/FlagIcon'
import CommandPalette from '@/widgets/command-palette/CommandPalette'

function notifRelTime(ts, t) {
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60000)
  const h = Math.floor(diff / 3600000)
  if (h >= 1) return `${h}${t('dashboard.time.hours_one', { count: h }).replace(/^\d+/, '').trim() === '' ? 'ч назад' : ''}`
  if (m >= 1) return `${m}мин назад`
  return t('dashboard.time.justNow')
}

const EVENT_META = {
  DOCUMENT_READY:      { Icon: CheckCircle, colorVar: 'var(--color-event-ok)' },
  DOCUMENT_UPLOADING:  { Icon: LoaderIcon,  colorVar: 'var(--color-event-info)' },
  DOCUMENT_ERROR:      { Icon: AlertCircle, colorVar: 'var(--color-event-err)' },
}

function NotificationBell() {
  const { t } = useTranslation()
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
        aria-label={t('topbar.notifications', 'Уведомления')}
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
              ? <div className="notification-empty">{t('topbar.noNotifications')}</div>
              : recentEvents.slice(0, 5).map((ev, i) => {
                  const meta = EVENT_META[ev.type] || { Icon: Info, colorVar: 'var(--text-tertiary)' }
                  return (
                    <div key={i} className="notification-item">
                      <meta.Icon size={13} style={{ color: meta.colorVar, flexShrink: 0, marginTop: 1 }} />
                      <span className="notification-item__text">{ev.message}</span>
                      <span className="notification-item__time">{notifRelTime(ev.timestamp, t)}</span>
                    </div>
                  )
                })
            }
            {recentEvents.length > 0 && (
              <button className="notification-clear" onClick={() => { clearEvents(); setOpen(false) }}>
                {t('topbar.clear')}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

const ROUTE_META = {
  '/':             { labelKey: 'nav.dashboard',    Icon: LayoutDashboard },
  '/upload':       { labelKey: 'nav.upload',       Icon: Upload },
  '/workspace':    { labelKey: 'nav.workspace',    Icon: MessageSquare },
  '/compare':      { labelKey: 'nav.compare',      Icon: GitCompare },
  '/presentation': { labelKey: 'nav.presentation', Icon: Presentation },
  '/convert':      { labelKey: 'nav.convert',      Icon: RefreshCw },
  '/profile':      { labelKey: 'nav.profile',      Icon: User },
  '/admin':        { labelKey: 'nav.admin',        Icon: Shield },
  '/ai-settings':  { labelKey: 'nav.aiSettings',   Icon: Cpu },
}

const LANGS = ['ru', 'kz', 'en']

function LangSwitcher() {
  const language = useShellStore((s) => s.language)
  const setLanguage = useShellStore((s) => s.setLanguage)

  return (
    <div className="lang-switcher">
      {LANGS.map((lang) => (
        <button
          key={lang}
          type="button"
          className={`lang-btn${language === lang ? ' lang-btn--active' : ''}`}
          onClick={() => setLanguage(lang)}
          aria-pressed={language === lang}
          title={lang.toUpperCase()}
        >
          <FlagIcon lang={lang} size={14} />
          <span>{lang.toUpperCase()}</span>
        </button>
      ))}
    </div>
  )
}

function UserMenu({ user, onLogout, onNavigate }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)
  const { currentOrgId, currentOrgName, orgs, switchOrg } = useOrgStore()

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
  const roleColor = isAdmin ? 'var(--status-warning)' : 'var(--accent-primary)'

  const menuItems = [
    { icon: User,      labelKey: 'userMenu.profile',    action: () => { onNavigate('/profile'); setOpen(false) } },
    // AI-settings (prompts) is available to every user — each has their own
    // personal prompts, with admin-only access to the shared global defaults.
    { icon: Cpu,       labelKey: 'userMenu.aiSettings',  action: () => { onNavigate('/ai-settings'); setOpen(false) } },
    ...(isAdmin ? [
      { icon: Building2, labelKey: 'userMenu.orgSettings', action: () => { onNavigate('/org/settings'); setOpen(false) } },
      { icon: Shield,    labelKey: 'userMenu.adminPanel',  action: () => { onNavigate('/admin'); setOpen(false) } },
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
            {/* User header */}
            <div className="top-bar__dropdown-header">
              <span className="top-bar__dropdown-name">{user?.username || 'User'}</span>
              <span className="top-bar__dropdown-role" style={{ color: roleColor }}>
                {user?.role || 'user'}
              </span>
            </div>

            {/* Org section */}
            {currentOrgId && (
              <>
                <div className="top-bar__dropdown-divider" role="separator" />
                <div className="top-bar__dropdown-org-label">{t('userMenu.organization', 'Организация')}</div>
                {orgs.length > 1 ? orgs.map((org) => (
                  <button
                    key={org.id}
                    type="button"
                    role="menuitem"
                    className={`top-bar__dropdown-item top-bar__dropdown-item--org${org.id === currentOrgId ? ' top-bar__dropdown-item--org-active' : ''}`}
                    onClick={() => { switchOrg(org); setOpen(false) }}
                  >
                    <span className="top-bar__org-icon">{(org.display_name || org.name || '?')[0].toUpperCase()}</span>
                    <span>{org.display_name || org.name}</span>
                    {org.id === currentOrgId && <span className="top-bar__org-check">✓</span>}
                  </button>
                )) : (
                  <div className="top-bar__dropdown-item top-bar__dropdown-item--org top-bar__dropdown-item--org-active" style={{ pointerEvents: 'none' }}>
                    <span className="top-bar__org-icon">{(currentOrgName || '?')[0].toUpperCase()}</span>
                    <span>{currentOrgName}</span>
                  </div>
                )}
              </>
            )}

            <div className="top-bar__dropdown-divider" role="separator" />

            {menuItems.map((item) => (
              <button
                key={item.labelKey}
                type="button"
                role="menuitem"
                className="top-bar__dropdown-item"
                onClick={item.action}
              >
                <item.icon size={14} />
                <span>{t(item.labelKey)}</span>
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
              <span>{t('userMenu.logout')}</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function TopCommandBar({ user, onLogout, onNavigate, documentName }) {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const theme = useShellStore((s) => s.theme)
  const toggleTheme = useShellStore((s) => s.toggleTheme)
  const setRightPanelOpen = useShellStore((s) => s.setRightPanelOpen)
  const rightPanelOpen = useShellStore((s) => s.rightPanelShell.open)
  const [paletteOpen, setPaletteOpen] = useState(false)

  const meta = ROUTE_META[pathname] || { labelKey: null, Icon: FileText }
  const PageIcon = meta.Icon
  const pageLabel = meta.labelKey ? t(meta.labelKey) : 'KENCE.ai'

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
        <span className="top-bar__page-title">{pageLabel}</span>

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
          <span className="top-bar__palette-label">{t('topbar.search')}</span>
          <kbd className="top-bar__palette-kbd">Ctrl K</kbd>
        </button>
      </div>

      {/* Right: status cluster */}
      <div className="top-bar__status-cluster">
        <LangSwitcher />

        <button
          type="button"
          className={`top-bar__icon-btn${rightPanelOpen ? ' top-bar__icon-btn--active' : ''}`}
          aria-label={t('topbar.intelligencePanel')}
          aria-pressed={rightPanelOpen}
          onClick={() => setRightPanelOpen(!rightPanelOpen)}
        >
          <Layers size={16} />
        </button>

        <NotificationBell />

        <button
          type="button"
          className="top-bar__icon-btn"
          aria-label={theme === 'dark' ? t('topbar.lightMode') : t('topbar.darkMode')}
          title={theme === 'dark' ? t('topbar.lightMode') : t('topbar.darkMode')}
          onClick={toggleTheme}
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        <UserMenu user={user} onLogout={onLogout} onNavigate={onNavigate} />
      </div>
    </header>
  )
}
