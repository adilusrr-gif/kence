import { useState, useRef, useEffect } from 'react'
import useOrgStore from '../../shared/stores/orgStore'

export default function OrgSwitcher({ collapsed }) {
  const { currentOrgId, currentOrgName, orgs, switchOrg } = useOrgStore()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  if (!currentOrgId || orgs.length === 0) return null

  const s = {
    wrapper: { position: 'relative', margin: '0 8px 8px', userSelect: 'none' },
    trigger: { display: 'flex', alignItems: 'center', gap: 8, padding: collapsed ? '6px' : '6px 10px', background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', width: '100%', boxSizing: 'border-box', justifyContent: collapsed ? 'center' : 'flex-start' },
    orgIcon: { width: 22, height: 22, borderRadius: 6, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0 },
    orgName: { fontSize: 12, fontWeight: 600, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-primary)' },
    chevron: { fontSize: 10, color: 'var(--text-secondary)', transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none' },
    dropdown: { position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, zIndex: 1000, overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.3)' },
    option: (active) => ({ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', cursor: 'pointer', background: active ? 'var(--accent)22' : 'transparent', fontSize: 13 }),
    optionIcon: (name) => ({ width: 22, height: 22, borderRadius: 6, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0 }),
  }

  return (
    <div style={s.wrapper} ref={ref}>
      <div style={s.trigger} onClick={() => setOpen(p => !p)}>
        <div style={s.orgIcon}>{(currentOrgName || 'O')[0].toUpperCase()}</div>
        {!collapsed && <>
          <span style={s.orgName}>{currentOrgName}</span>
          {orgs.length > 1 && <span style={s.chevron}>▼</span>}
        </>}
      </div>
      {open && orgs.length > 1 && (
        <div style={s.dropdown}>
          {orgs.map(org => (
            <div
              key={org.id}
              style={s.option(org.id === currentOrgId)}
              onClick={() => { switchOrg(org); setOpen(false) }}
            >
              <div style={s.optionIcon(org.display_name)}>{org.display_name[0].toUpperCase()}</div>
              <span>{org.display_name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
