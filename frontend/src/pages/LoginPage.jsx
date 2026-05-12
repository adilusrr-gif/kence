import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { apiLogin, saveAuth } from '../lib/api'

export default function LoginPage({ onLogin }) {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [showPass, setShowPass] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!username.trim() || !password) return
    setLoading(true)
    setError('')
    try {
      const data = await apiLogin(username.trim(), password)
      saveAuth(data.access_token, data.username, data.role)
      onLogin({ username: data.username, role: data.role, token: data.access_token })
      navigate('/')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-shell">
      {/* Background grid */}
      <div className="login-grid" aria-hidden />

      <motion.div
        className="login-card"
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Logo */}
        <div className="login-logo">
          <motion.div
            className="login-logo__icon"
            animate={{ rotate: [0, -3, 3, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          >
            K
          </motion.div>
          <div>
            <h1 className="login-logo__name">KENCE.ai</h1>
            <p className="login-logo__sub">Государственная система анализа документов</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="login-form" noValidate>
          <div className="login-field">
            <label className="login-label">Логин</label>
            <input
              className="login-input"
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="имя пользователя"
              autoComplete="username"
              disabled={loading}
              autoFocus
            />
          </div>

          <div className="login-field">
            <label className="login-label">Пароль</label>
            <div className="login-pass-wrap">
              <input
                className="login-input"
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                disabled={loading}
              />
              <button
                type="button"
                className="login-eye"
                onClick={() => setShowPass(s => !s)}
                tabIndex={-1}
              >
                {showPass ? '🙈' : '👁'}
              </button>
            </div>
          </div>

          <AnimatePresence mode="wait">
            {error && (
              <motion.div
                className="login-error"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                ⚠ {error}
              </motion.div>
            )}
          </AnimatePresence>

          <motion.button
            type="submit"
            className="login-btn"
            disabled={loading || !username.trim() || !password}
            whileTap={{ scale: 0.97 }}
          >
            {loading ? (
              <span className="login-spinner" />
            ) : (
              'Войти в систему'
            )}
          </motion.button>
        </form>

        <p className="login-hint">
          Для получения доступа обратитесь к администратору системы
        </p>
      </motion.div>
    </div>
  )
}
