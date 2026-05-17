import React, { useState, useEffect, useCallback } from 'react'
import { Navigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Users, UserPlus, Shield, Activity, Server, Trash2, Edit2,
  Check, X, RefreshCw, ChevronDown, Search, AlertTriangle,
  Cpu, HardDrive, Clock, Database,
} from 'lucide-react'
import {
  apiAdminListUsers, apiAdminCreateUser,
  apiAdminActivateUser, apiAdminDeactivateUser,
  apiAdminDeleteUser, apiAdminChangeRole, apiAdminStats,
} from '../lib/api'

const ROLE_LABELS = { admin: 'Администратор', manager: 'Менеджер', user: 'Пользователь' }
const ROLE_COLORS = { admin: '#ef4444', manager: '#f59e0b', user: '#3b82f6' }
const TABS = [
  { key: 'users',  label: 'Пользователи', Icon: Users },
  { key: 'stats',  label: 'Система',       Icon: Activity },
]

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
            background: toast.ok ? '#d1fae5' : '#fee2e2',
            color: toast.ok ? '#065f46' : '#991b1b',
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
  const [users, setUsers]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [actionId, setActionId]     = useState(null)
  const [search, setSearch]         = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [editRole, setEditRole]     = useState(null) // { username, role }
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
      showToast(user.is_active ? `${user.username} заблокирован` : `${user.username} активирован`)
      await load()
    } catch (e) { showToast(e.message, false) }
    finally { setActionId(null) }
  }

  const handleDelete = async (username) => {
    setActionId(username)
    try {
      await apiAdminDeleteUser(username)
      showToast(`Пользователь ${username} удалён`)
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
      showToast(`Роль ${editRole.username} изменена на ${ROLE_LABELS[editRole.role] || editRole.role}`)
      setEditRole(null)
      await load()
    } catch (e) { showToast(e.message, false) }
    finally { setActionId(null) }
  }

  const handleAdd = async (e) => {
    e.preventDefault()
    setFormError('')
    if (!form.username.trim()) { setFormError('Введите логин'); return }
    if (form.password.length < 6) { setFormError('Пароль: мин. 6 символов'); return }
    if (!/^[a-zA-Z0-9_.-]+$/.test(form.username)) { setFormError('Логин: только буквы, цифры, _, ., -'); return }
    setFormLoading(true)
    try {
      await apiAdminCreateUser(form.username.trim(), form.password, form.role)
      showToast(`Пользователь «${form.username}» создан`)
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
        <StatCard icon={Users} label="Всего" value={users.length} color="#6366f1" />
        <StatCard icon={Check} label="Активных" value={users.filter(u => u.is_active).length} color="#059669" />
        <StatCard icon={X}     label="Заблокировано" value={users.filter(u => !u.is_active).length} color="#dc2626" />
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Поиск по логину…"
            style={{ ...inp, paddingLeft: 30, width: '100%', boxSizing: 'border-box' }}
          />
        </div>
        <button onClick={() => load()} style={{ ...btn('ghost'), gap: 6 }}>
          <RefreshCw size={13} /> Обновить
        </button>
        <button onClick={() => setShowForm(v => !v)} style={{ ...btn('primary'), gap: 6 }}>
          <UserPlus size={13} /> Добавить
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
                <label style={lbl}>Логин</label>
                <input name="username" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                  placeholder="username" style={inp} />
              </div>
              <div style={{ flex: '1 1 150px' }}>
                <label style={lbl}>Пароль</label>
                <input type="password" name="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="мин. 6 символов" style={inp} />
              </div>
              <div style={{ flex: '1 1 130px' }}>
                <label style={lbl}>Роль</label>
                <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                  style={{ ...inp, cursor: 'pointer' }}>
                  <option value="user">Пользователь</option>
                  <option value="manager">Менеджер</option>
                  <option value="admin">Администратор</option>
                </select>
              </div>
              <button type="submit" disabled={formLoading} style={btn('primary')}>
                {formLoading ? '…' : 'Создать'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} style={btn('ghost')}>Отмена</button>
              {formError && <div style={{ width: '100%', fontSize: 12, color: '#dc2626' }}>{formError}</div>}
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Users table */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', opacity: 0.5 }}>Загрузка…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', opacity: 0.4 }}>Пользователи не найдены</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-raised)' }}>
                {['Пользователь', 'Роль', 'Статус', 'Действия'].map(h => (
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
                      <span style={{ marginLeft: 6, fontSize: 10, opacity: 0.45, fontWeight: 400 }}>(вы)</span>
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
                          <option value="user">Пользователь</option>
                          <option value="manager">Менеджер</option>
                          <option value="admin">Администратор</option>
                        </select>
                        <button onClick={handleRoleChange} disabled={actionId === user.username}
                          style={{ padding: '2px 8px', borderRadius: 6, border: 'none', background: '#d1fae5', color: '#065f46', cursor: 'pointer', fontSize: 12 }}>
                          {actionId === user.username ? '…' : <Check size={11} />}
                        </button>
                        <button onClick={() => setEditRole(null)}
                          style={{ padding: '2px 6px', borderRadius: 6, border: 'none', background: '#fee2e2', color: '#991b1b', cursor: 'pointer' }}>
                          <X size={11} />
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{
                          padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                          background: (ROLE_COLORS[user.role] || '#64748b') + '18',
                          color: ROLE_COLORS[user.role] || '#64748b',
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
                      background: user.is_active ? '#d1fae518' : '#fee2e218',
                      color: user.is_active ? '#059669' : '#dc2626',
                    }}>
                      {user.is_active ? 'Активен' : 'Заблокирован'}
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
                            background: user.is_active ? '#fee2e2' : '#d1fae5',
                            color: user.is_active ? '#dc2626' : '#059669',
                            opacity: actionId === user.username ? 0.6 : 1,
                          }}
                        >
                          {actionId === user.username ? '…' : user.is_active ? 'Заблокировать' : 'Активировать'}
                        </button>
                        {deleteConfirm === user.username ? (
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button onClick={() => handleDelete(user.username)} disabled={actionId === user.username}
                              style={{ padding: '3px 8px', borderRadius: 6, border: 'none', background: '#dc2626', color: '#fff', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                              {actionId === user.username ? '…' : 'Удалить'}
                            </button>
                            <button onClick={() => setDeleteConfirm(null)}
                              style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', fontSize: 12, cursor: 'pointer' }}>
                              Отмена
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => setDeleteConfirm(user.username)}
                            style={{ padding: '3px 8px', borderRadius: 6, border: 'none', background: 'transparent', color: '#dc262660', cursor: 'pointer', transition: 'color 0.15s' }}
                            onMouseEnter={e => e.target.style.color = '#dc2626'}
                            onMouseLeave={e => e.target.style.color = '#dc262660'}
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
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try { setStats(await apiAdminStats()) }
    catch (e) { showToast(e.message, false) }
    finally { setLoading(false) }
  }, [showToast])

  useEffect(() => { load() }, [load])

  if (loading) return <div style={{ padding: '3rem', textAlign: 'center', opacity: 0.5 }}>Загрузка…</div>
  if (!stats) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
        <StatCard icon={Users}    label="Пользователей"     value={stats.users_total}       color="#6366f1" />
        <StatCard icon={Activity} label="Активных сессий"   value={stats.active_sessions}   color="#3b82f6" sub="в памяти сервера" />
        <StatCard icon={Cpu}      label="LLM модель"        value={stats.llm_model}         color="#f59e0b" />
        <StatCard icon={Database} label="Embedding модель"  value={stats.embedding_model}   color="#8b5cf6" />
        <StatCard icon={HardDrive} label="Свободно на диске" value={stats.disk_free_gb !== null ? `${stats.disk_free_gb} GB` : 'N/A'} color="#059669" />
        <StatCard icon={Clock}    label="Таймаут сессии"    value={`${stats.session_timeout_min} мин`} color="#64748b" />
      </div>

      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.25rem 1.5rem' }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Параметры системы</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            ['Chunk size', stats.chunk_size + ' символов'],
            ['Пользователей активных', stats.users_active],
            ['Пользователей заблокировано', stats.users_blocked],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', borderBottom: '1px solid var(--border-soft)' }}>
              <span style={{ opacity: 0.6 }}>{k}</span>
              <span style={{ fontWeight: 600 }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      <button onClick={load} style={{ ...btn('ghost'), alignSelf: 'flex-start', gap: 6 }}>
        <RefreshCw size={13} /> Обновить
      </button>
    </div>
  )
}

export default function AdminPage({ currentUser }) {
  if (currentUser?.role !== 'admin') return <Navigate to="/" replace />

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
        <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Shield size={20} style={{ color: 'var(--accent-primary)' }} />
          Панель администратора
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, opacity: 0.5 }}>Управление пользователями и мониторинг системы</p>
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

      {tab === 'users' && <UsersTab currentUser={currentUser} showToast={showToast} />}
      {tab === 'stats' && <StatsTab showToast={showToast} />}
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
  ...(variant === 'primary' && { background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', border: 'none' }),
  ...(variant === 'danger' && { background: '#fee2e2', color: '#dc2626', border: 'none' }),
})
