import { useEffect, useState } from 'react'
import { Card, CardTitle } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { PageHeader } from '../components/ui/PageHeader'
import { AnimatedNumber } from '../components/ui/AnimatedNumber'
import { RiskGauge } from '../components/features/RiskGauge'
import { SkipReasonModal } from '../components/features/SkipReasonModal'
import { BodyMap, heatColor } from '../components/features/BodyMap'
import { MeetCard } from '../components/features/MeetCard'
import { useAppState } from '../hooks/useAppState'
import { useToast } from '../components/ui/Toast'
import { labelFor, INTENTION_OPTS } from '@shared/labels'
import {
  AlertTriangle, CloudRain, ClipboardCheck, Check, Dumbbell, Medal, Sparkles,
} from 'lucide-react'
import type { Page } from '../App'
import type { MuscleInsight, VolumeInsight } from '@shared/types'

/** Leyenda del mapa muscular: barra sets7d/target por grupo. */
function MuscleLegend({ muscles }: { muscles: MuscleInsight[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-1.5">
      {muscles.map((m, i) => {
        const ratio = m.targetSets > 0 ? m.sets7d / m.targetSets : 0
        return (
          <div key={m.key}>
            <div className="flex justify-between text-[11px]">
              <span className="text-ink-dim">{m.label}</span>
              <span className="font-mono text-ink-faint">
                {m.sets7d}/{m.targetSets}
                {m.lastDaysAgo !== null && m.lastDaysAgo > 0 ? ` · ${m.lastDaysAgo}d` : ''}
              </span>
            </div>
            <div className="mt-0.5 h-1.5 rounded-full bg-panel-2">
              <div
                className="bar-grow h-full rounded-full"
                style={{
                  width: `${Math.min(1, ratio) * 100}%`,
                  background: heatColor(ratio),
                  animationDelay: `${i * 40}ms`,
                }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** Mini gráfico de barras del tonelaje semanal (la actual en lima). */
function VolumeChart({ volume }: { volume: VolumeInsight }) {
  const max = Math.max(1, ...volume.weeks.map((w) => w.tonnageLbs))
  return (
    <div className="flex h-20 items-end gap-1.5">
      {volume.weeks.map((w, i) => {
        const isCurrent = i === volume.weeks.length - 1
        return (
          <div key={w.weekStart} className="group flex flex-1 flex-col items-center gap-1">
            <div
              className="bar-grow-y w-full rounded-t"
              style={{
                height: `${Math.max(4, (w.tonnageLbs / max) * 100)}%`,
                background: isCurrent ? 'var(--color-energy)' : 'var(--color-accent)',
                opacity: isCurrent ? 1 : 0.55,
                animationDelay: `${i * 70}ms`,
              }}
              title={`Semana del ${w.weekStart.slice(5)} · ${w.tonnageLbs.toLocaleString('en-US')} lbs · ${w.sessions} sesiones`}
            />
            <span className="text-[9px] text-ink-faint">{w.weekStart.slice(5)}</span>
          </div>
        )
      })}
    </div>
  )
}

export function Dashboard({ onNavigate, openSkipSignal }: { onNavigate: (p: Page) => void; openSkipSignal?: number }) {
  const { state, refresh } = useAppState()
  const [skipOpen, setSkipOpen] = useState(false)
  // Remonta el contenido al enfocar la ventana → replay de count-ups y barras
  // ("suma puntos" en cada apertura), además de refrescar la data de Hevy.
  const [focusTick, setFocusTick] = useState(0)
  const { push } = useToast()

  // El tray puede pedir abrir el registro de razón (incrementa openSkipSignal).
  // Solo abrir si de verdad hay deuda — si no, el modal mostraría "sin días".
  useEffect(() => {
    if (openSkipSignal && (state?.debt.length ?? 0) > 0) setSkipOpen(true)
  }, [openSkipSignal]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onFocus = (): void => {
      setFocusTick((t) => t + 1)
      void refresh().catch(() => undefined)
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refresh])

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

  const ins = state.insights
  const findingTone: Record<string, string> = {
    ok: 'text-ok', warn: 'text-warn', info: 'text-ink-dim',
  }

  return (
    <div className="p-6 pt-3">
      <PageHeader title="Panel" subtitle={`Hoy · ${state.today}`} />

      <div key={focusTick} className="dash-stagger space-y-4">
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
                      className={`h-2.5 w-5 rounded-full ${i < state.weekCount ? 'bar-grow bg-energy' : 'bg-line'}`}
                      style={i < state.weekCount ? { animationDelay: `${i * 90}ms` } : undefined}
                    />
                  ))}
                </div>
                <span className="text-xs text-ink-faint">
                  <AnimatedNumber value={state.weekCount} showDelta />/{state.weekTarget} esta semana
                </span>
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

        <Card>
          <CardTitle>Objetivo — camino a la plataforma</CardTitle>
          <MeetCard meet={ins.meet} />
        </Card>

        <Card>
          <CardTitle>Mapa muscular — últimos 7 días</CardTitle>
          <div className="grid grid-cols-[auto_1fr] items-center gap-8">
            <BodyMap muscles={ins.muscles} />
            <MuscleLegend muscles={ins.muscles} />
          </div>
          <p className="mt-3 text-[10px] text-ink-faint">
            series efectivas vs. objetivo semanal del programa · lima = volumen cumplido · gris = sin trabajo
          </p>
        </Card>

        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardTitle>Volumen semanal</CardTitle>
            <div className="mb-3 flex items-baseline gap-2">
              <span className="font-display text-2xl font-black text-ink">
                <AnimatedNumber value={ins.volume.thisWeekLbs} suffix=" lbs" showDelta />
              </span>
              {ins.volume.pctVsAvg !== null && (
                <span className={`text-xs font-semibold ${ins.volume.pctVsAvg >= 0 ? 'text-ok' : 'text-warn'}`}>
                  {ins.volume.pctVsAvg >= 0 ? '+' : ''}{ins.volume.pctVsAvg}% vs prom. 4 sem
                </span>
              )}
            </div>
            {ins.volume.weeks.length > 1 ? (
              <VolumeChart volume={ins.volume} />
            ) : (
              <p className="text-sm text-ink-dim">Aún no hay semanas suficientes para la tendencia.</p>
            )}
          </Card>

          <Card>
            <CardTitle>Récords recientes</CardTitle>
            {ins.prs.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-ink-dim">
                <Dumbbell size={15} className="text-ink-faint" />
                Sin PRs de e1RM en 14 días — los básicos mandan, paciencia.
              </p>
            ) : (
              <div className="space-y-2.5">
                {ins.prs.map((pr) => (
                  <div key={pr.exercise} className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm text-ink-dim">
                      <Medal size={15} className="text-energy" />
                      {pr.exercise}
                      <span className="text-[10px] text-ink-faint">{pr.date.slice(5)}</span>
                    </span>
                    <span className="font-display text-sm font-extrabold text-ink">
                      <AnimatedNumber value={pr.e1rmLbs} suffix=" lbs" />
                      <span className="ml-1.5 text-[10px] font-semibold text-ok">
                        +{pr.e1rmLbs - pr.prevLbs}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}
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
                <p className="text-xs text-ink-faint">
                  Racha: <AnimatedNumber value={state.streak} showDelta /> día{state.streak === 1 ? '' : 's'}
                </p>
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
          <CardTitle>Lo que dicen tus datos</CardTitle>
          <div className="space-y-2">
            {ins.findings.map((f, i) => (
              <p key={i} className={`flex items-start gap-2 text-sm ${findingTone[f.tone]}`}>
                <Sparkles size={14} className="mt-0.5 shrink-0 text-accent" />
                {f.text}
              </p>
            ))}
          </div>
        </Card>

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
      </div>

      <SkipReasonModal open={skipOpen} onClose={() => setSkipOpen(false)} />
    </div>
  )
}
