import React from 'react'

export class ShellRegionBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
    this.handleRetry = this.handleRetry.bind(this)
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error(`[ShellRegion] ${this.props.regionName} failed:`, error, info?.componentStack)
    this.props.onError?.(error, this.props.regionName)
  }

  handleRetry() {
    this.setState({ hasError: false, error: null })
  }

  render() {
    const { children, fallback, regionName } = this.props

    if (this.state.hasError) {
      return fallback ?? (
        <div
          className="shell-region-boundary-fallback"
          role="alert"
        >
          <strong>Раздел временно недоступен</strong>
          <button type="button" onClick={this.handleRetry}>
            Повторить
          </button>
        </div>
      )
    }

    return children
  }
}
