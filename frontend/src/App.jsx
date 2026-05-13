import React, { useState, useRef, useEffect } from 'react'
import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Sun, Moon } from 'lucide-react'
import LandingPage from './pages/LandingPage'
import UploadPage from './pages/UploadPage'
import ChatPage from './pages/ChatPage'
import PresentationPage from './pages/PresentationPage'
import ComparisonPage from './pages/ComparisonPage'
import ConvertPage from './pages/ConvertPage'
import LoginPage from './pages/LoginPage'
import ProfilePage from './pages/ProfilePage'
import AdminPage from './pages/AdminPage'
import { getStoredUser, clearAuth } from './lib/api'
import { AppShellLayout } from '@/app/layouts/app-shell'
import { LeftRailShell } from '@/widgets/left-rail'
import { TopCommandBarShell } from '@/widgets/top-command-bar'
import { LegacyPageCanvasHost } from '@/widgets/main-canvas-host'
import { RightPanelShellPlaceholder } from '@/widgets/right-panel-shell'
import { BottomActivityShellPlaceholder } from '@/widgets/bottom-activity-shell'
import {
  clearSessionTabsShadow,
  syncAuthShadow,
  syncSessionTabsShadow,
  syncShellShadow,
  syncWorkspaceShadow,
} from '@/shared/stores'

const NAV_BASE = [
  { path: '/',             label: 'Р“Р»Р°РІРЅР°СЏ',     icon: 'рџЏ ' },
  { path: '/upload',       label: 'Р—Р°РіСЂСѓР·РєР°',    icon: 'рџ“„' },
  { path: '/chat',         label: 'Р§Р°С‚',         icon: 'рџ’¬' },
  { path: '/presentation', label: 'РџСЂРµР·РµРЅС‚Р°С†РёСЏ', icon: 'рџ“Љ' },
  { path: '/compare',      label: 'РЎСЂР°РІРЅРµРЅРёРµ',   icon: 'вљ–пёЏ' },
  { path: '/convert',      label: 'РљРѕРЅРІРµСЂС‚РµСЂ',   icon: 'рџ”„' },
  { path: '/profile',      label: 'РџСЂРѕС„РёР»СЊ',     icon: 'рџ‘¤' },
  { path: '/admin',        label: 'РђРґРјРёРЅ',       icon: 'рџ›ЎпёЏ', adminOnly: true },
]

const LEGACY_WORKSPACE_ID = 'legacy-main'

function getLegacyTabTitle(pathname) {
  return NAV_BASE.find((item) => item.path === pathname)?.label || 'KENCE.ai'
}

function LegacySidebar({
  appEmoji,
  appName,
  collapsed,
  currentUser,
  dark,
  documentName,
  editEmoji,
  editName,
  emojiRef,
  handleLogout,
  location,
  nameRef,
  saveEmoji,
  saveName,
  sessionId,
  setAppEmoji,
  setAppName,
  setCollapsed,
  setDark,
  setEditEmoji,
  setEditName,
}) {
  return (
    <motion.aside
      className="sidebar"
      animate={{ width: collapsed ? 72 : 256 }}
      initial={false}
      transition={{ duration: 0.32, ease: [0.4, 0, 0.2, 1] }}
    >
      <div className="sidebar__logo">
        <motion.div
          className="logo-icon"
          onClick={() => !editEmoji && setEditEmoji(true)}
          title="РќР°Р¶РјРёС‚Рµ РґР»СЏ СЃРјРµРЅС‹ СЌРјР±Р»РµРјС‹"
          whileHover={{ scale: 1.08, rotate: -6 }}
          whileTap={{ scale: 0.94 }}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
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
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
            >
              {editName ? (
                <input
                  ref={nameRef}
                  value={appName}
                  onChange={e => setAppName(e.target.value)}
                  onBlur={saveName}
                  onKeyDown={e => e.key === 'Enter' && saveName()}
                  className="name-input"
                  placeholder="РќР°Р·РІР°РЅРёРµвЂ¦"
                />
              ) : (
                <h1
                  className="app-name"
                  onClick={() => setEditName(true)}
                  title="РќР°Р¶РјРёС‚Рµ РґР»СЏ РїРµСЂРµРёРјРµРЅРѕРІР°РЅРёСЏ"
                >
                  {appName}
                </h1>
              )}
              <p className="app-subtitle">AI-Р°СЃСЃРёСЃС‚РµРЅС‚</p>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.button
          className="collapse-btn"
          onClick={() => setCollapsed(value => !value)}
          title={collapsed ? 'Р Р°Р·РІРµСЂРЅСѓС‚СЊ' : 'РЎРІРµСЂРЅСѓС‚СЊ'}
          whileHover={{ scale: 1.15 }}
          whileTap={{ scale: 0.9 }}
        >
          <motion.span
            animate={{ rotate: collapsed ? 0 : 180 }}
            transition={{ duration: 0.3 }}
            style={{ display: 'inline-block' }}
          >
            вЂє
          </motion.span>
        </motion.button>
      </div>

      <nav className="sidebar__nav">
        {NAV_BASE.filter(item => !item.adminOnly || currentUser?.role === 'admin').map((item, i) => {
          const active = location.pathname === item.path
          return (
            <motion.div
              key={item.path}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05, duration: 0.25 }}
            >
              <Link
                to={item.path}
                className={`nav-item${active ? ' nav-item--active' : ''}`}
                title={collapsed ? item.label : undefined}
              >
                <motion.span
                  className="nav-icon"
                  whileHover={{ scale: 1.3, rotate: -8 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                >
                  {item.icon}
                </motion.span>

                <AnimatePresence>
                  {!collapsed && (
                    <motion.span
                      className="nav-label"
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: 'auto' }}
                      exit={{ opacity: 0, width: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      {item.label}
                    </motion.span>
                  )}
                </AnimatePresence>

                {active && (
                  <motion.span
                    className="nav-indicator"
                    layoutId="nav-pill"
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  />
                )}
              </Link>
            </motion.div>
          )
        })}
      </nav>

      <motion.button
        className={`theme-toggle${collapsed ? ' theme-toggle--sm' : ''}`}
        onClick={() => setDark(value => !value)}
        title={dark ? 'РЎРІРµС‚Р»Р°СЏ С‚РµРјР°' : 'РўС‘РјРЅР°СЏ С‚РµРјР°'}
        whileTap={{ scale: 0.95 }}
      >
        <div className="toggle-track">
          <motion.div
            className="toggle-thumb"
            animate={{ x: dark ? 22 : 2 }}
            transition={{ type: 'spring', stiffness: 600, damping: 32 }}
          >
            <AnimatePresence mode="wait">
              <motion.span
                key={dark ? 'moon' : 'sun'}
                initial={{ rotate: -60, opacity: 0, scale: 0.5 }}
                animate={{ rotate: 0, opacity: 1, scale: 1 }}
                exit={{ rotate: 60, opacity: 0, scale: 0.5 }}
                transition={{ duration: 0.2 }}
                style={{ display: 'flex' }}
              >
                {dark
                  ? <Moon size={12} strokeWidth={2.5} />
                  : <Sun size={12} strokeWidth={2.5} />
                }
              </motion.span>
            </AnimatePresence>
          </motion.div>
        </div>

        <AnimatePresence>
          {!collapsed && (
            <motion.span
              className="toggle-label"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {dark ? 'РўС‘РјРЅР°СЏ' : 'РЎРІРµС‚Р»Р°СЏ'}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>

      <AnimatePresence>
        {sessionId && !collapsed && (
          <motion.div
            className="session-badge"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.22 }}
          >
            <span>рџ“„</span>
            <span className="session-badge__name">{documentName || 'Р”РѕРєСѓРјРµРЅС‚ Р·Р°РіСЂСѓР¶РµРЅ'}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!collapsed && (
          <motion.div
            className="user-badge"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.22 }}
          >
            <div style={{ minWidth: 0 }}>
              <Link to="/profile" style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="user-badge__name">{currentUser.username}</div>
              </Link>
              <div className="user-badge__role">{currentUser.role}</div>
            </div>
            <button className="user-badge__logout" onClick={handleLogout} title="Р’С‹Р№С‚Рё">вЏЏ</button>
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
            className={['/', '/upload'].includes(location.pathname) ? 'page-full' : 'page-container'}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.26, ease: 'easeInOut' }}
          >
            <Routes location={location}>
              <Route path="/"             element={<LandingPage />} />
              <Route path="/upload"       element={<UploadPage sessionId={sessionId} setSessionId={setSessionId} setDocumentName={setDocumentName} />} />
              <Route path="/chat"         element={<ChatPage sessionId={sessionId} documentName={documentName} />} />
              <Route path="/presentation" element={<PresentationPage sessionId={sessionId} />} />
              <Route path="/compare"      element={<ComparisonPage />} />
              <Route path="/convert"      element={<ConvertPage sessionId={sessionId} />} />
              <Route path="/profile"      element={<ProfilePage currentUser={currentUser} />} />
              <Route path="/admin"        element={<AdminPage currentUser={currentUser} />} />
              <Route path="/login"        element={<Navigate to="/" replace />} />
            </Routes>
          </motion.div>
        </AnimatePresence>
      </div>
    </LegacyPageCanvasHost>
  )
}

export default function App() {
  const [sessionId, setSessionId] = useState(null)
  const [documentName, setDocumentName] = useState('')
  const [appName, setAppName] = useState(() => localStorage.getItem('appName') || 'KENCE.ai')
  const [appEmoji, setAppEmoji] = useState(() => localStorage.getItem('appEmoji') || 'K')
  const [editName, setEditName] = useState(false)
  const [editEmoji, setEditEmoji] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [dark, setDark] = useState(() => localStorage.getItem('theme') === 'dark')
  const [currentUser, setCurrentUser] = useState(() => getStoredUser())

  const location = useLocation()
  const nameRef = useRef(null)
  const emojiRef = useRef(null)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('theme', dark ? 'dark' : 'light')
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
    if (!currentUser) {
      clearSessionTabsShadow()
      return
    }

    syncSessionTabsShadow({
      authenticated: true,
      tabId: `legacy:${location.pathname}`,
      routePath: location.pathname,
      title: getLegacyTabTitle(location.pathname),
      workspaceId: LEGACY_WORKSPACE_ID,
      sessionId,
      documentName,
    })
  }, [currentUser, location.pathname, sessionId, documentName])

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
    setSessionId(null)
    setDocumentName('')
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
      leftRail={(
        <LeftRailShell>
          <LegacySidebar
            appEmoji={appEmoji}
            appName={appName}
            collapsed={collapsed}
            currentUser={currentUser}
            dark={dark}
            documentName={documentName}
            editEmoji={editEmoji}
            editName={editName}
            emojiRef={emojiRef}
            handleLogout={handleLogout}
            location={location}
            nameRef={nameRef}
            saveEmoji={saveEmoji}
            saveName={saveName}
            sessionId={sessionId}
            setAppEmoji={setAppEmoji}
            setAppName={setAppName}
            setCollapsed={setCollapsed}
            setDark={setDark}
            setEditEmoji={setEditEmoji}
            setEditName={setEditName}
          />
        </LeftRailShell>
      )}
      topCommandBar={(
        <TopCommandBarShell
          currentLabel={getLegacyTabTitle(location.pathname)}
          documentName={documentName}
        />
      )}
      mainCanvas={(
        <LegacyRoutesCanvas
          currentUser={currentUser}
          documentName={documentName}
          location={location}
          sessionId={sessionId}
          setDocumentName={setDocumentName}
          setSessionId={setSessionId}
        />
      )}
      rightPanel={<RightPanelShellPlaceholder />}
      bottomActivity={<BottomActivityShellPlaceholder />}
    />
  )
}
