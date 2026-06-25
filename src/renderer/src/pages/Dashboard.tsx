import { useEffect, useState } from 'react'
import { Card, CardTitle } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { PageHeader } from '../components/ui/PageHeader'
import { RiskGauge } from '../components/features/RiskGauge'
import { SkipReasonModal } from '../components/features/SkipReasonModal'
import { useAppState } from '../hooks/useAppState'
import { useToast } from '../components/ui/Toast'
import { labelFor, INTENTION_OPTS } from '@shared/labels'
import { AlertTriangle, CloudRain, ClipboardCheck, Check } from 'lucide-react'
import type { Page } from '../App'

export function Dashboard({ onNavigate, openSkipSignal }: { onNavigate: (p: Page) => void; openSkipSignal?: number }) {
  const { state } = useAppState()
  const [skipOpen, setSkipOpen] = useState(false)
  const { push } = useToast()

  // El tray puede pedir abrir el registro de razón (incrementa openSkipSignal).
  // Solo abrir si de verdad hay deuda — si no, el modal mostraría "sin días".
  useEffect(() => {
    if (openSkipSignal && (state?.debt.length ?? 0) > 0) setSkipOpen(true)
  }, [openSkipSignal]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!state) return <div className="p-6 text-sm text-ink-faint">Cargando…</div>

  // "Ya entrené hoy": confirma asistencia del día en curso sin esperar a que la
  // ventana cierre (22:00). Cubre el caso "fui hoy pero no quedó en Hevy" o un
  // día cambiado de lugar. El estado se repinta solo vía broadcast del main.
  const markTodayWent = async () => {
    const r = await window.api.resolveWent(state.today)
    push(
      r.ok
        ? { title: 'Registrado', body: 'Marcado como entrenado hoy.', tone: 'ok' }
        : { title: 'No disponible', body: 'Hoy no se puede marcar todavía.', tone: 'danger' },
    )
  }

  const checkinLabel: Record<string, string> = {
    open: 'Pendiente — disponible todo el día',
    pending: 'Pendiente — ya pasó tu hora objetivo',
    done: `Hecho${state.checkin.savedAt ? ' · ' + state.checkin.savedAt.slice(11, 16) : ''}`,
    late: 'Día cerrado — entrada sería tardía',
  }
  const checkinTone: Record<string, 'ok' | 'warn' | 'neutral' | 'danger'> = {
    open: 'neutral', pending: 'warn', done: 'ok', late: 'danger',
  }

  return (
    <div className="space-y-4 p-6 pt-3">
      <PageHeader title="Panel" subtitle={`Hoy · ${state.today}`} />
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardTitle>Riesgo de hoy</CardTitle>
          <RiskGauge pct={state.riskPct} level={state.riskLevel} />
        </Card>

        <Card>
          <CardTitle>Plan de hoy</CardTitle>
          <div className="space-y-3">
            <div>
              {state.todayWent ? (
                <p className="flex items-center gap-1.5 font-display text-xl font-extrabold text-ok">
                  <Check size={20} /> Entrenaste hoy
                </p>
              ) : (
                <p className="font-display text-xl font-extrabold text-ink">
                  {state.nextSession ? `Toca: ${state.nextSession}` : '—'}
                </p>
              )}
              {!state.todayWent && state.isRestDay && (
                <p className="text-xs text-ink-faint">sueles descansar hoy — pero manda la rotación</p>
              )}
              {state.canMarkTodayWent && (
                <Button variant="ghost" onClick={markTodayWent} className="mt-2">
                  <span className="flex items-center gap-1.5">
                    <Check size={15} /> Ya entrené hoy
                  </span>
                </Button>
              )}
            </div>
            <div className="flex items-center gap-4 text-sm text-ink-dim">
              <span>
                Última: {state.lastWorkout
                  ? `${state.lastWorkout.date.slice(5)} · hace ${state.lastWorkout.daysAgo}d`
                  : 'sin datos'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                {Array.from({ length: state.weekTarget }).map((_, i) => (
                  <span
                    key={i}
                    className={`h-2.5 w-5 rounded-full ${i < state.weekCount ? 'bg-energy' : 'bg-line'}`}
                  />
                ))}
              </div>
              <span className="text-xs text-ink-faint">{state.weekCount}/{state.weekTarget} esta semana</span>
            </div>
            {state.weather.rainProb !== null && (
              <p className="flex items-center gap-1.5 text-xs text-ink-faint">
                <CloudRain size={13} />
                lluvia {state.weather.rainProb}% · máx {state.weather.tempMax}°C
              </p>
            )}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardTitle>Check-in del día</CardTitle>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Badge tone={checkinTone[state.checkin.status]}>{checkinLabel[state.checkin.status]}</Badge>
              {state.checkin.delayed && (
                <p className="text-xs text-warn">marcado delayed — outcome era observable al llenar</p>
              )}
              <p className="text-xs text-ink-faint">Racha: {state.streak} día{state.streak === 1 ? '' : 's'}</p>
            </div>
            <Button onClick={() => onNavigate('checkin')} variant={state.checkin.status === 'done' ? 'ghost' : 'primary'}>
              <span className="flex items-center gap-1.5">
                <ClipboardCheck size={15} />
                {state.checkin.status === 'done' ? 'Editar' : 'Hacer check-in'}
              </span>
            </Button>
          </div>
        </Card>

        <Card>
          <CardTitle>Outcomes</CardTitle>
          {state.debt.length === 0 ? (
            <p className="text-sm text-ink-dim">Al día — nada pendiente por explicar.</p>
          ) : (
            <div className="flex items-center justify-between">
              <div>
                <p className="flex items-center gap-1.5 text-sm font-medium text-danger">
                  <AlertTriangle size={14} />
                  {state.debt.length} día{state.debt.length > 1 ? 's' : ''} sin resolver
                </p>
                <p className="mt-0.5 text-xs text-ink-faint">
                  {state.debt.map((d) => d.label).join(' · ')}
                </p>
              </div>
              <Button variant="danger" onClick={() => setSkipOpen(true)}>Resolver</Button>
            </div>
          )}
        </Card>
      </div>

      <Card>
        <CardTitle>Desglose del riesgo</CardTitle>
        <table className="w-full text-sm">
          <tbody>
            {state.riskFactors.map((f) => (
              <tr key={f.name} className="border-b border-line/50 last:border-0">
                <td className="py-1.5 pr-3 font-medium text-ink-dim">
                  {f.name === 'intención' ? `intención (${labelFor(INTENTION_OPTS, f.value)})` : f.name}
                </td>
                <td className="py-1.5 pr-3 text-ink-faint">{f.value}</td>
                <td className={`py-1.5 pr-3 text-right font-mono text-xs ${f.contrib > 0 ? 'text-danger' : f.contrib < 0 ? 'text-ok' : 'text-ink-faint'}`}>
                  {f.contrib >= 0 ? '+' : ''}{f.contrib.toFixed(2)}
                </td>
                <td className="py-1.5 text-xs text-ink-faint">{f.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {state.lastError && (
        <p className="text-xs text-danger">Último error de fetch: {state.lastError}</p>
      )}

      <SkipReasonModal open={skipOpen} onClose={() => setSkipOpen(false)} />
    </div>
  )
}
