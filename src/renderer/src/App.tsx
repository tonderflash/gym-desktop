import { useEffect, useState } from 'react'
import { Sidebar } from './components/layout/Sidebar'
import { Dashboard } from './pages/Dashboard'
import { CheckIn } from './pages/CheckIn'
import { History } from './pages/History'
import { Claude } from './pages/Claude'
import { Settings } from './pages/Settings'
import { useToast } from './components/ui/Toast'
import { features } from './features/registry'

export type Page = 'dashboard' | 'checkin' | 'history' | 'claude' | 'settings'

export default function App() {
  // string (no Page) para admitir ids de features/extensiones desacopladas
  const [page, setPage] = useState<string>('dashboard')
  const [skipTick, setSkipTick] = useState(0)
  const { push } = useToast()

  // Navegación desde notificaciones nativas y desde el menú del tray
  useEffect(() => {
    return window.api.onNavigate((p) => {
      if (p === 'skip') {
        // el tray pidió registrar razón pendiente: ir al panel y abrir el modal
        setPage('dashboard')
        setSkipTick((t) => t + 1)
        return
      }
      if (['dashboard', 'checkin', 'history', 'claude', 'settings'].includes(p)) {
        setPage(p as Page)
      }
    })
  }, [])

  // Eventos del auto-updater → toasts tipo Claude Desktop
  useEffect(() => {
    return window.api.onUpdaterEvent((e) => {
      if (e.type === 'available') {
        push({ title: `v${e.version} disponible`, body: 'Descargando en segundo plano…', tone: 'info' })
      } else if (e.type === 'downloaded') {
        push({
          title: `v${e.version} lista para instalar`,
          tone: 'ok',
          sticky: true,
          action: { label: 'Reiniciar y actualizar', onClick: () => void window.api.updaterAction('install') },
        })
      } else if (e.type === 'error') {
        push({ title: 'Error de actualización', body: e.message, tone: 'warn' })
      }
    })
  }, [push])

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar page={page} onNavigate={setPage} />
      <main className="flex-1 overflow-y-auto">
        <div className="drag-region h-3" />
        {page === 'dashboard' && <Dashboard onNavigate={setPage} openSkipSignal={skipTick} />}
        {page === 'checkin' && <CheckIn onNavigate={setPage} />}
        {page === 'history' && <History />}
        {page === 'claude' && <Claude />}
        {page === 'settings' && <Settings />}
        {/* Features/extensiones desacopladas (auto-descubiertas) */}
        {features.map((f) => (page === f.id ? <f.Component key={f.id} /> : null))}
      </main>
    </div>
  )
}
