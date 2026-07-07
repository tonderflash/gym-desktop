// Última línea de defensa del renderer: un crash de render en cualquier
// componente NO deja la ventana en blanco silenciosa — muestra qué pasó,
// lo reporta al errors.log del main, y ofrece recargar sin reiniciar la app.
import { Component, type ReactNode } from 'react'
import { reportRendererError } from '../../report-error'

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }): void {
    reportRendererError('react:render', `${error.message}\n${info.componentStack ?? error.stack ?? ''}`)
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#0d3238', color: '#f4f6f8', fontFamily: 'ui-monospace, monospace', padding: 24,
      }}>
        <div style={{ maxWidth: 520 }}>
          <h1 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Algo se rompió en la interfaz</h1>
          <p style={{ fontSize: 13, opacity: 0.8, marginBottom: 6 }}>
            El error quedó registrado en errors.log (carpeta de datos de GymBar).
            Tus datos no se tocaron — esto es solo la vista.
          </p>
          <pre style={{
            fontSize: 11, background: 'rgba(0,0,0,.35)', padding: 12, borderRadius: 8,
            overflow: 'auto', maxHeight: 160, marginBottom: 14,
          }}>{this.state.error.message}</pre>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: '#c6ff00', color: '#000', border: 'none', padding: '10px 18px',
              fontWeight: 800, borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Recargar interfaz
          </button>
        </div>
      </div>
    )
  }
}
