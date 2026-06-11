import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import LandingPage from './pages/LandingPage'
import DashboardPage from './pages/DashboardPage'
import UploadPage from './pages/UploadPage'
import DocumentWorkspacePage from './pages/DocumentWorkspacePage'
import PresentationPage from './pages/PresentationPage'
import ImageGenerationPage from './pages/ImageGenerationPage'
import ComparisonPage from './pages/ComparisonPage'
import ConvertPage from './pages/ConvertPage'
import LoginPage from './pages/LoginPage'
import ProfilePage from './pages/ProfilePage'
import AdminPage from './pages/AdminPage'
import AISettingsPage from './pages/AISettingsPage'
import AnalyticsPage from './pages/AnalyticsPage'
import OrgSettingsPage from './pages/OrgSettingsPage'
import DocumentLibraryPage from './pages/DocumentLibraryPage'
import ExecutiveDashboardPage from './pages/ExecutiveDashboardPage'
import KnowledgeGraphPage from './pages/KnowledgeGraphPage'
import AgentLauncherPage from './pages/AgentLauncherPage'
import AgentTaskMonitorPage from './pages/AgentTaskMonitorPage'
import AgentTaskHistoryPage from './pages/AgentTaskHistoryPage'
import DocumentInsightsPage from './pages/DocumentInsightsPage'
import { getStoredUser, clearAuth, apiRefreshToken, saveAuth } from './lib/api'
import { AppShellLayout } from '@/app/layouts/app-shell'
import ShellHydrator from '@/app/shell/ShellHydrator'
import { LeftRail } from '@/widgets/left-rail'
import { TopCommandBar } from '@/widgets/top-command-bar'
import WorkspaceTabsBar from '@/widgets/workspace-tabs/WorkspaceTabsBar'
import RightIntelligencePanel from '@/widgets/right-intelligence-panel/RightIntelligencePanel'
import { BottomActivityRail } from '@/widgets/bottom-activity-rail'
import { LegacyPageCanvasHost } from '@/widgets/main-canvas-host'
import { ToastContainer } from '@/shared/ui/toast'
import { ErrorBoundary } from '@/shared/ui/error-boundary/ErrorBoundary'
import {
  syncAuthShadow,
  syncShellShadow,
  syncWorkspaceShadow,
} from '@/shared/stores'
import useOrgStore from '@/shared/stores/orgStore'
import { useSessionTabsStore, ROUTE_TAB_MAP } from '@/shared/stores/sessionTabsStore'
import { useShellStore } from '@/shared/stores/shellStore'

function LegacyRoutesCanvas({ currentUser, documentName, location, sessionId, sessionHistory, setDocumentName, setSessionId, onNewSession, onRestoreSession, onDeleteSession }) {
  return (
    <LegacyPageCanvasHost>
      <div className="legacy-main-content">
        <AnimatePresence>
          <motion.div
            key={location.pathname}
            className={['/upload', '/workspace'].includes(location.pathname) ? 'page-full' : location.pathname === '/' ? 'page-scrollable' : 'page-container'}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            <Routes location={location}>
              <Route path="/"             element={<DashboardPage sessionHistory={sessionHistory} currentUser={currentUser} onNewSession={onNewSession} onRestoreSession={onRestoreSession} onDeleteSession={onDeleteSession} />} />
              <Route path="/home"         element={<LandingPage />} />
              <Route path="/upload"       element={<UploadPage sessionId={sessionId} setSessionId={setSessionId} setDocumentName={setDocumentName} />} />
              <Route path="/workspace"    element={<DocumentWorkspacePage sessionId={sessionId} documentName={documentName} />} />
              <Route path="/presentation" element={<PresentationPage sessionId={sessionId} />} />
              <Route path="/image-generation" element={<ImageGenerationPage />} />
              <Route path="/compare"      element={<ComparisonPage />} />
              <Route path="/convert"      element={<ConvertPage sessionId={sessionId} />} />
              <Route path="/profile"      element={<ProfilePage currentUser={currentUser} />} />
              <Route path="/admin"        element={<AdminPage currentUser={currentUser} />} />
              <Route path="/ai-settings"  element={<AISettingsPage currentUser={currentUser} />} />
              <Route path="/analytics"       element={<AnalyticsPage />} />
              <Route path="/library"         element={<DocumentLibraryPage currentUser={currentUser} />} />
              <Route path="/org/settings"    element={<OrgSettingsPage currentUser={currentUser} />} />
              <Route path="/executive"       element={<ExecutiveDashboardPage currentUser={currentUser} />} />
              <Route path="/graph"           element={<KnowledgeGraphPage currentUser={currentUser} />} />
              <Route path="/agents"          element={<AgentLauncherPage currentUser={currentUser} />} />
              <Route path="/agents/tasks/:taskId" element={<AgentTaskMonitorPage currentUser={currentUser} />} />
              <Route path="/agents/history"  element={<AgentTaskHistoryPage currentUser={currentUser} />} />
              <Route path="/insights"        element={<DocumentInsightsPage sessionId={sessionId} documentName={documentName} />} />
              <Route path="/chat"            element={<Navigate to="/workspace" replace />} />
              <Route path="/vector-base"     element={<Navigate to="/admin" replace />} />
              <Route path="/login"           element={<Navigate to="/" replace />} />
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
  const [currentUser, setCurrentUser] = useState(() => getStoredUser())
  const [sessionHistory, setSessionHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('kence_session_history') || '[]') }
    catch { return [] }
  })

  const location = useLocation()
  const navigate = useNavigate()
  const openTab = useSessionTabsStore((s) => s.openTab)
  const theme = useShellStore((s) => s.theme)
  const fetchMyOrgs = useOrgStore((s) => s.fetchMyOrgs)

  const handleSetSessionId = useCallback((id) => {
    setSessionId(id)
    id ? localStorage.setItem('docai_session', id) : localStorage.removeItem('docai_session')
  }, [])

  const handleSetDocumentName = useCallback((name) => {
    setDocumentName(name)
    name ? localStorage.setItem('docai_docname', name) : localStorage.removeItem('docai_docname')
  }, [])

  // Apply theme to DOM
  useEffect(() => {
    const isDark = theme === 'dark'
    document.documentElement.classList.toggle('dark', isDark)
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
    localStorage.setItem('theme', theme)
  }, [theme])

  // Fetch orgs after login
  useEffect(() => {
    if (currentUser) fetchMyOrgs()
  }, [currentUser])

  // Auto-refresh JWT: decode exp from token, schedule refresh 10 min before expiry
  useEffect(() => {
    if (!currentUser) return
    const token = localStorage.getItem('kence_token')
    if (!token) return
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      const expiresAt = payload.exp * 1000  // ms
      const refreshAt = expiresAt - 10 * 60 * 1000  // 10 min before
      const delay = refreshAt - Date.now()
      if (delay <= 0) return  // already near/past expiry, let 401 handle it
      const timer = setTimeout(async () => {
        try {
          const data = await apiRefreshToken()
          saveAuth(data.access_token, data.username, data.role)
        } catch {
          // Refresh failed silently — next API call will trigger 401 → login redirect
        }
      }, delay)
      return () => clearTimeout(timer)
    } catch { /* invalid token format, ignore */ }
  }, [currentUser])

  // Sync shadow stores
  useEffect(() => { syncAuthShadow(currentUser) }, [currentUser])

  useEffect(() => {
    syncShellShadow({ theme })
  }, [theme])

  useEffect(() => {
    syncWorkspaceShadow({ activeSessionId: sessionId, activeDocumentName: documentName })
  }, [sessionId, documentName])

  // Track session history
  useEffect(() => {
    if (!sessionId || !documentName) return
    setSessionHistory((prev) => {
      const entry = { id: sessionId, name: documentName, at: Date.now() }
      const next = [entry, ...prev.filter((s) => s.id !== sessionId)].slice(0, 5)
      localStorage.setItem('kence_session_history', JSON.stringify(next))
      return next
    })
  }, [sessionId, documentName])

  // Open a tab for every route navigation
  useEffect(() => {
    const meta = ROUTE_TAB_MAP[location.pathname]
    if (meta && currentUser) {
      openTab({ routePath: location.pathname })
    }
  }, [location.pathname, currentUser, openTab])

  const handleDeleteSession = useCallback((id) => {
    setSessionHistory(prev => {
      const next = prev.filter(s => s.id !== id)
      localStorage.setItem('kence_session_history', JSON.stringify(next))
      return next
    })
  }, [])

  const handleLogout = useCallback(() => {
    clearAuth()
    setCurrentUser(null)
    handleSetSessionId(null)
    handleSetDocumentName('')
    setSessionHistory([])
    localStorage.removeItem('kence_session_history')
    useSessionTabsStore.getState().clearSessionTabs()
    navigate('/login', { replace: true })
  }, [navigate, handleSetSessionId, handleSetDocumentName])

  const handleRestoreSession = useCallback((entry) => {
    handleSetSessionId(entry.id)
    handleSetDocumentName(entry.name)
    navigate('/workspace')
  }, [handleSetSessionId, handleSetDocumentName, navigate])

  const handleNewSession = useCallback(async () => {
    try {
      const token = localStorage.getItem('kence_token')
      const res = await fetch('/api/sessions', { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error('Failed to create session')
      const { session_id } = await res.json()
      handleSetSessionId(session_id)
      handleSetDocumentName('')
      navigate('/upload')
    } catch (err) {
      console.error('handleNewSession:', err)
    }
  }, [handleSetSessionId, handleSetDocumentName, navigate])

  const handleTabNavigate = useCallback((path) => {
    navigate(path)
  }, [navigate])

  if (!currentUser) {
    return (
      <ErrorBoundary>
        <Routes>
          <Route path="/login" element={<LoginPage onLogin={setCurrentUser} />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </ErrorBoundary>
    )
  }

  return (
    <ErrorBoundary>
    <ShellHydrator>
      <ToastContainer />
      <AppShellLayout
        leftRail={(
          <LeftRail
            user={currentUser}
            onNavigate={handleTabNavigate}
          />
        )}
        topCommandBar={(
          <TopCommandBar
            user={currentUser}
            onLogout={handleLogout}
            onNavigate={handleTabNavigate}
            documentName={documentName}
          />
        )}
        tabsBar={(
          <WorkspaceTabsBar
            onTabNavigate={handleTabNavigate}
          />
        )}
        mainCanvas={(
          <LegacyRoutesCanvas
            currentUser={currentUser}
            documentName={documentName}
            location={location}
            sessionId={sessionId}
            sessionHistory={sessionHistory}
            setDocumentName={handleSetDocumentName}
            setSessionId={handleSetSessionId}
            onNewSession={handleNewSession}
            onRestoreSession={handleRestoreSession}
            onDeleteSession={handleDeleteSession}
          />
        )}
        rightPanel={<RightIntelligencePanel />}
        bottomActivity={<BottomActivityRail />}
      />
    </ShellHydrator>
    </ErrorBoundary>
  )
}
