import React from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          minHeight: 280,
          gap: 16,
          padding: '2rem',
          textAlign: 'center',
          color: 'var(--text-secondary)',
        }}>
          <AlertTriangle size={40} style={{ color: 'var(--status-warning)', opacity: 0.8 }} />
          <div>
            <p style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
              Что-то пошло не так
            </p>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', maxWidth: 340, lineHeight: 1.5 }}>
              {this.state.error.message || 'Произошла непредвиденная ошибка. Попробуйте перезагрузить страницу.'}
            </p>
          </div>
          <button
            onClick={() => { this.setState({ error: null }); window.location.reload() }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '0.55rem 1.25rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-default)',
              background: 'var(--bg-surface-1)',
              color: 'var(--text-primary)',
              fontSize: '0.85rem',
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <RefreshCw size={14} />
            Перезагрузить страницу
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
