import React, { useState, useEffect, useCallback } from 'react'
import { Navigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  apiAdminListUsers,
  apiAdminCreateUser,
  apiAdminActivateUser,
  apiAdminDeactivateUser,
} from '../lib/api'

const ROLE_LABELS = { admin: 'Администратор', manager: 'Менеджер', user: 'Пользователь' }
const ROLE_COLORS = { admin: '#ef4444', manager: '#f59e0b', user: '#3b82f6' }

export default function AdminPage({ currentUser }) {
  if (currentUser?.role !== 'admin') return <Navigate to="/" replace />

  const [users, setUsers]       = useState([])
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [actionLoading, setActionLoading] = useState(null)
  const [toast, setToast]       = useState(null)

  const [form, setForm]         = useState({ username: '', password: '', role: 'user' })
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError]     = useState('')

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  const loadUsers = useCallback(async () => {
    try {
      const data = await apiAdminListUsers()
      setUsers(data)
    } catch (err) {
      showToast(err.message, false)
    } finally {
      setLoadingUsers(false)
    }
  }, [])

  useEffect(() => { loadUsers() }, [loadUsers])

  const toggleActive = async (user) => {
    setActionLoading(user.username)
    try {
      if (user.is_active) {
        await apiAdminDeactivateUser(user.username)
        showToast(`${user.username} заблокирован`)
      } else {
        await apiAdminActivateUser(user.username)
        showToast(`${user.username} активирован`)
      }
      await loadUsers()
    } catch (err) {
      showToast(err.message, false)
    } finally {
      setActionLoading(null)
    }
  }

  const handleFormChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }))

  const handleAddUser = async e => {
    e.preventDefault()
    setFormError('')
    if (!form.username.trim()) { setFormError('Введите имя пользователя'); return }
    if (form.password.length < 6) { setFormError('Пароль должен содержать не менее 6 символов'); return }

    setFormLoading(true)
    try {
      await apiAdminCreateUser(form.username.trim(), form.password, form.role)
      showToast(`Пользователь «${form.username}» создан`)
      setForm({ username: '', password: '', role: 'user' })
      await loadUsers()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setFormLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '2rem 1rem', position: 'relative' }}>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            style={{
              position: 'fixed', top: 20, right: 24, zIndex: 9999,
              padding: '0.75rem 1.25rem', borderRadius: 10, fontSize: 14, fontWeight: 600,
              background: toast.ok ? '#d1fae5' : '#fee2e2',
              color:      toast.ok ? '#065f46' : '#991b1b',
              boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            }}
          >
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      <h1 style={{ margin: '0 0 1.5rem', fontSize: '1.35rem', fontWeight: 800 }}>
        Управление пользователями
      </h1>

      {/* Add user form */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          background: 'var(--card-bg, #fff)',
          border: '1px solid var(--border, #e5e7eb)',
          borderRadius: 16,
          padding: '1.5rem 2rem',
          marginBottom: '1.5rem',
        }}
      >
        <h2 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 700 }}>
          Добавить пользователя
        </h2>

        <form onSubmit={handleAddUser} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 160px' }}>
            <label style={labelStyle}>Логин</label>
            <input
              name="username"
              value={form.username}
              onChange={handleFormChange}
              placeholder="username"
              required
              style={inputStyle}
            />
          </div>
          <div style={{ flex: '1 1 160px' }}>
            <label style={labelStyle}>Пароль</label>
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={handleFormChange}
              placeholder="мин. 6 символов"
              required
              style={inputStyle}
            />
          </div>
          <div style={{ flex: '1 1 130px' }}>
            <label style={labelStyle}>Роль</label>
            <select
              name="role"
              value={form.role}
              onChange={handleFormChange}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              <option value="user">Пользователь</option>
              <option value="manager">Менеджер</option>
              <option value="admin">Администратор</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={formLoading}
            style={{
              padding: '0.6rem 1.25rem', borderRadius: 8, border: 'none',
              background: formLoading ? '#94a3b8' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              color: '#fff', fontWeight: 700, fontSize: 14,
              cursor: formLoading ? 'not-allowed' : 'pointer',
              height: 38, alignSelf: 'flex-end',
            }}
          >
            {formLoading ? '…' : '+ Добавить'}
          </button>
        </form>

        {formError && (
          <div style={{ marginTop: 8, fontSize: 13, color: '#dc2626' }}>{formError}</div>
        )}
      </motion.div>

      {/* Users table */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        style={{
          background: 'var(--card-bg, #fff)',
          border: '1px solid var(--border, #e5e7eb)',
          borderRadius: 16,
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '1.25rem 2rem 0.75rem', fontWeight: 700, fontSize: '1rem' }}>
          Список пользователей
        </div>

        {loadingUsers ? (
          <div style={{ padding: '2rem', textAlign: 'center', opacity: 0.5 }}>Загрузка…</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border, #e5e7eb)', opacity: 0.6 }}>
                {['Пользователь', 'Роль', 'Статус', 'Действие'].map(h => (
                  <th key={h} style={{ padding: '0.6rem 1.25rem', textAlign: 'left', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr
                  key={user.username}
                  style={{ borderBottom: '1px solid var(--border, #f1f5f9)' }}
                >
                  <td style={{ padding: '0.75rem 1.25rem', fontWeight: 600 }}>
                    {user.username}
                    {user.username === currentUser.username && (
                      <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.5 }}>(вы)</span>
                    )}
                  </td>
                  <td style={{ padding: '0.75rem 1.25rem' }}>
                    <span style={{
                      padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                      background: (ROLE_COLORS[user.role] || '#64748b') + '20',
                      color: ROLE_COLORS[user.role] || '#64748b',
                    }}>
                      {ROLE_LABELS[user.role] || user.role}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1.25rem' }}>
                    <span style={{
                      padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                      background: user.is_active ? '#d1fae520' : '#fee2e220',
                      color:      user.is_active ? '#059669'   : '#dc2626',
                    }}>
                      {user.is_active ? 'Активен' : 'Заблокирован'}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1.25rem' }}>
                    {user.username !== currentUser.username ? (
                      <button
                        onClick={() => toggleActive(user)}
                        disabled={actionLoading === user.username}
                        style={{
                          padding: '4px 14px', borderRadius: 6, border: 'none', fontSize: 13,
                          fontWeight: 600, cursor: 'pointer',
                          background: user.is_active ? '#fee2e2' : '#d1fae5',
                          color:      user.is_active ? '#dc2626' : '#059669',
                          opacity: actionLoading === user.username ? 0.6 : 1,
                        }}
                      >
                        {actionLoading === user.username ? '…' : user.is_active ? 'Заблокировать' : 'Активировать'}
                      </button>
                    ) : (
                      <span style={{ opacity: 0.35, fontSize: 13 }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </motion.div>
    </div>
  )
}

const labelStyle = {
  display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, opacity: 0.7,
}

const inputStyle = {
  width: '100%', padding: '0.55rem 0.8rem', borderRadius: 8,
  border: '1px solid var(--border, #d1d5db)',
  background: 'var(--input-bg, #f9fafb)', color: 'inherit',
  fontSize: 14, boxSizing: 'border-box', outline: 'none',
}
