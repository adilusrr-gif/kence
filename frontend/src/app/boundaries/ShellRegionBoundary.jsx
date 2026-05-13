import React from 'react'

export class ShellRegionBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error) {
    if (import.meta.env.DEV) {
      // Keep region failures isolated during shell coexistence rollout.
      console.error(`Shell region failed: ${this.props.regionName}`, error)
    }
  }

  render() {
    const { children, fallback, regionName } = this.props

    if (this.state.hasError) {
      return fallback ?? (
        <div
          className="shell-region-boundary-fallback"
          role="status"
          aria-live="polite"
          data-shell-region={regionName}
        >
          <strong>Region unavailable</strong>
          <span>{regionName}</span>
        </div>
      )
    }

    return children
  }
}

