import { Component, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { error: Error | null }

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <main className="shell">
        <section className="card errorBoundary">
          <div className="eyebrow">UNEXPECTED INTERFACE ERROR</div>
          <h2>KINAOU hit an error while drawing the interface</h2>
          <p>The interface stopped instead of showing a possibly wrong state. Your project data and media files were not changed by this error — projects live in browser storage and media stays on the KINAOU drive.</p>
          <div className="errorBox">{this.state.error.message}</div>
          <div className="directorActions">
            <button className="primary" onClick={() => this.setState({ error: null })}>Try again</button>
            <button className="secondaryButton" onClick={() => window.location.reload()}>Reload the app</button>
          </div>
        </section>
      </main>
    )
  }
}
