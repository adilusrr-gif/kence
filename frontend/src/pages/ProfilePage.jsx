import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { apiChangePassword } from '../lib/api'

const ROLE_LABELS = { admin: 'Администратор', manager: 'Менеджер', user: 'Пользователь' }
const ROLE_COLORS = { admin: '#ef4444', manager: '#f59e0b', user: '#3b82f6' }

export default function ProfilePage({ currentUser }) {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' })
  const [status, setStatus] = useState(null) // { ok: bool, msg: string }
  const [loading, setLoading] = useState(false)

  const handleChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }))

  const handleSubmit = async e => {
    e.preventDefault()
    setStatus(null)

    if (form.next.length < 6) {
      setStatus({ ok: false, msg: 'Новый пароль должен содержать не менее 6 символов' })
      return
    }
    if (form.next !== form.confirm) {
      setStatus({ ok: false, msg: 'Новый пароль и подтверждение не совпадают' })
      return
    }
    if (form.next === form.current) {
      setStatus({ ok: false, msg: 'Новый пароль совпадает с текущим' })
      return
    }

    setLoading(true)
    try {
      await apiChangePassword(form.current, form.next)
      setStatus({ ok: true, msg: 'Пароль успешно изменён' })
      setForm({ current: '', next: '', confirm: '' })
    } catch (err) {
      setStatus({ ok: false, msg: err.message })
    } finally {
      setLoading(false)
    }
  }

  const role = currentUser?.role || 'user'

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '2rem 1rem' }}>

      {/* Profile card */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        style={{
          background: 'var(--card-bg, #fff)',
          border: '1px solid var(--border, #e5e7eb)',
          borderRadius: 16,
          padding: '2rem',
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '1.25rem',
        }}
      >
        <div style={{
          width: 64, height: 64, borderRadius: '50%',
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 28, color: '#fff', flexShrink: 0,
        }}>
          {(currentUser?.username?.[0] || '?').toUpperCase()}
        </div>
        <div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: 4 }}>
            {currentUser?.username}
          </div>
          <span style={{
            display: 'inline-block',
            padding: '2px 10px',
            borderRadius: 20,
            fontSize: 12,
            fontWeight: 600,
            background: ROLE_COLORS[role] + '20',
            color: ROLE_COLORS[role],
          }}>
            {ROLE_LABELS[role] || role}
          </span>
        </div>
      </motion.div>

      {/* Change password */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.08 }}
        style={{
          background: 'var(--card-bg, #fff)',
          border: '1px solid var(--border, #e5e7eb)',
          borderRadius: 16,
          padding: '1.75rem 2rem',
        }}
      >
        <h2 style={{ margin: '0 0 1.25rem', fontSize: '1rem', fontWeight: 700 }}>
          Изменение пароля
        </h2>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            { name: 'current', label: 'Текущий пароль' },
            { name: 'next',    label: 'Новый пароль' },
            { name: 'confirm', label: 'Подтвердите новый пароль' },
          ].map(({ name, label }) => (
            <div key={name}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, opacity: 0.7 }}>
                {label}
              </label>
              <input
                type="password"
                name={name}
                value={form[name]}
                onChange={handleChange}
                required
                autoComplete="new-password"
                style={{
                  width: '100%',
                  padding: '0.6rem 0.85rem',
                  borderRadius: 8,
                  border: '1px solid var(--border, #d1d5db)',
                  background: 'var(--input-bg, #f9fafb)',
                  color: 'inherit',
                  fontSize: 14,
                  boxSizing: 'border-box',
                  outline: 'none',
                }}
              />
            </div>
          ))}

          {status && (
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              style={{
                padding: '0.65rem 1rem',
                borderRadius: 8,
                fontSize: 13,
                background: status.ok ? '#d1fae5' : '#fee2e2',
                color:      status.ok ? '#065f46' : '#991b1b',
              }}
            >
              {status.msg}
            </motion.div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 4,
              padding: '0.65rem 1.5rem',
              borderRadius: 8,
              border: 'none',
              background: loading ? '#94a3b8' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              color: '#fff',
              fontWeight: 700,
              fontSize: 14,
              cursor: loading ? 'not-allowed' : 'pointer',
              alignSelf: 'flex-start',
            }}
          >
            {loading ? 'Сохранение…' : 'Сменить пароль'}
          </button>
        </form>
      </motion.div>
    </div>
  )
}
