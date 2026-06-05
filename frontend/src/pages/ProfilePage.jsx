import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { Inline } from '@/shared/ui/inline'
import { Input } from '@/shared/ui/input'
import { SectionHeader } from '@/shared/ui/section-header'
import { Stack } from '@/shared/ui/stack'
import { apiChangePassword } from '../lib/api'

const ROLE_VARIANTS = { admin: 'danger', manager: 'warning', user: 'info' }

export default function ProfilePage({ currentUser }) {
  const { t } = useTranslation()
  const [form, setForm] = useState({ current: '', next: '', confirm: '' })
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(false)

  const FIELD_CONFIG = [
    { name: 'current', label: t('profile.currentPassword') },
    { name: 'next', label: t('profile.newPassword') },
    { name: 'confirm', label: t('profile.confirmPassword') },
  ]

  const handleChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }))

  const handleSubmit = async e => {
    e.preventDefault()
    setStatus(null)

    if (form.next.length < 6) {
      setStatus({ ok: false, msg: t('profile.errTooShort') })
      return
    }
    if (form.next !== form.confirm) {
      setStatus({ ok: false, msg: t('profile.errMismatch') })
      return
    }
    if (form.next === form.current) {
      setStatus({ ok: false, msg: t('profile.errSame') })
      return
    }

    setLoading(true)
    try {
      await apiChangePassword(form.current, form.next)
      setStatus({ ok: true, msg: t('profile.successMsg') })
      setForm({ current: '', next: '', confirm: '' })
    } catch (err) {
      setStatus({ ok: false, msg: err.message })
    } finally {
      setLoading(false)
    }
  }

  const role = currentUser?.role || 'user'

  return (
    <div
      className="profile-shell"
      style={{
        width: 'min(100%, 40rem)',
        margin: '0 auto',
        padding: 'var(--space-8) var(--space-4)',
      }}
    >
      <Stack gap="lg">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Card
            className="profile-shell__card"
            style={{ padding: 'var(--space-6)' }}
          >
            <Inline gap="md" align="center">
              <div
                aria-hidden="true"
                style={{
                  width: '4rem',
                  height: '4rem',
                  borderRadius: 'var(--radius-pill)',
                  background: 'var(--gradient-accent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--color-neutral-950)',
                  fontSize: '1.75rem',
                  fontWeight: 800,
                  flexShrink: 0,
                  boxShadow: '0 4px 16px color-mix(in srgb, var(--accent-primary) 35%, transparent)',
                }}
              >
                {(currentUser?.username?.[0] || '?').toUpperCase()}
              </div>

              <Stack gap="xs">
                <div
                  className="text-gradient-accent"
                  style={{
                    fontSize: 'var(--text-xl)',
                    fontWeight: 700,
                    lineHeight: 'var(--leading-snug)',
                  }}
                >
                  {currentUser?.username}
                </div>
                <Badge variant={ROLE_VARIANTS[role] || 'neutral'} size="md">
                  {t(`profile.roles.${role}`) || role}
                </Badge>
              </Stack>
            </Inline>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.08 }}
        >
          <Card
            as="section"
            className="profile-shell__card"
            style={{ padding: 'var(--space-6)' }}
          >
            <Stack as="form" gap="md" onSubmit={handleSubmit}>
              <SectionHeader title={t('profile.changePassword')} dense />

              {FIELD_CONFIG.map(({ name, label }) => (
                <Stack key={name} gap="xs">
                  <label
                    htmlFor={`profile-${name}`}
                    style={{
                      color: 'var(--text-secondary)',
                      fontSize: 'var(--text-sm)',
                      fontWeight: 600,
                    }}
                  >
                    {label}
                  </label>
                  <Input
                    id={`profile-${name}`}
                    type="password"
                    name={name}
                    value={form[name]}
                    onChange={handleChange}
                    autoComplete={name === 'current' ? 'current-password' : 'new-password'}
                    required
                  />
                </Stack>
              ))}

              {status ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                >
                  <Card
                    className="profile-shell__status"
                    tone={status.ok ? 'accent' : 'muted'}
                    style={{
                      padding: 'var(--space-3) var(--space-4)',
                      borderColor: status.ok ? 'color-mix(in srgb, var(--status-success) 40%, transparent)' : 'color-mix(in srgb, var(--status-danger) 40%, transparent)',
                      backgroundColor: status.ok
                        ? 'color-mix(in srgb, var(--status-success) 10%, var(--bg-surface-1))'
                        : 'color-mix(in srgb, var(--status-danger) 8%, var(--bg-surface-1))',
                      color: status.ok ? 'var(--status-success)' : 'var(--status-danger)',
                    }}
                  >
                    {status.msg}
                  </Card>
                </motion.div>
              ) : null}

              <Button type="submit" loading={loading} disabled={loading} style={{ alignSelf: 'flex-start' }}>
                {loading ? t('profile.saving') : t('profile.save')}
              </Button>
            </Stack>
          </Card>
        </motion.div>
      </Stack>
    </div>
  )
}
