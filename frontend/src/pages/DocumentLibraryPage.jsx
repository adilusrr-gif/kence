import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import useOrgStore from '../shared/stores/orgStore'
import useLibraryStore from '../shared/stores/libraryStore'
import useToastStore from '../shared/stores/toastStore'
import { apiOpenLibraryDocInSession } from '../lib/api'

export default function DocumentLibraryPage({ currentUser }) {
  const nav = useNavigate()
  const { currentOrgId } = useOrgStore()
  const addToast = useToastStore(s => s.addToast)
  const { docs, loading, error, searchQuery, fetchLibrary, removeDoc, setSearch } = useLibraryStore()
  const [view, setView] = useState('grid') // grid | list
  const [opening, setOpening] = useState(null)

  useEffect(() => {
    if (currentOrgId) fetchLibrary(currentOrgId)
  }, [currentOrgId])

  const filtered = docs.filter(d =>
    !searchQuery || d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (d.description || '').toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleOpen = async (docId) => {
    setOpening(docId)
    try {
      const { session_id, document_name } = await apiOpenLibraryDocInSession(currentOrgId, docId)
      localStorage.setItem('docai_session', session_id)
      localStorage.setItem('docai_docname', document_name)
      nav('/workspace')
    } catch (e) {
      addToast('error', 'Ошибка открытия документа')
    } finally {
      setOpening(null)
    }
  }

  const handleDelete = async (docId, name) => {
    if (!confirm(`Удалить "${name}" из библиотеки?`)) return
    await removeDoc(currentOrgId, docId)
    addToast('success', 'Документ удалён из библиотеки')
  }

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} Б`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`
    return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`
  }

  const s = {
    page: { padding: '2rem', maxWidth: 1100, margin: '0 auto', color: 'var(--text-primary)' },
    header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' },
    title: { fontSize: 22, fontWeight: 700 },
    toolbar: { display: 'flex', gap: 8, alignItems: 'center' },
    searchInput: { padding: '0.5rem 0.75rem', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 14, width: 220 },
    viewBtn: (active) => ({ padding: '0.4rem 0.75rem', background: active ? 'var(--accent)' : 'var(--bg-hover)', border: 'none', borderRadius: 6, cursor: 'pointer', color: active ? '#fff' : 'var(--text-primary)', fontSize: 13 }),
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 },
    card: { background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '1rem', cursor: 'pointer', transition: 'border-color 0.2s' },
    cardTitle: { fontWeight: 600, fontSize: 14, marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
    cardMeta: { fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8 },
    tags: { display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 },
    tag: { padding: '1px 6px', background: 'var(--accent)22', color: 'var(--accent)', borderRadius: 8, fontSize: 10, fontWeight: 500 },
    cardActions: { display: 'flex', gap: 6, marginTop: 8 },
    btn: (v = 'primary') => ({ padding: '0.3rem 0.75rem', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500, background: v === 'danger' ? '#ef444422' : 'var(--accent)22', color: v === 'danger' ? '#ef4444' : 'var(--accent)' }),
    listRow: { display: 'flex', alignItems: 'center', gap: 12, padding: '0.75rem 1rem', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 6 },
  }

  if (!currentOrgId) return <div style={{ padding: '2rem', color: 'var(--text-secondary)' }}>Выберите организацию</div>

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div style={s.title}>Библиотека документов</div>
        <div style={s.toolbar}>
          <input
            style={s.searchInput}
            placeholder="Поиск..."
            value={searchQuery}
            onChange={e => setSearch(e.target.value)}
          />
          <button style={s.viewBtn(view === 'grid')} onClick={() => setView('grid')}>Сетка</button>
          <button style={s.viewBtn(view === 'list')} onClick={() => setView('list')}>Список</button>
        </div>
      </div>

      {loading && <div style={{ color: 'var(--text-secondary)' }}>Загрузка...</div>}
      {error && <div style={{ color: '#ef4444' }}>{error}</div>}
      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📚</div>
          <div>Библиотека пуста. Загрузите документы и добавьте их из рабочего пространства.</div>
        </div>
      )}

      {view === 'grid' ? (
        <div style={s.grid}>
          {filtered.map(doc => (
            <div key={doc.id} style={s.card}>
              <div style={s.cardTitle}>{doc.name}</div>
              <div style={s.cardMeta}>{formatSize(doc.file_size_bytes)} · {new Date(doc.created_at).toLocaleDateString()}</div>
              {doc.description && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>{doc.description}</div>}
              {doc.tags?.length > 0 && (
                <div style={s.tags}>{doc.tags.map(t => <span key={t} style={s.tag}>{t}</span>)}</div>
              )}
              <div style={s.cardActions}>
                <button style={s.btn()} disabled={opening === doc.id} onClick={() => handleOpen(doc.id)}>
                  {opening === doc.id ? '...' : 'Открыть'}
                </button>
                <button style={s.btn('danger')} onClick={() => handleDelete(doc.id, doc.name)}>Удалить</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div>
          {filtered.map(doc => (
            <div key={doc.id} style={s.listRow}>
              <span style={{ flex: 1, fontWeight: 500, fontSize: 14 }}>{doc.name}</span>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{formatSize(doc.file_size_bytes)}</span>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{new Date(doc.created_at).toLocaleDateString()}</span>
              <button style={s.btn()} onClick={() => handleOpen(doc.id)}>Открыть</button>
              <button style={s.btn('danger')} onClick={() => handleDelete(doc.id, doc.name)}>Удалить</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
