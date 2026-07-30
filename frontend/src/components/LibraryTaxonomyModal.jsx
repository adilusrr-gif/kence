import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import useLibraryStore from '../shared/stores/libraryStore'
import { useToastStore } from '../shared/stores/toastStore'

const overlay = {
  position: 'fixed', inset: 0, background: 'var(--surface-scrim, rgba(2,6,23,0.6))',
  backdropFilter: 'blur(4px)', zIndex: 1200, display: 'flex',
  alignItems: 'center', justifyContent: 'center', padding: '1rem',
}
const panel = {
  width: 'min(540px, 96vw)', maxHeight: '90vh', overflowY: 'auto',
  background: 'var(--bg-surface, #131a2b)', border: '1px solid var(--border)',
  borderRadius: 14, boxShadow: '0 24px 64px rgba(2,6,23,0.8)', padding: '1.4rem 1.5rem',
}
const field = {
  flex: 1, boxSizing: 'border-box', padding: '0.5rem 0.7rem',
  background: 'var(--bg-input, #1a2235)', border: '1px solid var(--border)',
  borderRadius: 8, color: 'var(--text-primary)', fontSize: 13.5,
}

function TaxonomyColumn({ kind, title, orgId, t }) {
  const items = useLibraryStore(s => s.taxonomy[kind] || [])
  const addTaxonomy = useLibraryStore(s => s.addTaxonomy)
  const removeTaxonomy = useLibraryStore(s => s.removeTaxonomy)
  const addToast = useToastStore(s => s.addToast)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)

  const add = async () => {
    const v = draft.trim()
    if (!v) return
    setBusy(true)
    try {
      await addTaxonomy(orgId, kind, v)
      setDraft('')
    } catch (e) {
      addToast('error', e.message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id) => {
    try {
      await removeTaxonomy(orgId, kind, id)
    } catch (e) {
      addToast('error', e.message)
    }
  }

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{title}</div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <input
          style={field} value={draft} placeholder={t('library.addNew')}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
        />
        <button type="button" className="library-view-btn" disabled={busy} onClick={add}>＋</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {items.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>{t('library.dictEmpty')}</div>
        )}
        {items.map(it => (
          <div key={it.id} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
            padding: '0.4rem 0.6rem', background: 'var(--bg-input, #1a2235)',
            border: '1px solid var(--border)', borderRadius: 6, fontSize: 13,
          }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.value}</span>
            <button type="button" className="library-btn library-btn--danger" onClick={() => remove(it.id)}>✕</button>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function LibraryTaxonomyModal({ orgId, onClose }) {
  const { t } = useTranslation()
  return (
    <div style={overlay} onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={panel}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{t('library.manageDicts')}</div>
          <button type="button" className="library-btn" onClick={onClose}>✕</button>
        </div>
        <div style={{ display: 'flex', gap: 18 }}>
          <TaxonomyColumn kind="direction" title={t('library.directionLabel')} orgId={orgId} t={t} />
          <TaxonomyColumn kind="issuer" title={t('library.issuerLabel')} orgId={orgId} t={t} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
          <button type="button" className="library-view-btn" onClick={onClose}>{t('library.done')}</button>
        </div>
      </div>
    </div>
  )
}
