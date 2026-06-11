import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, Upload, MessageSquare, GitCompare,
  Presentation, RefreshCw, BarChart2, ImagePlus,
  ChevronLeft, ChevronRight, Library, TrendingUp, Network, Bot, Sparkles, Settings,
} from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { useShellStore } from '@/shared/stores/shellStore'
import { useAuthStore, selectCurrentRole } from '@/shared/stores/authStore'
import { useFeatureFlags } from '@/shared/stores/featureStore'

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 600)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 600px)')
    const handler = (e) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return isMobile
}

// Full enterprise nav
const NAV_ITEMS_ENTERPRISE = [
  { icon: LayoutDashboard, labelKey: 'nav.dashboard',    path: '/' },
  { icon: Upload,          labelKey: 'nav.upload',        path: '/upload' },
  { icon: Sparkles,        labelKey: 'nav.insights',      path: '/insights' },
  { icon: MessageSquare,   labelKey: 'nav.workspace',     path: '/workspace' },
  { icon: GitCompare,      labelKey: 'nav.compare',       path: '/compare' },
  { icon: Presentation,    labelKey: 'nav.presentation',  path: '/presentation' },
  { icon: ImagePlus,       labelKey: 'nav.imageGeneration', path: '/image-generation' },
  { icon: RefreshCw,       labelKey: 'nav.convert',       path: '/convert' },
  { icon: Library,         labelKey: 'nav.library',       path: '/library', featureFlag: 'documentLibrary' },
  { icon: Network,         labelKey: 'nav.graph',         path: '/graph',   featureFlag: 'knowledgeGraph' },
  { icon: Bot,             labelKey: 'nav.agents',        path: '/agents',  featureFlag: 'fullAgents' },
]

// Government edition — 5 items, plain-language labels
const NAV_ITEMS_GOV = [
  { icon: LayoutDashboard, label: 'Главная',    path: '/' },
  { icon: Upload,          label: 'Загрузить',  path: '/upload' },
  { icon: Sparkles,        label: 'Анализ',     path: '/insights' },
  { icon: GitCompare,      label: 'Сравнить',   path: '/compare' },
  { icon: Presentation,    label: 'Доклад',     path: '/presentation' },
  { icon: ImagePlus,       label: 'Изображения', path: '/image-generation' },
]

const UTILITY_ITEMS_ENTERPRISE = [
  { icon: BarChart2,  labelKey: 'nav.analytics',   path: '/analytics',    featureFlag: 'analytics' },
  { icon: TrendingUp, labelKey: 'nav.executive',   path: '/executive',    featureFlag: 'executiveDashboard', orgAdminOnly: true },
]

const UTILITY_ITEMS_GOV = [
  { icon: TrendingUp, label: 'Статистика', path: '/executive', orgAdminOnly: true },
]

function NavItem({ icon: Icon, label, labelKey, path, isActive, collapsed, onNavigate, isMobile }) {
  const { t } = useTranslation()
  const text = label || t(labelKey)
  const showLabel = !collapsed || isMobile
  return (
    <div className="left-rail__nav-item-wrapper" title={collapsed && !isMobile ? text : undefined}>
      {isActive && (
        <motion.div
          className="left-rail__nav-active-bg"
          layoutId="nav-active-bg"
          transition={{ type: 'spring', stiffness: 400, damping: 38 }}
        />
      )}
      <button
        type="button"
        className={`left-rail__nav-item${isActive ? ' left-rail__nav-item--active' : ''}`}
        aria-label={text}
        aria-current={isActive ? 'page' : undefined}
        onClick={() => onNavigate(path)}
      >
        <span className="left-rail__nav-icon">
          <Icon size={18} />
        </span>
        <AnimatePresence initial={false}>
          {showLabel && !isMobile && (
            <motion.span
              className="left-rail__nav-label"
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              style={{ overflow: 'hidden', whiteSpace: 'nowrap' }}
            >
              {text}
            </motion.span>
          )}
          {isMobile && (
            <span className="left-rail__nav-label">{text}</span>
          )}
        </AnimatePresence>
      </button>
    </div>
  )
}

function UserAvatar({ username, role, collapsed }) {
  const initials = username ? username.slice(0, 2).toUpperCase() : '?'
  const roleColor = role === 'admin' ? 'var(--color-warning, #F59E0B)' : 'var(--accent-primary, #60A5FA)'

  return (
    <div className="left-rail__user-avatar-row" title={collapsed ? `${username} · ${role}` : undefined}>
      <div
        className="left-rail__avatar"
        style={{ background: roleColor, color: '#020617' }}
        aria-hidden="true"
      >
        {initials}
      </div>
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            className="left-rail__user-info"
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: 'auto' }}
            exit={{ opacity: 0, width: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            style={{ overflow: 'hidden' }}
          >
            <span className="left-rail__user-name">{username || 'User'}</span>
            <span className="left-rail__user-role">{role}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function LeftRail({ user, onNavigate }) {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const collapsed = useShellStore((s) => s.leftRail.collapsed)
  const setLeftRailCollapsed = useShellStore((s) => s.setLeftRailCollapsed)
  const role = useAuthStore(selectCurrentRole)
  const isMobile = useIsMobile()
  const flags = useFeatureFlags()

  const handleNavigate = useCallback((path) => {
    onNavigate?.(path)
  }, [onNavigate])

  const username = user?.username || ''
  const userRole = user?.role || role || 'user'
  const isAdmin = userRole === 'admin'
  const isGov = flags.govUx

  const navItems = isGov
    ? NAV_ITEMS_GOV
    : NAV_ITEMS_ENTERPRISE.filter(item => {
        if (item.featureFlag && !flags[item.featureFlag]) return false
        return true
      })

  const utilityItems = (isGov ? UTILITY_ITEMS_GOV : UTILITY_ITEMS_ENTERPRISE).filter(item => {
    if (item.orgAdminOnly && !isAdmin) return false
    if (item.featureFlag && !flags[item.featureFlag]) return false
    return true
  })

  return (
    <motion.nav
      className={`left-rail${(collapsed || isMobile) ? ' left-rail--collapsed' : ''}`}
      animate={isMobile ? {} : { width: collapsed ? 56 : 240 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      aria-label="Главная навигация"
    >
      {/* Brand */}
      <div className="left-rail__brand">
        <div className="left-rail__logo-icon" aria-hidden="true">K</div>
        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.span
              className="left-rail__brand-name text-gradient-accent"
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              style={{ overflow: 'hidden', whiteSpace: 'nowrap' }}
            >
              {isGov ? 'KENCE.gov' : 'KENCE.ai'}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* Main nav */}
      <div className="left-rail__nav-section">
        {navItems.map((item) => (
          <NavItem
            key={item.path}
            {...item}
            isActive={pathname === item.path || pathname.startsWith(item.path + '/')}
            collapsed={collapsed}
            onNavigate={handleNavigate}
            isMobile={isMobile}
          />
        ))}
      </div>

      <div className="left-rail__divider" role="separator" />

      {/* Utility nav */}
      <div className="left-rail__nav-section left-rail__nav-section--utility">
        {utilityItems.map((item) => (
          <NavItem
            key={item.path}
            {...item}
            isActive={pathname === item.path}
            collapsed={collapsed}
            onNavigate={handleNavigate}
            isMobile={isMobile}
          />
        ))}
      </div>

      <div className="left-rail__spacer" />

      {/* Collapse / expand button */}
      <button
        type="button"
        className="left-rail__toggle-btn"
        aria-label={collapsed ? 'Развернуть панель' : 'Свернуть панель'}
        title={collapsed ? 'Развернуть' : 'Свернуть'}
        onClick={() => setLeftRailCollapsed(!collapsed)}
      >
        <span className="left-rail__toggle-icon">
          {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
        </span>
        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.span
              className="left-rail__toggle-label"
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              style={{ overflow: 'hidden', whiteSpace: 'nowrap' }}
            >
              {t('nav.collapse', 'Свернуть')}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      {/* User zone */}
      <div className="left-rail__user-zone">
        <UserAvatar username={username} role={userRole} collapsed={collapsed} />
      </div>
    </motion.nav>
  )
}
