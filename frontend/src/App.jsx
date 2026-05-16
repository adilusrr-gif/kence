import React, { useState, useRef, useEffect } from 'react'
import { Routes, Route, Link, useLocation, Navigate, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sun, Moon,
  Home, Upload, LayoutTemplate, Scale,
  ArrowLeftRight, User, ShieldCheck, SlidersHorizontal, FileText,
  LogOut, ChevronDown,
} from 'lucide-react'
import LandingPage from './pages/LandingPage'
import UploadPage from './pages/UploadPage'
import ChatPage from './pages/ChatPage'
import PresentationPage from './pages/PresentationPage'
import ComparisonPage from './pages/ComparisonPage'
import ConvertPage from './pages/ConvertPage'
import LoginPage from './pages/LoginPage'
import ProfilePage from './pages/ProfilePage'
import AdminPage from './pages/AdminPage'
import AISettingsPage from './pages/AISettingsPage'
import DocumentWorkspacePage from './pages/DocumentWorkspacePage'
import { getStoredUser, clearAuth } from './lib/api'
import { AppShellLayout } from '@/app/layouts/app-shell'
import { LeftRailShell } from '@/widgets/left-rail'
import { LegacyPageCanvasHost } from '@/widgets/main-canvas-host'
import {
  syncAuthShadow,
  syncShellShadow,
  syncWorkspaceShadow,
} from '@/shared/stores'

const NAV_BASE = [
  { path: '/',             label: 'Главная',      Icon: Home },
  { path: '/upload',       label: 'Загрузка',     Icon: Upload },
  { path: '/workspace',    label: 'Чат / Воркспейс', Icon: FileText },
  { path: '/presentation', label: 'Презентация',  Icon: LayoutTemplate },
  { path: '/compare',      label: 'Сравнение',    Icon: Scale },
  { path: '/convert',      label: 'Конвертер',    Icon: ArrowLeftRight },
]

const BADGE_PATHS = new Set(['/workspace', '/presentation', '/compare', '/convert'])

const QUICK_ACTIONS = [
  { path: '/workspace',    Icon: FileText,       label: 'Воркспейс' },
  { path: '/presentation', Icon: LayoutTemplate, label: 'Презентация' },
  { path: '/compare',      Icon: Scale,          label: 'Сравнение' },
  { path: '/convert',      Icon: ArrowLeftRight, label: 'Конвертер' },
]

function formatRelTime(ts) {
  const diffMs = Date.now() - ts
  const d = Math.floor(diffMs / 86400000)
  const h = Math.floor(diffMs / 3600000)
  if (d >= 2) return `${d}д назад`
  if (d === 1) return 'вчера'
  if (h >= 1) return `${h}ч назад`
  return 'только что'
}

function getInitialTheme() {
  if (typeof document !== 'undefined') {
    const documentTheme = document.documentElement.dataset.theme
    if (documentTheme === 'dark') return true
    if (documentTheme === 'light') return false
  }

  return localStorage.getItem('theme') !== 'light'
}

const TITLE_MAP = {
  '/':             'Главная',
  '/upload':       'Загрузка документа',
  '/workspace':    'Чат / Воркспейс',
  '/chat':         'Чат / Воркспейс',
  '/presentation': 'Презентация',
  '/compare':      'Сравнение',
  '/convert':      'Конвертер',
  '/profile':      'Профиль',
  '/admin':        'Администратор',
  '/ai-settings':  'Настройки ИИ',
}

function getLegacyTabTitle(pathname) {
  return TITLE_MAP[pathname] || 'KENCE.ai'
}

function UserMenu({ currentUser, onLogout }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const navigate = useNavigate()
  const isAdmin = currentUser?.role === 'admin'

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const go = (path) => { setOpen(false); navigate(path) }
  const logout = () => { setOpen(false); onLogout() }

  return (
    <div className="user-menu" ref={ref}>
      <button
        className={`user-menu__trigger${open ? ' user-menu__trigger--open' : ''}`}
        onClick={() => setOpen(v => !v)}
        aria-label="Меню пользователя"
      >
        <div className="user-menu__avatar">
          {currentUser.username.charAt(0).toUpperCase()}
        </div>
        <span className="user-menu__name">{currentUser.username}</span>
        <ChevronDown size={13} className={`user-menu__chevron${open ? ' user-menu__chevron--open' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="user-menu__dropdown"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
          >
            <div className="user-menu__header">
              <div className="user-menu__header-avatar">
                {currentUser.username.charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="user-menu__header-name">{currentUser.username}</div>
                <div className="user-menu__header-role">
                  {isAdmin ? 'Администратор' : 'Пользователь'}
                </div>
              </div>
            </div>

            <div className="user-menu__divider" />

            <button className="user-menu__item" onClick={() => go('/profile')}>
              <User size={14} />
              Профиль
            </button>

            {isAdmin && (
              <button className="user-menu__item" onClick={() => go('/ai-settings')}>
                <SlidersHorizontal size={14} />
                Настройки ИИ
              </button>
            )}

            {isAdmin && (
              <button className="user-menu__item" onClick={() => go('/admin')}>
                <ShieldCheck size={14} />
                Администратор
              </button>
            )}

            <div className="user-menu__divider" />

            <button className="user-menu__item user-menu__item--danger" onClick={logout}>
              <LogOut size={14} />
              Выйти
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function AppTopBar({ dark, setDark, currentUser, location, onLogout }) {
  return (
    <div className="app-top-bar">
      <span className="app-top-bar__title">{getLegacyTabTitle(location.pathname)}</span>
      <div className="app-top-bar__actions">
        <button
          className="app-top-bar__icon-btn"
          onClick={() => setDark(v => !v)}
          aria-label={dark ? 'Светлая тема' : 'Тёмная тема'}
          title={dark ? 'Светлая тема' : 'Тёмная тема'}
        >
          {dark ? <Sun size={15} /> : <Moon size={15} />}
        </button>
        <UserMenu currentUser={currentUser} onLogout={onLogout} />
      </div>
    </div>
  )
}

function LegacySidebar({
  appEmoji,
  appName,
  collapsed,
  currentUser,
  documentName,
  editEmoji,
  editName,
  emojiRef,
  location,
  nameRef,
  saveEmoji,
  saveName,
  sessionHistory,
  sessionId,
  setAppEmoji,
  setAppName,
  setCollapsed,
  setEditEmoji,
  setEditName,
}) {
  const hasDoc = Boolean(sessionId)

  return (
    <motion.aside
      className="sidebar"
      animate={{ width: collapsed ? 64 : 248 }}
      initial={false}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
    >
      {/* Logo */}
      <div className="sidebar__logo">
        <motion.div
          className="logo-icon"
          onClick={() => !editEmoji && setEditEmoji(true)}
          title="Нажмите для смены эмблемы"
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.94 }}
          transition={{ duration: 0.15 }}
        >
          {editEmoji ? (
            <input
              ref={emojiRef}
              value={appEmoji}
              onChange={e => setAppEmoji(e.target.value.slice(-2))}
              onBlur={saveEmoji}
              onKeyDown={e => e.key === 'Enter' && saveEmoji()}
              className="emoji-input"
              maxLength={2}
            />
          ) : <span>{appEmoji}</span>}
        </motion.div>

        <AnimatePresence>
          {!collapsed && (
            <motion.div
              className="logo-text"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.18 }}
            >
              {editName ? (
                <input
                  ref={nameRef}
                  value={appName}
                  onChange={e => setAppName(e.target.value)}
                  onBlur={saveName}
                  onKeyDown={e => e.key === 'Enter' && saveName()}
                  className="name-input"
                  placeholder="Название…"
                />
              ) : (
                <h1 className="app-name" onClick={() => setEditName(true)} title="Переименовать">
                  {appName}
                </h1>
              )}
              <p className="app-subtitle">AI-ассистент</p>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.button
          className="collapse-btn"
          onClick={() => setCollapsed(v => !v)}
          title={collapsed ? 'Развернуть' : 'Свернуть'}
          aria-label={collapsed ? 'Развернуть' : 'Свернуть'}
          whileHover={{ scale: 1.15 }}
          whileTap={{ scale: 0.9 }}
        >
          <motion.span
            animate={{ rotate: collapsed ? 0 : 180 }}
            transition={{ duration: 0.28 }}
            style={{ display: 'inline-block' }}
          >
            ›
          </motion.span>
        </motion.button>
      </div>

      {/* Navigation */}
      <nav className="sidebar__nav" aria-label="Основная навигация">
        {NAV_BASE.filter(item => !item.adminOnly || currentUser?.role === 'admin').map((item, i) => {
          const active = location.pathname === item.path
          const showBadge = hasDoc && BADGE_PATHS.has(item.path)
          return (
            <motion.div
              key={item.path}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04, duration: 0.22 }}
            >
              <Link
                to={item.path}
                className={`nav-item${active ? ' nav-item--active' : ''}`}
                title={collapsed ? item.label : undefined}
                aria-current={active ? 'page' : undefined}
              >
                <span className="nav-icon" aria-hidden="true">
                  <item.Icon size={15} strokeWidth={1.75} />
                </span>
                <AnimatePresence>
                  {!collapsed && (
                    <motion.span
                      className="nav-label"
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: 'auto' }}
                      exit={{ opacity: 0, width: 0 }}
                      transition={{ duration: 0.18 }}
                    >
                      {item.label}
                    </motion.span>
                  )}
                </AnimatePresence>
                {showBadge && <span className="nav-badge" aria-hidden="true" />}
                {active && (
                  <motion.span
                    className="nav-indicator"
                    aria-hidden="true"
                    layoutId="nav-pill"
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  />
                )}
              </Link>
            </motion.div>
          )
        })}
      </nav>

      {/* Active session */}
      <AnimatePresence>
        {hasDoc && !collapsed && (
          <motion.div
            className="sidebar__active-section"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.2 }}
          >
            <span className="sidebar__section-label">Активная сессия</span>
            <div className="sidebar__session-card">
              <p className="sidebar__session-name">
                <FileText size={11} strokeWidth={2} />
                {documentName || 'Документ загружен'}
              </p>
              <div className="sidebar__session-actions">
                {QUICK_ACTIONS.map(({ path, Icon, label }) => (
                  <Link
                    key={path}
                    to={path}
                    className={`sidebar__session-btn${location.pathname === path ? ' sidebar__session-btn--active-page' : ''}`}
                    title={label}
                    aria-label={label}
                  >
                    <Icon size={13} strokeWidth={1.75} />
                  </Link>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Session history */}
      <AnimatePresence>
        {!collapsed && sessionHistory.filter(s => s.id !== sessionId).length > 0 && (
          <motion.div
            className="sidebar__history"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <span className="sidebar__section-label">Недавние</span>
            {sessionHistory.filter(s => s.id !== sessionId).slice(0, 3).map(s => (
              <div key={s.id} className="sidebar__history-item" title={s.name}>
                <span className="sidebar__history-name">{s.name}</span>
                <span className="sidebar__history-time">{formatRelTime(s.at)}</span>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.aside>
  )
}

function LegacyRoutesCanvas({ currentUser, documentName, location, sessionId, setDocumentName, setSessionId }) {
  return (
    <LegacyPageCanvasHost>
      <div className="legacy-main-content">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            className={['/', '/upload', '/workspace'].includes(location.pathname) ? 'page-full' : 'page-container'}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.26, ease: 'easeInOut' }}
          >
            <Routes location={location}>
              <Route path="/"             element={<LandingPage />} />
              <Route path="/upload"       element={<UploadPage sessionId={sessionId} setSessionId={setSessionId} setDocumentName={setDocumentName} />} />
              <Route path="/workspace"     element={<DocumentWorkspacePage sessionId={sessionId} documentName={documentName} />} />
              <Route path="/presentation" element={<PresentationPage sessionId={sessionId} />} />
              <Route path="/compare"      element={<ComparisonPage />} />
              <Route path="/convert"      element={<ConvertPage sessionId={sessionId} />} />
              <Route path="/profile"      element={<ProfilePage currentUser={currentUser} />} />
              <Route path="/admin"        element={<AdminPage currentUser={currentUser} />} />
              <Route path="/ai-settings"  element={<AISettingsPage currentUser={currentUser} />} />
              <Route path="/chat"         element={<Navigate to="/workspace" replace />} />
              <Route path="/vector-base"  element={<Navigate to="/admin" replace />} />
              <Route path="/login"        element={<Navigate to="/" replace />} />
            </Routes>
          </motion.div>
        </AnimatePresence>
      </div>
    </LegacyPageCanvasHost>
  )
}

export default function App() {
  const [sessionId, setSessionId] = useState(() => localStorage.getItem('docai_session') || null)
  const [documentName, setDocumentName] = useState(() => localStorage.getItem('docai_docname') || '')
  const [appName, setAppName] = useState(() => localStorage.getItem('appName') || 'KENCE.ai')
  const [appEmoji, setAppEmoji] = useState(() => localStorage.getItem('appEmoji') || 'K')
  const [editName, setEditName] = useState(false)
  const [editEmoji, setEditEmoji] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [dark, setDark] = useState(getInitialTheme)
  const [currentUser, setCurrentUser] = useState(() => getStoredUser())
  const [sessionHistory, setSessionHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('kence_session_history') || '[]') }
    catch { return [] }
  })

  const handleSetSessionId = (id) => {
    setSessionId(id)
    id ? localStorage.setItem('docai_session', id) : localStorage.removeItem('docai_session')
  }
  const handleSetDocumentName = (name) => {
    setDocumentName(name)
    name ? localStorage.setItem('docai_docname', name) : localStorage.removeItem('docai_docname')
  }

  const location = useLocation()
  const nameRef = useRef(null)
  const emojiRef = useRef(null)

  useEffect(() => {
    const nextTheme = dark ? 'dark' : 'light'

    document.documentElement.classList.toggle('dark', dark)
    document.documentElement.dataset.theme = nextTheme
    document.documentElement.style.colorScheme = nextTheme
    localStorage.setItem('theme', nextTheme)
  }, [dark])

  useEffect(() => {
    syncAuthShadow(currentUser)
  }, [currentUser])

  useEffect(() => {
    syncShellShadow({
      theme: dark ? 'dark' : 'light',
      appName,
      appEmoji,
      leftRail: { collapsed },
    })
  }, [dark, appName, appEmoji, collapsed])

  useEffect(() => {
    syncWorkspaceShadow({
      activeSessionId: sessionId,
      activeDocumentName: documentName,
    })
  }, [sessionId, documentName])


  useEffect(() => {
    if (editName && nameRef.current) {
      nameRef.current.focus()
      nameRef.current.select()
    }
  }, [editName])

  useEffect(() => {
    if (editEmoji && emojiRef.current) {
      emojiRef.current.focus()
    }
  }, [editEmoji])

  useEffect(() => {
    if (!sessionId || !documentName) return
    setSessionHistory(prev => {
      const entry = { id: sessionId, name: documentName, at: Date.now() }
      const next = [entry, ...prev.filter(s => s.id !== sessionId)].slice(0, 5)
      localStorage.setItem('kence_session_history', JSON.stringify(next))
      return next
    })
  }, [sessionId, documentName])

  const saveName = () => {
    setEditName(false)
    const value = appName.trim() || 'KENCE.ai'
    setAppName(value)
    localStorage.setItem('appName', value)
  }

  const saveEmoji = () => {
    setEditEmoji(false)
    const value = appEmoji.trim() || 'K'
    setAppEmoji(value)
    localStorage.setItem('appEmoji', value)
  }

  const handleLogout = () => {
    clearAuth()
    setCurrentUser(null)
    handleSetSessionId(null)
    handleSetDocumentName('')
  }

  if (!currentUser) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage onLogin={setCurrentUser} />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  return (
    <AppShellLayout
      topCommandBar={<AppTopBar dark={dark} setDark={setDark} currentUser={currentUser} location={location} onLogout={handleLogout} />}
      leftRail={(
        <LeftRailShell>
          <LegacySidebar
            appEmoji={appEmoji}
            appName={appName}
            collapsed={collapsed}
            currentUser={currentUser}
            documentName={documentName}
            editEmoji={editEmoji}
            editName={editName}
            emojiRef={emojiRef}
            location={location}
            nameRef={nameRef}
            saveEmoji={saveEmoji}
            saveName={saveName}
            sessionHistory={sessionHistory}
            sessionId={sessionId}
            setAppEmoji={setAppEmoji}
            setAppName={setAppName}
            setCollapsed={setCollapsed}
            setEditEmoji={setEditEmoji}
            setEditName={setEditName}
          />
        </LeftRailShell>
      )}
      mainCanvas={(
        <LegacyRoutesCanvas
          currentUser={currentUser}
          documentName={documentName}
          location={location}
          sessionId={sessionId}
          setDocumentName={handleSetDocumentName}
          setSessionId={handleSetSessionId}
        />
      )}
    />
  )
}
