import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import useOrgStore from '../shared/stores/orgStore'
import {
  apiGetOrgMembers, apiAddOrgMember, apiRemoveOrgMember,
  apiGetOrgQuota, apiGetOrgApiKeys, apiCreateOrgApiKey, apiRevokeOrgApiKey,
  apiGetOrgBranding, apiUpdateOrgBranding,
} from '../lib/api'
import { useToastStore } from '../shared/stores/toastStore'

export default function OrgSettingsPage({ currentUser }) {
  const { t } = useTranslation()
  const { currentOrgId, currentOrgName } = useOrgStore()
  const addToast = useToastStore(s => s.addToast)
  const [tab, setTab] = useState(0)
  const [members, setMembers] = useState([])
  const [quota, setQuota] = useState(null)
  const [apiKeys, setApiKeys] = useState([])
  const [branding, setBranding] = useState(null)
  const [newMember, setNewMember] = useState({ username: '', org_role: 'member' })
  const [newKey, setNewKey] = useState({ name: '' })
  const [rawKey, setRawKey] = useState(null)

  const TABS = [
    t('org.tabs.general'), t('org.tabs.members'), t('org.tabs.branding'),
    t('org.tabs.quotas'), t('org.tabs.apiKeys'),
  ]
  const ROLE_LABELS = {
    owner: t('org.members.roles.owner'),
    admin: t('org.members.roles.admin'),
    member: t('org.members.roles.member'),
    viewer: t('org.members.roles.viewer'),
  }

  const isAdmin = currentUser?.role === 'admin' ||
    members.find(m => m.username === currentUser?.username && ['owner', 'admin'].includes(m.org_role))

  useEffect(() => {
    if (!currentOrgId) return
    apiGetOrgMembers(currentOrgId).then(setMembers).catch(() => {})
    apiGetOrgQuota(currentOrgId).then(setQuota).catch(() => {})
    apiGetOrgApiKeys(currentOrgId).then(setApiKeys).catch(() => {})
    apiGetOrgBranding(currentOrgId).then(setBranding).catch(() => {})
  }, [currentOrgId])

  if (!currentOrgId) return (
    <div style={{ padding: '2rem', color: 'var(--text-secondary)' }}>{t('org.noOrg')}</div>
  )

  const handleAddMember = async () => {
    if (!newMember.username.trim()) return
    try {
      const m = await apiAddOrgMember(currentOrgId, newMember)
      setMembers(prev => [...prev, m])
      setNewMember({ username: '', org_role: 'member' })
      addToast('success', t('org.members.addSuccess', { name: newMember.username }))
    } catch (e) {
      addToast('error', e.message || t('org.members.addError'))
    }
  }

  const handleRemoveMember = async (username) => {
    if (!confirm(t('org.members.removeConfirm', { name: username }))) return
    await apiRemoveOrgMember(currentOrgId, username)
    setMembers(prev => prev.filter(m => m.username !== username))
    addToast('success', t('org.members.removeSuccess', { name: username }))
  }

  const handleCreateKey = async () => {
    try {
      const result = await apiCreateOrgApiKey(currentOrgId, newKey)
      setRawKey(result.raw_key)
      setApiKeys(prev => [...prev, result])
      addToast('success', t('org.apiKeys.createdMsg'))
    } catch (e) {
      addToast('error', e.message || t('org.apiKeys.createError'))
    }
  }

  const handleRevokeKey = async (keyId) => {
    await apiRevokeOrgApiKey(currentOrgId, keyId)
    setApiKeys(prev => prev.filter(k => k.id !== keyId))
    addToast('success', t('org.apiKeys.revokedMsg'))
  }

  const handleSaveBranding = async (updates) => {
    const updated = await apiUpdateOrgBranding(currentOrgId, updates)
    setBranding(updated)
    addToast('success', t('org.branding.savedMsg'))
  }

  const styles = {
    page: { padding: '2rem', maxWidth: 900, margin: '0 auto', color: 'var(--text-primary)' },
    title: { fontSize: 22, fontWeight: 700, marginBottom: '1.5rem' },
    tabs: { display: 'flex', gap: 4, marginBottom: '1.5rem', borderBottom: '1px solid var(--border)' },
    tab: (active) => ({
      padding: '0.5rem 1rem', cursor: 'pointer', fontSize: 14, fontWeight: active ? 600 : 400,
      borderBottom: active ? '2px solid var(--accent-primary)' : '2px solid transparent',
      color: active ? 'var(--accent-primary)' : 'var(--text-secondary)', background: 'none', border: 'none',
    }),
    card: { background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '1.5rem', marginBottom: '1rem' },
    row: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 },
    input: { flex: 1, padding: '0.5rem 0.75rem', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 14 },
    btn: (variant = 'primary') => ({
      padding: '0.4rem 1rem', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500,
      background: variant === 'danger' ? 'var(--color-red-600)' : variant === 'secondary' ? 'var(--bg-hover)' : 'var(--accent-primary)',
      color: variant === 'secondary' ? 'var(--text-primary)' : '#fff',
    }),
    badge: (role) => ({
      padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600,
      background: role === 'owner'
        ? 'color-mix(in srgb, var(--color-violet-600) 15%, transparent)'
        : role === 'admin'
        ? 'color-mix(in srgb, var(--status-warning) 15%, transparent)'
        : 'color-mix(in srgb, var(--accent-secondary) 15%, transparent)',
      color: role === 'owner' ? 'var(--color-violet-600)' : role === 'admin' ? 'var(--status-warning)' : 'var(--accent-secondary)',
    }),
  }

  return (
    <div style={styles.page}>
      <div style={styles.title}>{t('org.title', { name: currentOrgName })}</div>
      <div style={styles.tabs}>
        {TABS.map((label, i) => (
          <button key={i} style={styles.tab(tab === i)} onClick={() => setTab(i)}>{label}</button>
        ))}
      </div>

      {tab === 0 && (
        <div style={styles.card}>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
            {t('org.general.orgId')} <strong>{currentOrgId}</strong><br />
            {t('org.general.orgName')} <strong>{currentOrgName}</strong>
          </p>
        </div>
      )}

      {tab === 1 && (
        <div>
          <div style={styles.card}>
            <div style={{ fontWeight: 600, marginBottom: 12 }}>{t('org.members.title', { count: members.length })}</div>
            {members.map(m => (
              <div key={m.username} style={styles.row}>
                <span style={{ flex: 1, fontSize: 14 }}>{m.username}</span>
                <span style={styles.badge(m.org_role)}>{ROLE_LABELS[m.org_role] || m.org_role}</span>
                {isAdmin && m.org_role !== 'owner' && (
                  <button style={styles.btn('danger')} onClick={() => handleRemoveMember(m.username)}>{t('org.members.removeBtn')}</button>
                )}
              </div>
            ))}
          </div>
          {isAdmin && (
            <div style={styles.card}>
              <div style={{ fontWeight: 600, marginBottom: 12 }}>{t('org.members.addTitle')}</div>
              <div style={styles.row}>
                <input style={styles.input} placeholder="username" value={newMember.username} onChange={e => setNewMember(p => ({ ...p, username: e.target.value }))} />
                <select style={styles.input} value={newMember.org_role} onChange={e => setNewMember(p => ({ ...p, org_role: e.target.value }))}>
                  <option value="viewer">{t('org.members.roles.viewer')}</option>
                  <option value="member">{t('org.members.roles.member')}</option>
                  <option value="admin">{t('org.members.roles.admin')}</option>
                </select>
                <button style={styles.btn()} onClick={handleAddMember}>{t('org.members.addBtn')}</button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 2 && branding && (
        <BrandingTab branding={branding} onSave={handleSaveBranding} styles={styles} t={t} />
      )}

      {tab === 3 && quota && (
        <div style={styles.card}>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>{t('org.quotas.title')}</div>
          {[
            [t('org.quotas.storage'), t('org.quotas.storageMbValue', { used: quota.used_storage_mb || 0, max: quota.max_storage_mb })],
            [t('org.quotas.sessions'), `${quota.used_sessions || 0} / ${quota.max_sessions}`],
            [t('org.quotas.apiCalls'), `${quota.used_api_calls_today || 0} / ${quota.max_api_calls_per_day}`],
          ].map(([label, value]) => (
            <div key={label} style={{ ...styles.row, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
              <span style={{ flex: 1, color: 'var(--text-secondary)', fontSize: 14 }}>{label}</span>
              <span style={{ fontWeight: 600 }}>{value}</span>
            </div>
          ))}
        </div>
      )}

      {tab === 4 && (
        <div>
          {rawKey && (
            <div style={{ ...styles.card, background: 'color-mix(in srgb, var(--status-success) 10%, transparent)', borderColor: 'var(--status-success)' }}>
              <div style={{ fontWeight: 600, color: 'var(--status-success)', marginBottom: 8 }}>{t('org.apiKeys.newKeyTitle')}</div>
              <code style={{ wordBreak: 'break-all', fontSize: 13 }}>{rawKey}</code>
              <button style={{ ...styles.btn('secondary'), marginTop: 8 }} onClick={() => setRawKey(null)}>{t('org.apiKeys.closeBtn')}</button>
            </div>
          )}
          <div style={styles.card}>
            <div style={{ fontWeight: 600, marginBottom: 12 }}>{t('org.apiKeys.title', { count: apiKeys.length })}</div>
            {apiKeys.map(k => (
              <div key={k.id} style={styles.row}>
                <span style={{ flex: 1, fontSize: 13, fontFamily: 'monospace' }}>{k.key_prefix}… — {k.name || t('org.apiKeys.unnamed')}</span>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{k.is_active ? t('org.apiKeys.active') : t('org.apiKeys.revoked')}</span>
                {k.is_active && <button style={styles.btn('danger')} onClick={() => handleRevokeKey(k.id)}>{t('org.apiKeys.revokeBtn')}</button>}
              </div>
            ))}
            <div style={{ ...styles.row, marginTop: 12 }}>
              <input style={styles.input} placeholder={t('org.apiKeys.namePlaceholder')} value={newKey.name} onChange={e => setNewKey({ name: e.target.value })} />
              <button style={styles.btn()} onClick={handleCreateKey}>{t('org.apiKeys.createBtn')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function BrandingTab({ branding, onSave, styles, t }) {
  const [form, setForm] = useState({ ...branding })
  const FIELDS = [
    ['app_name', t('org.branding.appName')],
    ['accent_color', t('org.branding.accentColor')],
    ['logo_url', t('org.branding.logoUrl')],
    ['favicon_url', t('org.branding.faviconUrl')],
  ]
  return (
    <div style={styles.card}>
      <div style={{ fontWeight: 600, marginBottom: 12 }}>{t('org.branding.title')}</div>
      {FIELDS.map(([key, label]) => (
        <div key={key} style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>{label}</label>
          <input style={styles.input} value={form[key] || ''} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} />
        </div>
      ))}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
        {form.accent_color && (
          <div style={{ width: 32, height: 32, borderRadius: 6, background: form.accent_color, border: '1px solid var(--border)' }} />
        )}
        <button style={styles.btn()} onClick={() => onSave({ app_name: form.app_name, accent_color: form.accent_color, logo_url: form.logo_url, favicon_url: form.favicon_url })}>
          {t('org.branding.saveBtn')}
        </button>
      </div>
    </div>
  )
}
