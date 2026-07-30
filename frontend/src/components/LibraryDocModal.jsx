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
  width: 'min(560px, 96vw)', maxHeight: '90vh', overflowY: 'auto',
  background: 'var(--bg-surface, #131a2b)', border: '1px solid var(--border)',
  borderRadius: 14, boxShadow: '0 24px 64px rgba(2,6,23,0.8)',
  padding: '1.4rem 1.5rem',
}
const label = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', margin: '0.85rem 0 0.3rem' }
const field = {
  width: '100%', boxSizing: 'border-box', padding: '0.55rem 0.7rem',
  background: 'var(--bg-input, #1a2235)', border: '1px solid var(--border)',
  borderRadius: 8, color: 'var(--text-primary)', fontSize: 13.5,
}

// Select for an admin dictionary (direction | issuer) with inline "add new".
function TaxonomySelect({ kind, value, options, orgId, onChange, t }) {
  const addTaxonomy = useLibraryStore(s => s.addTaxonomy)
  const addToast = useToastStore(s => s.addToast)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    const v = draft.trim()
    if (!v) return
    setBusy(true)
    try {
      const row = await addTaxonomy(orgId, kind, v)
      onChange(row.value)
      setDraft('')
      setAdding(false)
    } catch (e) {
      addToast('error', e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      {!adding ? (
        <div style={{ display: 'flex', gap: 6 }}>
          <select style={{ ...field, flex: 1 }} value={value} onChange={e => onChange(e.target.value)}>
            <option value="">{t('library.notSet')}</option>
            {options.map(o => <option key={o.id} value={o.value}>{o.value}</option>)}
          </select>
          <button type="button" className="library-btn" onClick={() => setAdding(true)} title={t('library.addNew')}>＋</button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            style={{ ...field, flex: 1 }} autoFocus value={draft}
            placeholder={t('library.addNew')}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit() } }}
          />
          <button type="button" className="library-btn" disabled={busy} onClick={submit}>✓</button>
          <button type="button" className="library-btn" onClick={() => { setAdding(false); setDraft('') }}>✕</button>
        </div>
      )}
    </div>
  )
}

export default function LibraryDocModal({ mode, doc, orgId, taxonomy, sessionId, onClose }) {
  const { t } = useTranslation()
  const addToast = useToastStore(s => s.addToast)
  const uploadDoc = useLibraryStore(s => s.uploadDoc)
  const updateDoc = useLibraryStore(s => s.updateDoc)
  const addDoc = useLibraryStore(s => s.addDoc)

  const isEdit = mode === 'edit'
  const isSession = mode === 'session'   // register the current workspace session
  const [file, setFile] = useState(null)
  const [form, setForm] = useState({
    name: doc?.name || '',
    description: doc?.description || '',
    doc_kind: doc?.doc_kind || 'document',
    direction: doc?.direction || '',
    issuer: doc?.issuer || '',
    doc_number: doc?.doc_number || '',
    doc_date: doc?.doc_date || '',
    tags: (doc?.tags || []).join(', '),
  })
  const [saving, setSaving] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) { addToast('error', t('library.nameRequired')); return }
    if (mode === 'upload' && !file) { addToast('error', t('library.fileRequired')); return }
    if (isSession && !sessionId) { addToast('error', t('library.noSession')); return }
    setSaving(true)
    try {
      if (isSession) {
        await addDoc(orgId, {
          session_id: sessionId,
          name: form.name.trim(),
          description: form.description || null,
          doc_kind: form.doc_kind,
          direction: form.direction || null,
          issuer: form.issuer || null,
          doc_number: form.doc_number || null,
          doc_date: form.doc_date || null,
          tags: form.tags ? form.tags.split(',').map(s => s.trim()).filter(Boolean) : null,
        })
        addToast('success', t('library.addSuccess'))
      } else if (isEdit) {
        await updateDoc(orgId, doc.id, {
          name: form.name.trim(),
          description: form.description,
          doc_kind: form.doc_kind,
          direction: form.direction,
          issuer: form.issuer,
          doc_number: form.doc_number,
          doc_date: form.doc_date,
          tags: form.tags ? form.tags.split(',').map(s => s.trim()).filter(Boolean) : [],
        })
        addToast('success', t('library.saveSuccess'))
      } else {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('name', form.name.trim())
        fd.append('description', form.description || '')
        fd.append('doc_kind', form.doc_kind)
        if (form.direction) fd.append('direction', form.direction)
        if (form.issuer) fd.append('issuer', form.issuer)
        if (form.doc_number) fd.append('doc_number', form.doc_number)
        if (form.doc_date) fd.append('doc_date', form.doc_date)
        if (form.tags) fd.append('tags', form.tags)
        await uploadDoc(orgId, fd)
        addToast('success', t('library.uploadSuccess'))
      }
      onClose()
    } catch (err) {
      addToast('error', err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={overlay} onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <form style={panel} onSubmit={handleSubmit}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
          {isEdit ? t('library.editTitle') : isSession ? t('library.addSessionTitle') : t('library.uploadTitle')}
        </div>

        {!isEdit && (
          <>
            <label style={label}>{t('library.fileLabel')} *</label>
            <input type="file" style={field} onChange={e => setFile(e.target.files?.[0] || null)} />
            {file && <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 4 }}>{file.name}</div>}
          </>
        )}

        <label style={label}>{t('library.nameLabel')} *</label>
        <input style={field} value={form.name} onChange={e => set('name', e.target.value)} />

        <label style={label}>{t('library.kindLabel')}</label>
        <select style={field} value={form.doc_kind} onChange={e => set('doc_kind', e.target.value)}>
          <option value="document">{t('library.kindDocument')}</option>
          <option value="npa">{t('library.kindNpa')}</option>
        </select>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={label}>{t('library.directionLabel')}</label>
            <TaxonomySelect kind="direction" value={form.direction} options={taxonomy.direction}
              orgId={orgId} onChange={v => set('direction', v)} t={t} />
          </div>
          <div>
            <label style={label}>{t('library.issuerLabel')}</label>
            <TaxonomySelect kind="issuer" value={form.issuer} options={taxonomy.issuer}
              orgId={orgId} onChange={v => set('issuer', v)} t={t} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={label}>{t('library.docNumberLabel')}</label>
            <input style={field} value={form.doc_number} onChange={e => set('doc_number', e.target.value)} />
          </div>
          <div>
            <label style={label}>{t('library.docDateLabel')}</label>
            <input style={field} type="date" value={form.doc_date} onChange={e => set('doc_date', e.target.value)} />
          </div>
        </div>

        <label style={label}>{t('library.descriptionLabel')}</label>
        <textarea style={{ ...field, minHeight: 70, resize: 'vertical' }} value={form.description} onChange={e => set('description', e.target.value)} />

        <label style={label}>{t('library.tagsLabel')}</label>
        <input style={field} value={form.tags} placeholder={t('library.tagsPlaceholder')} onChange={e => set('tags', e.target.value)} />

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: '1.3rem' }}>
          <button type="button" className="library-btn" onClick={onClose}>{t('library.cancel')}</button>
          <button type="submit" className="library-view-btn" disabled={saving}>
            {saving ? t('library.saving') : (isEdit ? t('library.save') : isSession ? t('library.add') : t('library.upload'))}
          </button>
        </div>
      </form>
    </div>
  )
}
