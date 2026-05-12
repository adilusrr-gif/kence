import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertCircle, Eye, EyeOff, Lock, User } from 'lucide-react'
import { apiLogin, saveAuth } from '../lib/api'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { Input } from '@/shared/ui/input'
import { Inline } from '@/shared/ui/inline'
import { Stack } from '@/shared/ui/stack'
import { StatusPill } from '@/shared/ui/status-pill'

function LoginField({ label, children }) {
  return (
    <Stack gap="sm">
      <label
        style={{
          color: 'var(--text-secondary)',
          fontSize: 'var(--text-sm)',
          fontWeight: 500,
          lineHeight: 'var(--leading-snug)',
        }}
      >
        {label}
      </label>
      {children}
    </Stack>
  )
}

export default function LoginPage({ onLogin }) {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
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
      <div className="login-grid" aria-hidden />

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        <Card
          className="login-card"
          style={{
            padding: 'var(--space-8)',
            backgroundColor: 'var(--bg-surface-1)',
          }}
        >
          <Stack gap="lg">
            <Inline gap="md" align="center" wrap>
              <motion.div
                className="login-logo__icon"
                animate={{ rotate: [0, -3, 3, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
              >
                K
              </motion.div>
              <Stack gap="xs" className="min-w-0">
                <Inline gap="sm" align="center" wrap>
                  <h1 className="login-logo__name">KENCE.ai</h1>
                  <StatusPill status="active" label="Protected access" />
                </Inline>
                <p className="login-logo__sub">
                  Государственная система анализа документов
                </p>
              </Stack>
            </Inline>

            <form onSubmit={handleSubmit} className="login-form" noValidate>
              <Stack gap="lg">
                <LoginField label="Логин">
                  <Input
                    size="lg"
                    leadingIcon={<User size={16} />}
                    type="text"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="имя пользователя"
                    autoComplete="username"
                    disabled={loading}
                    autoFocus
                  />
                </LoginField>

                <LoginField label="Пароль">
                  <Input
                    size="lg"
                    leadingIcon={<Lock size={16} />}
                    trailingIcon={
                      <button
                        type="button"
                        onClick={() => setShowPass(s => !s)}
                        tabIndex={-1}
                        aria-label={showPass ? 'Скрыть пароль' : 'Показать пароль'}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'var(--text-tertiary)',
                        }}
                      >
                        {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    }
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    disabled={loading}
                  />
                </LoginField>

                <AnimatePresence mode="wait">
                  {error ? (
                    <motion.div
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <Card
                        tone="default"
                        style={{
                          padding: 'var(--space-3) var(--space-4)',
                          backgroundColor: 'rgba(248, 113, 113, 0.1)',
                          borderColor: 'rgba(248, 113, 113, 0.28)',
                        }}
                      >
                        <Inline gap="sm" align="center">
                          <AlertCircle size={16} style={{ color: 'var(--status-danger)' }} />
                          <span
                            style={{
                              color: 'var(--status-danger)',
                              fontSize: 'var(--text-sm)',
                              lineHeight: 'var(--leading-normal)',
                            }}
                          >
                            {error}
                          </span>
                        </Inline>
                      </Card>
                    </motion.div>
                  ) : null}
                </AnimatePresence>

                <Button
                  type="submit"
                  size="lg"
                  block
                  disabled={loading || !username.trim() || !password}
                >
                  {loading ? <span className="login-spinner" /> : 'Войти в систему'}
                </Button>
              </Stack>
            </form>

            <p className="login-hint">
              Для получения доступа обратитесь к администратору системы
            </p>
          </Stack>
        </Card>
      </motion.div>
    </div>
  )
}
