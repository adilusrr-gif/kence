import React, { useCallback, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, Upload, MessageSquare, GitCompare,
  Presentation, RefreshCw, User, Shield, Cpu, BarChart2,
  ChevronLeft, ChevronRight,
} from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { useShellStore } from '@/shared/stores/shellStore'
import { useAuthStore, selectCurrentRole } from '@/shared/stores/authStore'

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

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: 'Dashboard',    path: '/' },
  { icon: Upload,          label: 'Upload',        path: '/upload' },
  { icon: MessageSquare,   label: 'Workspace',     path: '/workspace' },
  { icon: GitCompare,      label: 'Compare',       path: '/compare' },
  { icon: Presentation,    label: 'Presentation',  path: '/presentation' },
  { icon: RefreshCw,       label: 'Convert',       path: '/convert' },
]

const UTILITY_ITEMS = [
  { icon: BarChart2, label: 'Analytics',   path: '/analytics',   adminOnly: false },
  { icon: User,      label: 'Profile',     path: '/profile',     adminOnly: false },
  { icon: Shield,    label: 'Admin',       path: '/admin',       adminOnly: true },
  { icon: Cpu,       label: 'AI Settings', path: '/ai-settings', adminOnly: true },
]

function NavItem({ icon: Icon, label, path, isActive, collapsed, onNavigate, isMobile }) {
  const showLabel = !collapsed || isMobile
  return (
    <div className="left-rail__nav-item-wrapper" title={collapsed && !isMobile ? label : undefined}>
      <button
        type="button"
        className={`left-rail__nav-item${isActive ? ' left-rail__nav-item--active' : ''}`}
        aria-label={label}
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
              {label}
            </motion.span>
          )}
          {isMobile && (
            <span className="left-rail__nav-label">{label}</span>
          )}
        </AnimatePresence>
      </button>
    </div>
  )
}

function UserAvatar({ username, role, collapsed }) {
  const initials = username
    ? username.slice(0, 2).toUpperCase()
    : '?'
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
  const { pathname } = useLocation()
  const collapsed = useShellStore((s) => s.leftRail.collapsed)
  const setLeftRailCollapsed = useShellStore((s) => s.setLeftRailCollapsed)
  const role = useAuthStore(selectCurrentRole)
  const isMobile = useIsMobile()

  const handleNavigate = useCallback((path) => {
    onNavigate?.(path)
  }, [onNavigate])

  const username = user?.username || ''
  const userRole = user?.role || role || 'user'
  const isAdmin = userRole === 'admin'

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
              className="left-rail__brand-name"
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              style={{ overflow: 'hidden', whiteSpace: 'nowrap' }}
            >
              KENCE.ai
            </motion.span>
          )}
        </AnimatePresence>
        <button
          type="button"
          className="left-rail__collapse-btn"
          aria-label={collapsed ? 'Развернуть панель' : 'Свернуть панель'}
          onClick={() => setLeftRailCollapsed(!collapsed)}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Main nav */}
      <div className="left-rail__nav-section">
        {NAV_ITEMS.map((item) => (
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

      <div className="left-rail__divider" role="separator" />

      {/* Utility nav */}
      <div className="left-rail__nav-section left-rail__nav-section--utility">
        {UTILITY_ITEMS.filter((item) => !item.adminOnly || isAdmin).map((item) => (
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

      {/* User zone */}
      <div className="left-rail__user-zone">
        <UserAvatar username={username} role={userRole} collapsed={collapsed} />
      </div>
    </motion.nav>
  )
}
