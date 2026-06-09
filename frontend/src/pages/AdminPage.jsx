import React, { useState, useEffect, useCallback } from 'react'
import { Navigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import {
  Users, UserPlus, Shield, Activity, Server, Trash2, Edit2,
  Check, X, RefreshCw, ChevronDown, Search, AlertTriangle,
  Cpu, HardDrive, Clock, Database, Building2, Plus, MessageSquare, RotateCcw,
} from 'lucide-react'
import {
  apiAdminListUsers, apiAdminCreateUser,
  apiAdminActivateUser, apiAdminDeactivateUser,
  apiAdminDeleteUser, apiAdminChangeRole, apiAdminStats,
  apiAdminListOrgs, apiCreateOrg, apiUpdateOrg, apiAdminDeleteOrg,
} from '../lib/api'
import { apiGetPrompts, apiUpdatePrompt, apiResetPrompt } from '../lib/api/enterprise.js'

const ROLE_COLORS = { admin: 'var(--color-red-500)', manager: 'var(--color-amber-500)', user: 'var(--color-blue-500)' }
const ROLE_BG = {
  admin: 'color-mix(in srgb, var(--color-red-500) 15%, transparent)',
  manager: 'color-mix(in srgb, var(--color-amber-500) 15%, transparent)',
  user: 'color-mix(in srgb, var(--color-blue-500) 15%, transparent)',
}

function Toast({ toast }) {
  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: -14, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -14, scale: 0.95 }}
          style={{
            position: 'fixed', top: 20, right: 24, zIndex: 9999,
            padding: '0.7rem 1.25rem', borderRadius: 10, fontSize: 13, fontWeight: 600,
            background: toast.ok
              ? 'color-mix(in srgb, var(--status-success) 20%, var(--bg-surface))'
              : 'color-mix(in srgb, var(--status-danger) 20%, var(--bg-surface))',
            color: toast.ok ? 'var(--status-success)' : 'var(--status-danger)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.14)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}
        >
          {toast.ok ? <Check size={14} /> : <AlertTriangle size={14} />}
          {toast.msg}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function StatCard({ icon: Icon, label, value, color = 'var(--accent-primary)', sub }) {
  return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderRadius: 14, padding: '1.25rem 1.5rem',
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: 0.6, fontSize: 12, fontWeight: 600 }}>
        <Icon size={13} style={{ color }} />
        {label}
      </div>
      <div style={{ fontSize: '1.6rem', fontWeight: 800, color }}>{value ?? '—'}</div>
      {sub && <div style={{ fontSize: 11, opacity: 0.5 }}>{sub}</div>}
    </div>
  )
}

function UsersTab({ currentUser, showToast }) {
  const { t } = useTranslation()
  const ROLE_LABELS = {
    admin: t('admin.roles.admin'),
    manager: t('admin.roles.manager'),
    user: t('admin.roles.user'),
  }

  const [users, setUsers]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [actionId, setActionId]     = useState(null)
  const [search, setSearch]         = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [editRole, setEditRole]     = useState(null)
  const [form, setForm]             = useState({ username: '', password: '', role: 'user' })
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError]   = useState('')
  const [showForm, setShowForm]     = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try { setUsers(await apiAdminListUsers()) }
    catch (e) { showToast(e.message, false) }
    finally { setLoading(false) }
  }, [showToast])

  useEffect(() => { load() }, [load])

  const toggleActive = async (user) => {
    setActionId(user.username)
    try {
      if (user.is_active) await apiAdminDeactivateUser(user.username)
      else await apiAdminActivateUser(user.username)
      showToast(user.is_active
        ? t('admin.users.toastBlocked', { name: user.username })
        : t('admin.users.toastActivated', { name: user.username })
      )
      await load()
    } catch (e) { showToast(e.message, false) }
    finally { setActionId(null) }
  }

  const handleDelete = async (username) => {
    setActionId(username)
    try {
      await apiAdminDeleteUser(username)
      showToast(t('admin.users.toastDeleted', { name: username }))
      setDeleteConfirm(null)
      await load()
    } catch (e) { showToast(e.message, false) }
    finally { setActionId(null) }
  }

  const handleRoleChange = async () => {
    if (!editRole) return
    setActionId(editRole.username)
    try {
      await apiAdminChangeRole(editRole.username, editRole.role)
      showToast(t('admin.users.toastRoleChanged', {
        name: editRole.username,
        role: ROLE_LABELS[editRole.role] || editRole.role,
      }))
      setEditRole(null)
      await load()
    } catch (e) { showToast(e.message, false) }
    finally { setActionId(null) }
  }

  const handleAdd = async (e) => {
    e.preventDefault()
    setFormError('')
    if (!form.username.trim()) { setFormError(t('admin.users.errNoLogin')); return }
    if (!/^[a-zA-Z0-9_.-]+$/.test(form.username)) { setFormError(t('admin.users.errInvalidLogin')); return }
    if (form.password.length < 10) { setFormError('Пароль: минимум 10 символов'); return }
    if (!/[A-Z]/.test(form.password)) { setFormError('Пароль должен содержать заглавную букву'); return }
    if (!/[a-z]/.test(form.password)) { setFormError('Пароль должен содержать строчную букву'); return }
    if (!/\d/.test(form.password)) { setFormError('Пароль должен содержать цифру'); return }
    setFormLoading(true)
    try {
      await apiAdminCreateUser(form.username.trim(), form.password, form.role)
      showToast(t('admin.users.toastCreated', { name: form.username }))
      setForm({ username: '', password: '', role: 'user' })
      setShowForm(false)
      await load()
    } catch (e) { setFormError(e.message) }
    finally { setFormLoading(false) }
  }

  const filtered = users.filter(u =>
    u.username.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Stats bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <StatCard icon={Users} label={t('admin.users.total')}   value={users.length}                            color="var(--accent-secondary)" />
        <StatCard icon={Check} label={t('admin.users.active')}  value={users.filter(u => u.is_active).length}  color="var(--status-success)" />
        <StatCard icon={X}     label={t('admin.users.blocked')} value={users.filter(u => !u.is_active).length} color="var(--status-danger)" />
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder={t('admin.users.searchPlaceholder')}
            style={{ ...inp, paddingLeft: 30, width: '100%', boxSizing: 'border-box' }}
          />
        </div>
        <button onClick={() => load()} style={{ ...btn('ghost'), gap: 6 }}>
          <RefreshCw size={13} /> {t('admin.users.refresh')}
        </button>
        <button onClick={() => setShowForm(v => !v)} style={{ ...btn('primary'), gap: 6 }}>
          <UserPlus size={13} /> {t('admin.users.add')}
        </button>
      </div>

      {/* Add user form */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            style={{ overflow: 'hidden' }}
          >
            <form onSubmit={handleAdd} style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderRadius: 14, padding: '1.25rem 1.5rem', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end',
            }}>
              <div style={{ flex: '1 1 150px' }}>
                <label style={lbl}>{t('admin.users.loginLabel')}</label>
                <input name="username" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                  placeholder="username" style={inp} />
              </div>
              <div style={{ flex: '1 1 150px' }}>
                <label style={lbl}>{t('admin.users.passwordLabel')}</label>
                <input type="password" name="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder={t('admin.users.passwordPlaceholder')} style={inp} />
                <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 3 }}>
                  10+ символов, заглавная буква, строчная, цифра
                </div>
              </div>
              <div style={{ flex: '1 1 130px' }}>
                <label style={lbl}>{t('admin.users.roleLabel')}</label>
                <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                  style={{ ...inp, cursor: 'pointer' }}>
                  <option value="user">{t('admin.roles.user')}</option>
                  <option value="manager">{t('admin.roles.manager')}</option>
                  <option value="admin">{t('admin.roles.admin')}</option>
                </select>
              </div>
              <button type="submit" disabled={formLoading} style={btn('primary')}>
                {formLoading ? '…' : t('admin.users.createBtn')}
              </button>
              <button type="button" onClick={() => setShowForm(false)} style={btn('ghost')}>{t('admin.users.cancelBtn')}</button>
              {formError && <div style={{ width: '100%', fontSize: 12, color: 'var(--status-danger)' }}>{formError}</div>}
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Users table */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', opacity: 0.5 }}>{t('admin.users.loading')}</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', opacity: 0.4 }}>{t('admin.users.notFound')}</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-raised)' }}>
                {[
                  t('admin.users.colUser'),
                  t('admin.users.colRole'),
                  t('admin.users.colStatus'),
                  t('admin.users.colActions'),
                ].map(h => (
                  <th key={h} style={{ padding: '0.65rem 1rem', textAlign: 'left', fontWeight: 600, opacity: 0.7, fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((user, i) => (
                <tr key={user.username} style={{ borderBottom: i < filtered.length - 1 ? '1px solid var(--border-soft)' : 'none' }}>
                  <td style={{ padding: '0.7rem 1rem', fontWeight: 600 }}>
                    {user.username}
                    {user.username === currentUser?.username && (
                      <span style={{ marginLeft: 6, fontSize: 10, opacity: 0.45, fontWeight: 400 }}>{t('admin.users.youBadge')}</span>
                    )}
                  </td>

                  {/* Role cell — inline edit */}
                  <td style={{ padding: '0.7rem 1rem' }}>
                    {editRole?.username === user.username ? (
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <select
                          value={editRole.role}
                          onChange={e => setEditRole(r => ({ ...r, role: e.target.value }))}
                          style={{ ...inp, padding: '2px 6px', fontSize: 12, width: 'auto' }}
                        >
                          <option value="user">{t('admin.roles.user')}</option>
                          <option value="manager">{t('admin.roles.manager')}</option>
                          <option value="admin">{t('admin.roles.admin')}</option>
                        </select>
                        <button onClick={handleRoleChange} disabled={actionId === user.username}
                          style={{ padding: '2px 8px', borderRadius: 6, border: 'none', background: 'color-mix(in srgb, var(--status-success) 20%, transparent)', color: 'var(--status-success)', cursor: 'pointer', fontSize: 12 }}>
                          {actionId === user.username ? '…' : <Check size={11} />}
                        </button>
                        <button onClick={() => setEditRole(null)}
                          style={{ padding: '2px 6px', borderRadius: 6, border: 'none', background: 'color-mix(in srgb, var(--status-danger) 20%, transparent)', color: 'var(--status-danger)', cursor: 'pointer' }}>
                          <X size={11} />
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{
                          padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                          background: ROLE_BG[user.role] || 'color-mix(in srgb, var(--color-neutral-500) 15%, transparent)',
                          color: ROLE_COLORS[user.role] || 'var(--color-neutral-500)',
                        }}>{ROLE_LABELS[user.role] || user.role}</span>
                        {user.username !== currentUser?.username && (
                          <button onClick={() => setEditRole({ username: user.username, role: user.role })}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.4, padding: 2 }}>
                            <Edit2 size={11} />
                          </button>
                        )}
                      </div>
                    )}
                  </td>

                  <td style={{ padding: '0.7rem 1rem' }}>
                    <span style={{
                      padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                      background: user.is_active
                        ? 'color-mix(in srgb, var(--status-success) 15%, transparent)'
                        : 'color-mix(in srgb, var(--status-danger) 15%, transparent)',
                      color: user.is_active ? 'var(--status-success)' : 'var(--status-danger)',
                    }}>
                      {user.is_active ? t('admin.users.statusActive') : t('admin.users.statusBlocked')}
                    </span>
                  </td>

                  <td style={{ padding: '0.7rem 1rem' }}>
                    {user.username !== currentUser?.username ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => toggleActive(user)}
                          disabled={actionId === user.username}
                          style={{
                            padding: '3px 10px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 600,
                            cursor: 'pointer',
                            background: user.is_active
                              ? 'color-mix(in srgb, var(--status-danger) 15%, transparent)'
                              : 'color-mix(in srgb, var(--status-success) 15%, transparent)',
                            color: user.is_active ? 'var(--status-danger)' : 'var(--status-success)',
                            opacity: actionId === user.username ? 0.6 : 1,
                          }}
                        >
                          {actionId === user.username ? '…' : user.is_active ? t('admin.users.actionBlock') : t('admin.users.actionActivate')}
                        </button>
                        {deleteConfirm === user.username ? (
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button onClick={() => handleDelete(user.username)} disabled={actionId === user.username}
                              style={{ padding: '3px 8px', borderRadius: 6, border: 'none', background: 'var(--color-red-600)', color: '#fff', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                              {actionId === user.username ? '…' : t('admin.users.actionDelete')}
                            </button>
                            <button onClick={() => setDeleteConfirm(null)}
                              style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', fontSize: 12, cursor: 'pointer' }}>
                              {t('admin.users.cancelAction')}
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => setDeleteConfirm(user.username)}
                            style={{ padding: '3px 8px', borderRadius: 6, border: 'none', background: 'transparent', color: 'color-mix(in srgb, var(--status-danger) 45%, transparent)', cursor: 'pointer', transition: 'color 0.15s' }}
                            onMouseEnter={e => e.target.style.color = 'var(--status-danger)'}
                            onMouseLeave={e => e.target.style.color = 'color-mix(in srgb, var(--status-danger) 45%, transparent)'}
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    ) : (
                      <span style={{ opacity: 0.3, fontSize: 12 }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function StatsTab({ showToast }) {
  const { t } = useTranslation()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try { setStats(await apiAdminStats()) }
    catch (e) { showToast(e.message, false) }
    finally { setLoading(false) }
  }, [showToast])

  useEffect(() => { load() }, [load])

  if (loading) return <div style={{ padding: '3rem', textAlign: 'center', opacity: 0.5 }}>{t('admin.stats.loading')}</div>
  if (!stats) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
        <StatCard icon={Users}    label={t('admin.stats.totalUsers')}     value={stats.users_total}       color="var(--accent-secondary)" />
        <StatCard icon={Activity} label={t('admin.stats.activeSessions')} value={stats.active_sessions}  color="var(--accent-primary)" sub={t('admin.stats.sessionsSub')} />
        <StatCard icon={Cpu}      label={t('admin.stats.llmModel')}       value={stats.llm_model}        color="var(--status-warning)" />
        <StatCard icon={Database} label={t('admin.stats.embeddingModel')} value={stats.embedding_model}  color="var(--color-violet-500)" />
        <StatCard icon={HardDrive} label={t('admin.stats.diskFree')}      value={stats.disk_free_gb !== null ? `${stats.disk_free_gb} GB` : 'N/A'} color="var(--status-success)" />
        <StatCard icon={Clock}    label={t('admin.stats.sessionTimeout')} value={t('admin.stats.sessionTimeoutValue', { min: stats.session_timeout_min })} color="var(--color-neutral-500)" />
      </div>

      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.25rem 1.5rem' }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>{t('admin.stats.systemParams')}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            ['Chunk size', t('admin.stats.chunkSizeValue', { size: stats.chunk_size })],
            [t('admin.stats.usersActive'),  stats.users_active],
            [t('admin.stats.usersBlocked'), stats.users_blocked],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', borderBottom: '1px solid var(--border-soft)' }}>
              <span style={{ opacity: 0.6 }}>{k}</span>
              <span style={{ fontWeight: 600 }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      <button onClick={load} style={{ ...btn('ghost'), alignSelf: 'flex-start', gap: 6 }}>
        <RefreshCw size={13} /> {t('admin.stats.refresh')}
      </button>
    </div>
  )
}

const PLAN_COLORS = {
  gov:        { bg: 'color-mix(in srgb, var(--color-violet-600) 15%, transparent)', color: 'var(--color-violet-500)' },
  enterprise: { bg: 'color-mix(in srgb, var(--accent-primary) 15%, transparent)',   color: 'var(--accent-primary)' },
  pro:        { bg: 'color-mix(in srgb, var(--status-warning) 15%, transparent)',    color: 'var(--status-warning)' },
  free:       { bg: 'color-mix(in srgb, var(--color-neutral-500) 15%, transparent)', color: 'var(--color-neutral-500)' },
}

function OrgsTab({ currentUser, showToast }) {
  const [orgs, setOrgs]           = useState([])
  const [loading, setLoading]     = useState(true)
  const [actionId, setActionId]   = useState(null)
  const [showForm, setShowForm]   = useState(false)
  const [formError, setFormError] = useState('')
  const [formLoading, setFormLoading] = useState(false)
  const [editPlan, setEditPlan]   = useState(null) // {id, plan}
  const [form, setForm]           = useState({ slug: '', display_name: '', plan: 'enterprise' })

  const load = useCallback(async () => {
    setLoading(true)
    try { setOrgs(await apiAdminListOrgs()) }
    catch (e) { showToast(e.message, false) }
    finally { setLoading(false) }
  }, [showToast])

  useEffect(() => { load() }, [load])

  const handleCreate = async (e) => {
    e.preventDefault()
    setFormError('')
    if (!form.slug.trim()) { setFormError('Укажите slug'); return }
    if (!/^[a-z0-9-]+$/.test(form.slug)) { setFormError('Slug: только a-z, 0-9, дефис'); return }
    if (!form.display_name.trim()) { setFormError('Укажите название'); return }
    setFormLoading(true)
    try {
      await apiCreateOrg({ slug: form.slug.trim(), display_name: form.display_name.trim(), plan: form.plan })
      showToast(`Организация "${form.display_name}" создана`)
      setForm({ slug: '', display_name: '', plan: 'enterprise' })
      setShowForm(false)
      await load()
    } catch (e) { setFormError(e.message) }
    finally { setFormLoading(false) }
  }

  const handleToggleActive = async (org) => {
    setActionId(org.id)
    try {
      if (org.is_active) {
        await apiAdminDeleteOrg(org.id)
        showToast(`Организация "${org.display_name}" отключена`)
      } else {
        await apiUpdateOrg(org.id, { is_active: true })
        showToast(`Организация "${org.display_name}" включена`)
      }
      await load()
    } catch (e) { showToast(e.message, false) }
    finally { setActionId(null) }
  }

  const handlePlanSave = async () => {
    if (!editPlan) return
    setActionId(editPlan.id)
    try {
      await apiUpdateOrg(editPlan.id, { plan: editPlan.plan })
      showToast(`Тариф обновлён: ${editPlan.plan}`)
      setEditPlan(null)
      await load()
    } catch (e) { showToast(e.message, false) }
    finally { setActionId(null) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <StatCard icon={Building2} label="Всего организаций" value={orgs.length}                              color="var(--accent-secondary)" />
        <StatCard icon={Check}     label="Активных"          value={orgs.filter(o => o.is_active).length}    color="var(--status-success)" />
        <StatCard icon={X}         label="Отключённых"       value={orgs.filter(o => !o.is_active).length}   color="var(--status-danger)" />
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button onClick={load} style={{ ...btn('ghost'), gap: 6 }}>
          <RefreshCw size={13} /> Обновить
        </button>
        <button onClick={() => setShowForm(v => !v)} style={{ ...btn('primary'), gap: 6 }}>
          <Plus size={13} /> Создать организацию
        </button>
      </div>

      {/* Create form */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            style={{ overflow: 'hidden' }}
          >
            <form onSubmit={handleCreate} style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderRadius: 14, padding: '1.25rem 1.5rem', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end',
            }}>
              <div style={{ flex: '1 1 160px' }}>
                <label style={lbl}>Slug (латиница)</label>
                <input
                  value={form.slug}
                  onChange={e => setForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
                  placeholder="ministry-of-defense"
                  style={inp}
                />
              </div>
              <div style={{ flex: '2 1 200px' }}>
                <label style={lbl}>Название</label>
                <input
                  value={form.display_name}
                  onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))}
                  placeholder="Министерство обороны"
                  style={inp}
                />
              </div>
              <div style={{ flex: '1 1 140px' }}>
                <label style={lbl}>Тариф</label>
                <select value={form.plan} onChange={e => setForm(f => ({ ...f, plan: e.target.value }))} style={{ ...inp, cursor: 'pointer' }}>
                  <option value="free">Free</option>
                  <option value="pro">Pro</option>
                  <option value="enterprise">Enterprise</option>
                  <option value="gov">Gov</option>
                </select>
              </div>
              <button type="submit" disabled={formLoading} style={btn('primary')}>
                {formLoading ? '…' : 'Создать'}
              </button>
              <button type="button" onClick={() => { setShowForm(false); setFormError('') }} style={btn('ghost')}>
                Отмена
              </button>
              {formError && <div style={{ width: '100%', fontSize: 12, color: 'var(--status-danger)' }}>{formError}</div>}
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Orgs table */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', opacity: 0.5 }}>Загрузка…</div>
        ) : orgs.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', opacity: 0.4 }}>Организаций нет</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-raised)' }}>
                {['ID', 'Slug', 'Название', 'Тариф', 'Статус', 'Действия'].map(h => (
                  <th key={h} style={{ padding: '0.65rem 1rem', textAlign: 'left', fontWeight: 600, opacity: 0.7, fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orgs.map((org, i) => {
                const pc = PLAN_COLORS[org.plan] || PLAN_COLORS.free
                return (
                  <tr key={org.id} style={{ borderBottom: i < orgs.length - 1 ? '1px solid var(--border-soft)' : 'none', opacity: org.is_active ? 1 : 0.5 }}>
                    <td style={{ padding: '0.7rem 1rem', opacity: 0.5, fontSize: 11 }}>{org.id}</td>
                    <td style={{ padding: '0.7rem 1rem', fontFamily: 'monospace', fontSize: 12 }}>{org.slug}</td>
                    <td style={{ padding: '0.7rem 1rem', fontWeight: 600 }}>{org.display_name}</td>

                    {/* Plan — inline edit */}
                    <td style={{ padding: '0.7rem 1rem' }}>
                      {editPlan?.id === org.id ? (
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <select
                            value={editPlan.plan}
                            onChange={e => setEditPlan(p => ({ ...p, plan: e.target.value }))}
                            style={{ ...inp, padding: '2px 6px', fontSize: 12, width: 'auto' }}
                          >
                            <option value="free">Free</option>
                            <option value="pro">Pro</option>
                            <option value="enterprise">Enterprise</option>
                            <option value="gov">Gov</option>
                          </select>
                          <button onClick={handlePlanSave} disabled={actionId === org.id}
                            style={{ padding: '2px 8px', borderRadius: 6, border: 'none', background: 'color-mix(in srgb, var(--status-success) 20%, transparent)', color: 'var(--status-success)', cursor: 'pointer', fontSize: 12 }}>
                            {actionId === org.id ? '…' : <Check size={11} />}
                          </button>
                          <button onClick={() => setEditPlan(null)}
                            style={{ padding: '2px 6px', borderRadius: 6, border: 'none', background: 'color-mix(in srgb, var(--status-danger) 20%, transparent)', color: 'var(--status-danger)', cursor: 'pointer' }}>
                            <X size={11} />
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: pc.bg, color: pc.color }}>
                            {org.plan.toUpperCase()}
                          </span>
                          <button onClick={() => setEditPlan({ id: org.id, plan: org.plan })}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.4, padding: 2 }}>
                            <Edit2 size={11} />
                          </button>
                        </div>
                      )}
                    </td>

                    <td style={{ padding: '0.7rem 1rem' }}>
                      <span style={{
                        padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                        background: org.is_active
                          ? 'color-mix(in srgb, var(--status-success) 15%, transparent)'
                          : 'color-mix(in srgb, var(--status-danger) 15%, transparent)',
                        color: org.is_active ? 'var(--status-success)' : 'var(--status-danger)',
                      }}>
                        {org.is_active ? 'Активна' : 'Отключена'}
                      </span>
                    </td>

                    <td style={{ padding: '0.7rem 1rem' }}>
                      <button
                        onClick={() => handleToggleActive(org)}
                        disabled={actionId === org.id}
                        style={{
                          padding: '3px 10px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                          background: org.is_active
                            ? 'color-mix(in srgb, var(--status-danger) 15%, transparent)'
                            : 'color-mix(in srgb, var(--status-success) 15%, transparent)',
                          color: org.is_active ? 'var(--status-danger)' : 'var(--status-success)',
                          opacity: actionId === org.id ? 0.6 : 1,
                        }}
                      >
                        {actionId === org.id ? '…' : org.is_active ? 'Отключить' : 'Включить'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function PromptsTab({ showToast }) {
  const PROMPTS = [
    {
      key: 'chat_prompt',
      label: 'Точный ответ',
      desc: 'Режим по умолчанию — цитирует документ дословно',
    },
    {
      key: 'consultation_prompt',
      label: 'Консультант',
      desc: 'Режим консультации — рассуждает, интерпретирует, предлагает выводы',
    },
  ]

  const [prompts, setPrompts] = useState({})
  const [edited, setEdited]   = useState({})
  const [saving, setSaving]   = useState({})
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiGetPrompts()
      const map = {}
      Object.entries(data.prompts || {}).forEach(([k, v]) => { map[k] = v.content ?? v })
      setPrompts(map)
      setEdited(map)
    } catch (e) { showToast(e.message, false) }
    finally { setLoading(false) }
  }, [showToast])

  useEffect(() => { load() }, [load])

  const save = async (key) => {
    setSaving(s => ({ ...s, [key]: true }))
    try {
      await apiUpdatePrompt(key, edited[key])
      setPrompts(p => ({ ...p, [key]: edited[key] }))
      showToast('Промпт сохранён')
    } catch (e) { showToast(e.message, false) }
    finally { setSaving(s => ({ ...s, [key]: false })) }
  }

  const reset = async (key) => {
    setSaving(s => ({ ...s, [key]: true }))
    try {
      await apiResetPrompt(key)
      await load()
      showToast('Промпт сброшен до стандартного')
    } catch (e) { showToast(e.message, false) }
    finally { setSaving(s => ({ ...s, [key]: false })) }
  }

  if (loading) return <div style={{ padding: '3rem', textAlign: 'center', opacity: 0.5 }}>Загрузка…</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {PROMPTS.map(({ key, label, desc }) => {
        const isDirty = edited[key] !== prompts[key]
        return (
          <div key={key} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <MessageSquare size={14} style={{ color: 'var(--accent-primary)' }} />
                  {label}
                  {isDirty && <span style={{ fontSize: 10, background: 'color-mix(in srgb, var(--status-warning) 20%, transparent)', color: 'var(--status-warning)', padding: '1px 7px', borderRadius: 20, fontWeight: 600 }}>изменён</span>}
                </div>
                <div style={{ fontSize: 12, opacity: 0.5, marginTop: 2 }}>{desc}</div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button
                  onClick={() => reset(key)}
                  disabled={saving[key]}
                  title="Сбросить до стандартного"
                  style={{ ...btn('ghost'), padding: '0.35rem 0.7rem', gap: 4, fontSize: 12 }}
                >
                  <RotateCcw size={12} /> Сброс
                </button>
                <button
                  onClick={() => save(key)}
                  disabled={saving[key] || !isDirty}
                  style={{ ...btn('primary'), padding: '0.35rem 0.9rem', gap: 4, fontSize: 12, opacity: (!isDirty && !saving[key]) ? 0.4 : 1 }}
                >
                  {saving[key] ? '…' : <><Check size={12} /> Сохранить</>}
                </button>
              </div>
            </div>
            <textarea
              value={edited[key] ?? ''}
              onChange={e => setEdited(p => ({ ...p, [key]: e.target.value }))}
              rows={12}
              style={{
                ...inp,
                fontFamily: 'monospace', fontSize: 12, lineHeight: 1.55,
                resize: 'vertical', minHeight: 200,
              }}
            />
          </div>
        )
      })}
    </div>
  )
}

export default function AdminPage({ currentUser }) {
  const { t } = useTranslation()

  if (currentUser?.role !== 'admin') return <Navigate to="/" replace />

  const TABS = [
    { key: 'users',   label: t('admin.tabs.users'), Icon: Users },
    { key: 'orgs',    label: 'Организации',          Icon: Building2 },
    { key: 'prompts', label: 'Промпты',               Icon: MessageSquare },
    { key: 'stats',   label: t('admin.tabs.stats'),  Icon: Activity },
  ]

  const [tab, setTab] = useState('users')
  const [toast, setToast] = useState(null)

  const showToast = useCallback((msg, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }, [])

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '2rem 1rem', position: 'relative' }}>
      <Toast toast={toast} />

      <div style={{ marginBottom: '1.5rem' }}>
        <h1 className="text-gradient-accent" style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Shield size={20} />
          {t('admin.title')}
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, opacity: 0.5 }}>{t('admin.subtitle')}</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {TABS.map(({ key, label, Icon }) => (
          <button key={key} onClick={() => setTab(key)} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '0.5rem 1rem', border: 'none', background: 'transparent',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
            color: tab === key ? 'var(--accent-primary)' : 'var(--text-muted)',
            borderBottom: tab === key ? '2px solid var(--accent-primary)' : '2px solid transparent',
            marginBottom: -1, transition: 'color 0.15s',
          }}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {tab === 'users'   && <UsersTab   currentUser={currentUser} showToast={showToast} />}
      {tab === 'orgs'    && <OrgsTab    currentUser={currentUser} showToast={showToast} />}
      {tab === 'prompts' && <PromptsTab showToast={showToast} />}
      {tab === 'stats'   && <StatsTab   showToast={showToast} />}
    </div>
  )
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const lbl = { display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 4, opacity: 0.6 }
const inp = {
  width: '100%', padding: '0.5rem 0.75rem', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--bg-raised)',
  color: 'inherit', fontSize: 13, boxSizing: 'border-box', outline: 'none',
  fontFamily: 'inherit',
}
const btn = (variant = 'ghost') => ({
  display: 'inline-flex', alignItems: 'center', gap: 5,
  padding: '0.45rem 0.9rem', borderRadius: 8, border: 'none',
  fontSize: 13, fontWeight: 600, cursor: 'pointer',
  transition: 'all 0.15s', fontFamily: 'inherit',
  ...(variant === 'ghost' && { border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-base)' }),
  ...(variant === 'primary' && { background: 'linear-gradient(135deg, var(--color-violet-600), var(--color-violet-500))', color: '#fff', border: 'none' }),
  ...(variant === 'danger' && { background: 'color-mix(in srgb, var(--status-danger) 15%, transparent)', color: 'var(--status-danger)', border: 'none' }),
})
