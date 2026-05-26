import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import useOrgStore from '../shared/stores/orgStore'
import {
  apiGetOrgMembers, apiAddOrgMember, apiRemoveOrgMember, apiChangeOrgMemberRole,
  apiGetOrgQuota, apiGetOrgApiKeys, apiCreateOrgApiKey, apiRevokeOrgApiKey,
  apiGetOrgBranding, apiUpdateOrgBranding, apiUpdateOrg,
} from '../lib/api'
import useToastStore from '../shared/stores/toastStore'

const TABS = ['Общие', 'Участники', 'Брендинг', 'Квоты', 'API-ключи']
const ROLE_LABELS = { owner: 'Владелец', admin: 'Администратор', member: 'Участник', viewer: 'Наблюдатель' }

export default function OrgSettingsPage({ currentUser }) {
  const nav = useNavigate()
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
    <div style={{ padding: '2rem', color: 'var(--text-secondary)' }}>Организация не выбрана</div>
  )

  const handleAddMember = async () => {
    if (!newMember.username.trim()) return
    try {
      const m = await apiAddOrgMember(currentOrgId, newMember)
      setMembers(prev => [...prev, m])
      setNewMember({ username: '', org_role: 'member' })
      addToast('success', `${newMember.username} добавлен`)
    } catch (e) {
      addToast('error', e.message || 'Ошибка добавления')
    }
  }

  const handleRemoveMember = async (username) => {
    if (!confirm(`Удалить ${username} из организации?`)) return
    await apiRemoveOrgMember(currentOrgId, username)
    setMembers(prev => prev.filter(m => m.username !== username))
    addToast('success', `${username} удалён`)
  }

  const handleCreateKey = async () => {
    try {
      const result = await apiCreateOrgApiKey(currentOrgId, newKey)
      setRawKey(result.raw_key)
      setApiKeys(prev => [...prev, result])
      addToast('success', 'API-ключ создан. Сохраните его — больше не показывается!')
    } catch (e) {
      addToast('error', e.message || 'Ошибка создания')
    }
  }

  const handleRevokeKey = async (keyId) => {
    await apiRevokeOrgApiKey(currentOrgId, keyId)
    setApiKeys(prev => prev.filter(k => k.id !== keyId))
    addToast('success', 'Ключ отозван')
  }

  const handleSaveBranding = async (updates) => {
    const updated = await apiUpdateOrgBranding(currentOrgId, updates)
    setBranding(updated)
    addToast('success', 'Брендинг обновлён')
  }

  const styles = {
    page: { padding: '2rem', maxWidth: 900, margin: '0 auto', color: 'var(--text-primary)' },
    title: { fontSize: 22, fontWeight: 700, marginBottom: '1.5rem' },
    tabs: { display: 'flex', gap: 4, marginBottom: '1.5rem', borderBottom: '1px solid var(--border)' },
    tab: (active) => ({
      padding: '0.5rem 1rem', cursor: 'pointer', fontSize: 14, fontWeight: active ? 600 : 400,
      borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
      color: active ? 'var(--accent)' : 'var(--text-secondary)', background: 'none', border: 'none',
    }),
    card: { background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '1.5rem', marginBottom: '1rem' },
    row: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 },
    input: { flex: 1, padding: '0.5rem 0.75rem', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 14 },
    btn: (variant = 'primary') => ({
      padding: '0.4rem 1rem', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500,
      background: variant === 'danger' ? '#ef4444' : variant === 'secondary' ? 'var(--bg-hover)' : 'var(--accent)',
      color: variant === 'secondary' ? 'var(--text-primary)' : '#fff',
    }),
    badge: (role) => ({
      padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600,
      background: role === 'owner' ? '#7c3aed22' : role === 'admin' ? '#f59e0b22' : '#3b82f622',
      color: role === 'owner' ? '#7c3aed' : role === 'admin' ? '#f59e0b' : '#3b82f6',
    }),
  }

  return (
    <div style={styles.page}>
      <div style={styles.title}>Настройки организации — {currentOrgName}</div>
      <div style={styles.tabs}>
        {TABS.map((t, i) => (
          <button key={i} style={styles.tab(tab === i)} onClick={() => setTab(i)}>{t}</button>
        ))}
      </div>

      {/* General */}
      {tab === 0 && (
        <div style={styles.card}>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
            ID организации: <strong>{currentOrgId}</strong><br />
            Название: <strong>{currentOrgName}</strong>
          </p>
        </div>
      )}

      {/* Members */}
      {tab === 1 && (
        <div>
          <div style={styles.card}>
            <div style={{ fontWeight: 600, marginBottom: 12 }}>Участники ({members.length})</div>
            {members.map(m => (
              <div key={m.username} style={styles.row}>
                <span style={{ flex: 1, fontSize: 14 }}>{m.username}</span>
                <span style={styles.badge(m.org_role)}>{ROLE_LABELS[m.org_role]}</span>
                {isAdmin && m.org_role !== 'owner' && (
                  <button style={styles.btn('danger')} onClick={() => handleRemoveMember(m.username)}>Удалить</button>
                )}
              </div>
            ))}
          </div>
          {isAdmin && (
            <div style={styles.card}>
              <div style={{ fontWeight: 600, marginBottom: 12 }}>Добавить участника</div>
              <div style={styles.row}>
                <input style={styles.input} placeholder="username" value={newMember.username} onChange={e => setNewMember(p => ({ ...p, username: e.target.value }))} />
                <select style={styles.input} value={newMember.org_role} onChange={e => setNewMember(p => ({ ...p, org_role: e.target.value }))}>
                  <option value="viewer">Наблюдатель</option>
                  <option value="member">Участник</option>
                  <option value="admin">Администратор</option>
                </select>
                <button style={styles.btn()} onClick={handleAddMember}>Добавить</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Branding */}
      {tab === 2 && branding && (
        <BrandingTab branding={branding} onSave={handleSaveBranding} styles={styles} />
      )}

      {/* Quotas */}
      {tab === 3 && quota && (
        <div style={styles.card}>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>Квоты организации</div>
          {[
            ['Хранилище', `${quota.used_storage_mb || 0} / ${quota.max_storage_mb} МБ`],
            ['Сессии', `${quota.used_sessions || 0} / ${quota.max_sessions}`],
            ['API-вызовов сегодня', `${quota.used_api_calls_today || 0} / ${quota.max_api_calls_per_day}`],
          ].map(([label, value]) => (
            <div key={label} style={{ ...styles.row, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
              <span style={{ flex: 1, color: 'var(--text-secondary)', fontSize: 14 }}>{label}</span>
              <span style={{ fontWeight: 600 }}>{value}</span>
            </div>
          ))}
        </div>
      )}

      {/* API Keys */}
      {tab === 4 && (
        <div>
          {rawKey && (
            <div style={{ ...styles.card, background: '#22c55e15', borderColor: '#22c55e' }}>
              <div style={{ fontWeight: 600, color: '#22c55e', marginBottom: 8 }}>Новый API-ключ — сохраните сейчас!</div>
              <code style={{ wordBreak: 'break-all', fontSize: 13 }}>{rawKey}</code>
              <button style={{ ...styles.btn('secondary'), marginTop: 8 }} onClick={() => setRawKey(null)}>Закрыть</button>
            </div>
          )}
          <div style={styles.card}>
            <div style={{ fontWeight: 600, marginBottom: 12 }}>API-ключи ({apiKeys.length})</div>
            {apiKeys.map(k => (
              <div key={k.id} style={styles.row}>
                <span style={{ flex: 1, fontSize: 13, fontFamily: 'monospace' }}>{k.key_prefix}… — {k.name || '(без имени)'}</span>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{k.is_active ? 'Активен' : 'Отозван'}</span>
                {k.is_active && <button style={styles.btn('danger')} onClick={() => handleRevokeKey(k.id)}>Отозвать</button>}
              </div>
            ))}
            <div style={{ ...styles.row, marginTop: 12 }}>
              <input style={styles.input} placeholder="Название ключа" value={newKey.name} onChange={e => setNewKey({ name: e.target.value })} />
              <button style={styles.btn()} onClick={handleCreateKey}>Создать</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function BrandingTab({ branding, onSave, styles }) {
  const [form, setForm] = useState({ ...branding })
  return (
    <div style={styles.card}>
      <div style={{ fontWeight: 600, marginBottom: 12 }}>Брендинг организации</div>
      {[
        ['app_name', 'Название приложения'],
        ['accent_color', 'Акцентный цвет (HEX)'],
        ['logo_url', 'URL логотипа'],
        ['favicon_url', 'URL favicon'],
      ].map(([key, label]) => (
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
          Сохранить
        </button>
      </div>
    </div>
  )
}
