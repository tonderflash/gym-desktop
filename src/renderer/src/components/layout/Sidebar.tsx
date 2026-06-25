import { LayoutDashboard, ClipboardCheck, History, Sparkles, Settings, RefreshCw } from 'lucide-react'
import { useAppState } from '../../hooks/useAppState'
import { BrandMark } from '../BrandMark'
import { features } from '../../features/registry'

const items: { id: string; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Panel', icon: LayoutDashboard },
  { id: 'checkin', label: 'Check-in', icon: ClipboardCheck },
  { id: 'history', label: 'Historial', icon: History },
  { id: 'claude', label: 'Claude', icon: Sparkles },
  { id: 'settings', label: 'Ajustes', icon: Settings },
]

const dotColor: Record<string, string> = {
  low: 'bg-ok', med: 'bg-warn', high: 'bg-danger',
}

export function Sidebar({ page, onNavigate }: { page: string; onNavigate: (p: string) => void }) {
  const { state, refreshing, refresh } = useAppState()

  return (
    <aside className="flex w-52 shrink-0 flex-col border-r border-line bg-panel">
      {/* pt-10 baja el logo por debajo de los semáforos de macOS (y:16, ~30px alto)
          en titleBarStyle hiddenInset, evitando el choque visual. */}
      <div className="drag-region flex items-center gap-2.5 px-4 pb-3 pt-10">
        <BrandMark size={30} />
        <span className="font-display text-[17px] font-extrabold tracking-tight text-ink">GymBar</span>
      </div>

      {state && (
        <div className="mx-3 mb-2 flex items-center gap-2 rounded-xl bg-panel-2 px-3 py-2">
          <span className={`h-2.5 w-2.5 rounded-full ${dotColor[state.riskLevel]}`} />
          <span className="font-display text-sm font-extrabold text-ink">{state.riskPct}%</span>
          <span className="text-xs text-ink-faint">riesgo hoy</span>
        </div>
      )}

      <nav className="flex-1 space-y-0.5 px-3 py-2">
        {items.map(({ id, label, icon: Icon }) => {
          const active = page === id
          const showBadge = id === 'checkin' && state?.checkin.status === 'pending'
          return (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                active ? 'bg-accent/15 text-accent' : 'text-ink-dim hover:bg-panel-2 hover:text-ink'
              }`}
            >
              <Icon size={16} />
              <span className="flex-1 text-left">{label}</span>
              {showBadge && <span className="h-2 w-2 rounded-full bg-energy" />}
              {id === 'dashboard' && state && state.debt.length > 0 && (
                <span className="rounded-full bg-danger/20 px-1.5 text-[10px] font-semibold text-danger">
                  {state.debt.length}
                </span>
              )}
            </button>
          )
        })}

        {/* Features/extensiones desacopladas — vacío si no hay ninguna */}
        {features.length > 0 && <div className="my-2 border-t border-line/60" />}
        {features.map(({ id, label, icon: Icon }) => {
          const active = page === id
          return (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                active ? 'bg-accent/15 text-accent' : 'text-ink-dim hover:bg-panel-2 hover:text-ink'
              }`}
            >
              <Icon size={16} />
              <span className="flex-1 text-left">{label}</span>
            </button>
          )
        })}
      </nav>

      <div className="border-t border-line p-3">
        <button
          onClick={() => void refresh()}
          disabled={refreshing}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-ink-faint hover:bg-panel-2 hover:text-ink disabled:opacity-50"
        >
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          {refreshing ? 'Actualizando…' : 'Actualizar'}
        </button>
        <p className="mt-1 px-3 text-[10px] text-ink-faint">
          v{state?.version ?? '…'}
          {state?.fetchedAt && ` · fetch ${state.fetchedAt.slice(11, 16)}`}
        </p>
      </div>
    </aside>
  )
}
