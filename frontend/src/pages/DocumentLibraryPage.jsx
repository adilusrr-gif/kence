import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import useOrgStore from '../shared/stores/orgStore'
import useLibraryStore from '../shared/stores/libraryStore'
import { useToastStore } from '../shared/stores/toastStore'
import { apiOpenLibraryDocInSession } from '../lib/api'
import { SkeletonGrid } from '../shared/ui/skeleton/Skeleton'

export default function DocumentLibraryPage() {
  const { t } = useTranslation()
  const nav = useNavigate()
  const { currentOrgId } = useOrgStore()
  const addToast = useToastStore(s => s.addToast)
  const { docs, loading, error, searchQuery, fetchLibrary, removeDoc, setSearch } = useLibraryStore()
  const [view, setView] = useState('grid')
  const [opening, setOpening] = useState(null)

  useEffect(() => {
    if (currentOrgId) fetchLibrary(currentOrgId)
  }, [currentOrgId])

  const filtered = docs.filter(d =>
    !searchQuery ||
    d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (d.description || '').toLowerCase().includes(searchQuery.toLowerCase())
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
    await removeDoc(currentOrgId, docId)
    addToast('success', t('library.deleteSuccess'))
  }

  const formatSize = (bytes) => {
    if (bytes < 1024) return t('library.sizeB', { n: bytes })
    if (bytes < 1024 * 1024) return t('library.sizeKB', { n: (bytes / 1024).toFixed(1) })
    return t('library.sizeMB', { n: (bytes / (1024 * 1024)).toFixed(1) })
  }

  if (!currentOrgId) {
    return <div style={{ padding: '2rem', color: 'var(--text-secondary)' }}>{t('library.noOrg')}</div>
  }

  return (
    <div className="library-page">
      <div className="library-header">
        <div className="library-title">{t('library.title')}</div>
        <div className="library-toolbar">
          <input
            className="library-search"
            placeholder={t('library.searchPlaceholder')}
            value={searchQuery}
            onChange={e => setSearch(e.target.value)}
          />
          <button
            className={`library-view-btn${view === 'grid' ? ' library-view-btn--active' : ''}`}
            onClick={() => setView('grid')}
          >
            {t('library.viewGrid')}
          </button>
          <button
            className={`library-view-btn${view === 'list' ? ' library-view-btn--active' : ''}`}
            onClick={() => setView('list')}
          >
            {t('library.viewList')}
          </button>
        </div>
      </div>

      {loading && <SkeletonGrid count={6} minWidth={240} />}
      {error  && <div style={{ color: 'var(--status-danger)' }}>{error}</div>}

      {!loading && filtered.length === 0 && (
        <div className="library-empty">
          <div className="library-empty__icon">📚</div>
          <div>{t('library.empty')}</div>
        </div>
      )}

      {view === 'grid' ? (
        <div className="library-grid">
          {filtered.map(doc => (
            <div key={doc.id} className="library-card">
              <div className="library-card__title">{doc.name}</div>
              <div className="library-card__meta">
                {formatSize(doc.file_size_bytes)} · {new Date(doc.created_at).toLocaleDateString()}
              </div>
              {doc.description && (
                <div className="library-card__desc">{doc.description}</div>
              )}
              {doc.tags?.length > 0 && (
                <div className="library-tags">
                  {doc.tags.map(tag => <span key={tag} className="library-tag">{tag}</span>)}
                </div>
              )}
              <div className="library-card__actions">
                <button
                  className="library-btn"
                  disabled={opening === doc.id}
                  onClick={() => handleOpen(doc.id)}
                >
                  {opening === doc.id ? t('library.opening') : t('library.open')}
                </button>
                <button
                  className="library-btn library-btn--danger"
                  onClick={() => handleDelete(doc.id, doc.name)}
                >
                  {t('library.delete')}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div>
          {filtered.map(doc => (
            <div key={doc.id} className="library-list-row">
              <span className="library-list-row__name">{doc.name}</span>
              <span className="library-list-row__meta">{formatSize(doc.file_size_bytes)}</span>
              <span className="library-list-row__meta">{new Date(doc.created_at).toLocaleDateString()}</span>
              <button className="library-btn" onClick={() => handleOpen(doc.id)}>{t('library.open')}</button>
              <button className="library-btn library-btn--danger" onClick={() => handleDelete(doc.id, doc.name)}>{t('library.delete')}</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
