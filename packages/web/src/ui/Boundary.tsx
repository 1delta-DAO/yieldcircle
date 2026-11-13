import React from 'react'

/**
 * A render error stays where it happened (tickets/0022 A3): one record that throws blanked the
 * page for everyone who loaded it. Around a page, `fallback` says so and the nav still works; around
 * a feed or thread card it is `null`, so the bad row is skipped, not the feed. `reset`: a change
 * (the route) tries the children again.
 */
export class Boundary extends React.Component<{ children: React.ReactNode; fallback?: React.ReactNode; reset?: unknown; name?: string }, { failed: boolean; at: unknown }> {
  state = { failed: false, at: this.props.reset }
  static getDerivedStateFromProps(p: { reset?: unknown }, s: { failed: boolean; at: unknown }) {
    return p.reset !== s.at ? { failed: false, at: p.reset } : null
  }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(e: unknown) {
    console.error(`[${this.props.name ?? 'boundary'}] render failed`, e)
  }
  render() {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children
  }
}

/** The page-level fallback: the shell around it still renders, so the reader can go elsewhere. */
export const PageError = () => (
  <div className="empty">
    This page hit something it could not show. <a className="pri" href="#/">Go home</a> or <a className="pri" href="" onClick={() => location.reload()}>reload</a>.
  </div>
)
