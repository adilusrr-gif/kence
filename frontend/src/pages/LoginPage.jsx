import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertCircle, Eye, EyeOff, Lock, User, Shield, HardDrive, WifiOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPass, setShowPass] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (username.trim().length < 3) {
      setError(t('login.errorUsernameShort'))
      return
    }
    if (password.length < 6) {
      setError(t('login.errorPasswordShort'))
      return
    }

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
              <div className="login-logo__icon">K</div>
              <Stack gap="xs" className="min-w-0">
                <Inline gap="sm" align="center" wrap>
                  <h1 className="login-logo__name">KENCE.ai</h1>
                  <StatusPill status="active" label="Protected access" />
                </Inline>
                <p className="login-logo__sub">{t('login.subtitle')}</p>
              </Stack>
            </Inline>

            <form onSubmit={handleSubmit} className="login-form">
              <Stack gap="lg">
                <LoginField label={t('login.username')}>
                  <Input
                    size="lg"
                    leadingIcon={<User size={16} />}
                    type="text"
                    name="username"
                    value={username}
                    onChange={e => { setUsername(e.target.value); setError('') }}
                    placeholder={t('login.usernamePlaceholder')}
                    autoComplete="username"
                    disabled={loading}
                    required
                    minLength={3}
                    autoFocus
                  />
                </LoginField>

                <LoginField label={t('login.password')}>
                  <Input
                    size="lg"
                    leadingIcon={<Lock size={16} />}
                    trailingIcon={
                      <button
                        type="button"
                        onClick={() => setShowPass(s => !s)}
                        tabIndex={-1}
                        aria-label={showPass ? t('login.hidePassword') : t('login.showPassword')}
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
                    name="password"
                    value={password}
                    onChange={e => { setPassword(e.target.value); setError('') }}
                    placeholder={t('login.passwordPlaceholder')}
                    required
                    minLength={6}
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
                          backgroundColor: 'color-mix(in srgb, var(--status-danger) 10%, transparent)',
                          borderColor: 'color-mix(in srgb, var(--status-danger) 28%, transparent)',
                        }}
                      >
                        <Inline gap="sm" align="center">
                          <AlertCircle size={16} style={{ color: 'var(--status-danger)' }} />
                          <span style={{ color: 'var(--status-danger)', fontSize: 'var(--text-sm)', lineHeight: 'var(--leading-normal)' }}>
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
                  {loading ? <span className="login-spinner" /> : t('login.submit')}
                </Button>
              </Stack>
            </form>

            <p className="login-hint">{t('login.hint')}</p>

            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap', paddingTop: 4 }}>
              {[
                { Icon: HardDrive, label: 'Локальная обработка' },
                { Icon: Shield,    label: 'Шифрование данных' },
                { Icon: WifiOff,   label: 'Без облака' },
              ].map(({ Icon, label }) => (
                <span key={label} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  fontSize: 11, color: 'var(--text-faint)',
                  padding: '3px 9px', borderRadius: 6,
                  background: 'var(--bg-surface-2)',
                  border: '1px solid var(--border-subtle)',
                }}>
                  <Icon size={10} style={{ color: 'var(--status-success)' }} />
                  {label}
                </span>
              ))}
            </div>
          </Stack>
        </Card>
      </motion.div>
    </div>
  )
}
