import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import useOrgStore from '../shared/stores/orgStore'
import useLibraryStore from '../shared/stores/libraryStore'
import { useToastStore } from '../shared/stores/toastStore'
import { apiOpenLibraryDocInSession, apiGetOrgMembers } from '../lib/api'
import { getStoredUser } from '../lib/http.js'
import { SkeletonGrid } from '../shared/ui/skeleton/Skeleton'
import LibraryDocModal from '../components/LibraryDocModal'
import LibraryTaxonomyModal from '../components/LibraryTaxonomyModal'

export default function DocumentLibraryPage() {
  const { t } = useTranslation()
  const nav = useNavigate()
  const { currentOrgId } = useOrgStore()
  const addToast = useToastStore(s => s.addToast)
  const {
    docs, loading, error, searchQuery, docKind, direction, issuer, taxonomy,
    fetchLibrary, fetchTaxonomy, removeDoc, setSearch, setDocKind, setDirection, setIssuer,
  } = useLibraryStore()
  const [opening, setOpening] = useState(null)
  const [isAdmin, setIsAdmin] = useState(getStoredUser()?.role === 'admin')
  const [modal, setModal] = useState(null)       // { mode:'upload'|'edit', doc }
  const [taxModal, setTaxModal] = useState(false)

  // Resolve org-level admin (owner/admin) in addition to the global admin role.
  useEffect(() => {
    if (!currentOrgId || isAdmin) return
    const me = getStoredUser()?.username
    apiGetOrgMembers(currentOrgId)
      .then(members => {
        const m = members.find(x => x.username === me)
        if (m && ['owner', 'admin'].includes(m.org_role)) setIsAdmin(true)
      })
      .catch(() => {})
  }, [currentOrgId])

  useEffect(() => {
    if (currentOrgId) { fetchLibrary(currentOrgId); fetchTaxonomy(currentOrgId) }
  }, [currentOrgId])

  // Server-side filters (kind/direction/issuer) trigger refetch.
  useEffect(() => {
    if (currentOrgId) fetchLibrary(currentOrgId)
  }, [docKind, direction, issuer])

  const filtered = docs.filter(d =>
    !searchQuery ||
    d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (d.description || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (d.doc_number || '').toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleOpen = async (docId) => {
    setOpening(docId)
    try {
      const { session_id, document_name } = await apiOpenLibraryDocInSession(currentOrgId, docId)
      localStorage.setItem('docai_session', session_id)
      localStorage.setItem('docai_docname', document_name)
      nav('/workspace')
    } catch {
      addToast('error', t('library.openError'))
    } finally {
      setOpening(null)
    }
  }

  const handleDelete = async (docId, name) => {
    if (!confirm(t('library.confirmDelete', { name }))) return
    try {
      await removeDoc(currentOrgId, docId)
      addToast('success', t('library.deleteSuccess'))
    } catch (e) {
      addToast('error', e.message)
    }
  }

  const formatSize = (bytes) => {
    if (bytes < 1024) return t('library.sizeB', { n: bytes })
    if (bytes < 1024 * 1024) return t('library.sizeKB', { n: (bytes / 1024).toFixed(1) })
    return t('library.sizeMB', { n: (bytes / (1024 * 1024)).toFixed(1) })
  }

  if (!currentOrgId) {
    return <div style={{ padding: '2rem', color: 'var(--text-secondary)' }}>{t('library.noOrg')}</div>
  }

  const tabs = [
    { key: '', label: t('library.kindAll') },
    { key: 'document', label: t('library.kindDocument') },
    { key: 'npa', label: t('library.kindNpa') },
  ]

  const selStyle = {
    padding: '0.45rem 0.6rem', background: 'var(--bg-input, #1a2235)', border: '1px solid var(--border)',
    borderRadius: 6, color: 'var(--text-primary)', fontSize: 13,
  }

  return (
    <div className="library-page">
      <div className="library-header">
        <div className="library-title">{t('library.title')}</div>
        <div className="library-toolbar" style={{ gap: 8, flexWrap: 'wrap' }}>
          <input
            className="library-search"
            placeholder={t('library.searchPlaceholder')}
            value={searchQuery}
            onChange={e => setSearch(e.target.value)}
          />
          <select style={selStyle} value={direction} onChange={e => setDirection(e.target.value)}>
            <option value="">{t('library.allDirections')}</option>
            {taxonomy.direction.map(d => <option key={d.id} value={d.value}>{d.value}</option>)}
          </select>
          <select style={selStyle} value={issuer} onChange={e => setIssuer(e.target.value)}>
            <option value="">{t('library.allIssuers')}</option>
            {taxonomy.issuer.map(i => <option key={i.id} value={i.value}>{i.value}</option>)}
          </select>
          {isAdmin && (
            <>
              <button className="library-view-btn" onClick={() => setModal({ mode: 'upload', doc: null })}>
                + {t('library.uploadBtn')}
              </button>
              <button className="library-view-btn" onClick={() => setTaxModal(true)}>
                {t('library.manageDicts')}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Kind tabs */}
      <div style={{ display: 'flex', gap: 4, margin: '0.5rem 0 1rem' }}>
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setDocKind(tab.key)}
            style={{
              padding: '0.4rem 0.9rem', borderRadius: 6, fontSize: 13, cursor: 'pointer',
              border: '1px solid var(--border)',
              background: docKind === tab.key ? 'var(--accent-primary)' : 'transparent',
              color: docKind === tab.key ? '#fff' : 'var(--text-secondary)',
              fontWeight: docKind === tab.key ? 600 : 400,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading && <SkeletonGrid count={6} minWidth={240} />}
      {error  && <div style={{ color: 'var(--status-danger)' }}>{error}</div>}

      {!loading && filtered.length === 0 && (
        <div className="library-empty">
          <div className="library-empty__icon">📚</div>
          <div>{t('library.empty')}</div>
        </div>
      )}

      <div className="library-grid">
        {filtered.map(doc => (
          <div key={doc.id} className="library-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              {doc.doc_kind === 'npa' && (
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                  background: 'color-mix(in srgb, var(--status-danger) 18%, transparent)',
                  color: 'var(--status-danger)', textTransform: 'uppercase', letterSpacing: '0.04em',
                }}>
                  {t('library.kindNpa')}
                </span>
              )}
            </div>
            <div className="library-card__title">{doc.name}</div>
            <div className="library-card__meta">
              {formatSize(doc.file_size_bytes)} · {new Date(doc.created_at).toLocaleDateString()}
            </div>
            {(doc.direction || doc.issuer) && (
              <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 4, lineHeight: 1.5 }}>
                {doc.direction && <div>📂 {doc.direction}</div>}
                {doc.issuer && <div>🏛 {doc.issuer}</div>}
                {doc.doc_number && <div>№ {doc.doc_number}{doc.doc_date ? ` · ${doc.doc_date}` : ''}</div>}
              </div>
            )}
            {doc.description && (
              <div className="library-card__desc">{doc.description}</div>
            )}
            {doc.tags?.length > 0 && (
              <div className="library-tags">
                {doc.tags.map(tag => <span key={tag} className="library-tag">{tag}</span>)}
              </div>
            )}
            <div className="library-card__actions">
              <button className="library-btn" disabled={opening === doc.id} onClick={() => handleOpen(doc.id)}>
                {opening === doc.id ? t('library.opening') : t('library.open')}
              </button>
              {isAdmin && (
                <button className="library-btn" onClick={() => setModal({ mode: 'edit', doc })}>
                  {t('library.edit')}
                </button>
              )}
              <button className="library-btn library-btn--danger" onClick={() => handleDelete(doc.id, doc.name)}>
                {t('library.delete')}
              </button>
            </div>
          </div>
        ))}
      </div>

      {modal && (
        <LibraryDocModal
          mode={modal.mode}
          doc={modal.doc}
          orgId={currentOrgId}
          taxonomy={taxonomy}
          onClose={() => setModal(null)}
        />
      )}
      {taxModal && (
        <LibraryTaxonomyModal orgId={currentOrgId} onClose={() => setTaxModal(false)} />
      )}
    </div>
  )
}
