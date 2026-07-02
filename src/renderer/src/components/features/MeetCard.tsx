import { Badge } from '../ui/Badge'
import { AnimatedNumber } from '../ui/AnimatedNumber'
import { Trophy } from 'lucide-react'
import type { MeetInsight, LiftProgress, PaceStatus } from '@shared/types'

const STATUS_LABEL: Record<PaceStatus, string> = {
  ahead: 'Adelantado', ontrack: 'En línea', behind: 'Por debajo', nodata: 'Sin datos frescos',
}
const STATUS_TONE: Record<PaceStatus, 'ok' | 'warn' | 'neutral' | 'danger'> = {
  ahead: 'ok', ontrack: 'neutral', behind: 'danger', nodata: 'warn',
}

const DAY_MS = 86_400_000
const dayOf = (iso: string): number => new Date(iso + 'T12:00:00').getTime() / DAY_MS
// fecha local, NO toISOString() (UTC movería "hoy" un día por la noche)
const todayIso = (): string => {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/**
 * Trayectoria del lift: línea sólida = e1RM real por sesión; punteada larga =
 * ritmo mínimo baseline→meta; punteada corta = proyección de la tendencia
 * reciente hasta el día del meet. Si tu línea va por encima de la punteada,
 * vas adelantado — el "ritmo" se lee de un vistazo.
 */
function LiftChart({ lift, baselineDate, meetDate }: {
  lift: LiftProgress
  baselineDate: string
  meetDate: string
}) {
  const W = 600
  const H = 72

  const x0 = Math.min(dayOf(lift.history[0]?.date ?? baselineDate), dayOf(baselineDate))
  const x1 = dayOf(meetDate)
  const today = dayOf(todayIso())
  const xspan = Math.max(1, x1 - x0)
  const x = (iso: string): number => ((dayOf(iso) - x0) / xspan) * W
  const xd = (day: number): number => ((day - x0) / xspan) * W

  const vals = [
    lift.baselineLbs, lift.targetLbs, lift.expectedLbs,
    ...lift.history.map((h) => h.e1rmLbs),
    ...(lift.projectedLbs !== null ? [lift.projectedLbs] : []),
  ]
  const rawLo = Math.min(...vals)
  const rawHi = Math.max(...vals)
  const pad = Math.max(5, (rawHi - rawLo) * 0.1)
  const lo = rawLo - pad
  const hi = rawHi + pad
  const y = (v: number): number => H - ((v - lo) / (hi - lo)) * H

  const histPts = lift.history.map((h) => `${x(h.date).toFixed(1)},${y(h.e1rmLbs).toFixed(1)}`).join(' ')
  const last = lift.history[lift.history.length - 1]

  return (
    <div className="relative h-[72px] w-full overflow-hidden rounded-lg bg-surface/60">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        {/* ritmo necesario: baseline → meta el día del meet */}
        <line
          x1={x(baselineDate)} y1={y(lift.baselineLbs)} x2={W} y2={y(lift.targetLbs)}
          stroke="var(--color-ink-faint)" strokeWidth="1.5" strokeDasharray="7 5"
          vectorEffect="non-scaling-stroke" opacity="0.7"
        />
        {/* trayectoria real */}
        {lift.history.length > 1 && (
          <polyline
            points={histPts} fill="none"
            stroke="var(--color-accent)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"
            vectorEffect="non-scaling-stroke" pathLength={1} className="chart-draw"
          />
        )}
        {/* proyección de la tendencia al día del meet */}
        {last && lift.projectedLbs !== null && (
          <line
            x1={x(last.date)} y1={y(last.e1rmLbs)} x2={W} y2={y(lift.projectedLbs)}
            stroke={lift.projectedLbs >= lift.targetLbs ? 'var(--color-energy)' : 'var(--color-warn)'}
            strokeWidth="2" strokeDasharray="2 5" strokeLinecap="round"
            vectorEffect="non-scaling-stroke" opacity="0.9"
          />
        )}
        {/* marca de la meta en el borde derecho */}
        <line
          x1={W - 8} y1={y(lift.targetLbs)} x2={W} y2={y(lift.targetLbs)}
          stroke="var(--color-energy)" strokeWidth="3" vectorEffect="non-scaling-stroke"
        />
      </svg>
      {/* hoy: separa pasado (línea real) de futuro (proyección) */}
      <div
        className="absolute inset-y-0 w-px bg-line/70"
        style={{ left: `${(xd(today) / W) * 100}%` }}
        title="hoy"
      />
      {/* último dato real */}
      {last && (
        <div
          className="absolute h-2 w-2 rounded-full bg-energy shadow-[0_0_6px_rgba(209,255,3,0.7)]"
          style={{
            left: `calc(${(x(last.date) / W) * 100}% - 4px)`,
            top: `calc(${(y(last.e1rmLbs) / H) * 100}% - 4px)`,
          }}
        />
      )}
    </div>
  )
}

function liftChip(lift: LiftProgress) {
  if (lift.currentLbs !== null && lift.currentLbs >= lift.targetLbs) {
    return <Badge tone="energy">meta superada — súbela</Badge>
  }
  if (lift.status === 'nodata') return <Badge tone="warn">sin sets recientes</Badge>
  if (lift.status === 'ontrack') return <Badge tone="neutral">en línea con el ritmo</Badge>
  const d = lift.diffLbs ?? 0
  return (
    <Badge tone={d >= 0 ? 'ok' : 'danger'}>
      {d >= 0 ? '+' : ''}{d} lbs vs ritmo
    </Badge>
  )
}

function LiftRow({ lift, meet }: { lift: LiftProgress; meet: MeetInsight }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="flex items-center gap-2.5">
          <span className="font-display text-sm font-extrabold text-ink">{lift.label}</span>
          {liftChip(lift)}
        </span>
        <span className="font-display text-lg font-extrabold text-ink">
          {lift.currentLbs !== null
            ? <AnimatedNumber value={lift.currentLbs} suffix=" lbs" showDelta />
            : <span className="text-sm font-medium text-ink-faint">—</span>}
        </span>
      </div>
      {lift.history.length > 0 ? (
        <LiftChart lift={lift} baselineDate={meet.baselineDate} meetDate={meet.date} />
      ) : (
        <p className="text-xs text-ink-faint">sin historial de este lift en Hevy todavía</p>
      )}
      <p className="mt-1 text-[10px] text-ink-faint">
        empezaste en {lift.baselineLbs} · hoy el ritmo pide {Math.round(lift.expectedLbs)}
        {lift.projectedLbs !== null && (
          <>
            {' '}· a tu paso llegas a{' '}
            <span className={lift.projectedLbs >= lift.targetLbs ? 'font-semibold text-ok' : 'font-semibold text-warn'}>
              ~{lift.projectedLbs}
            </span>
          </>
        )}
        {' '}· meta <span className="font-semibold text-energy">{lift.targetLbs}</span>
      </p>
    </div>
  )
}

export function MeetCard({ meet }: { meet: MeetInsight }) {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="flex items-center gap-2 font-display text-xl font-extrabold text-ink">
            <Trophy size={18} className="text-energy" /> {meet.name}
          </p>
          <p className="mt-0.5 text-xs text-ink-faint">
            {meet.date}{meet.weightClass ? ` · categoría ${meet.weightClass}` : ''}
          </p>
        </div>
        <div className="text-right">
          <p className="font-display text-3xl font-black leading-none text-energy">
            <AnimatedNumber value={meet.daysLeft} />
          </p>
          <p className="text-[10px] uppercase tracking-wider text-ink-faint">días restantes</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Badge tone={STATUS_TONE[meet.status]}>{STATUS_LABEL[meet.status]}</Badge>
        {meet.totalCurrentLbs !== null ? (
          <span className="text-xs text-ink-faint">
            total <span className="font-semibold text-ink-dim">
              <AnimatedNumber value={meet.totalCurrentLbs} suffix=" lbs" showDelta />
            </span>{' '}
            · meta {meet.totalTargetLbs}
          </span>
        ) : (
          <span className="text-xs text-ink-faint">
            faltan sets recientes de algún básico para calcular el total
          </span>
        )}
        {/* leyenda de lectura — una sola vez para las tres gráficas */}
        <span className="ml-auto flex items-center gap-3 text-[10px] text-ink-faint">
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-4 rounded bg-accent" /> tu e1RM
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-0 w-4 border-t border-dashed border-ink-faint" /> ritmo a meta
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-0 w-4 border-t-2 border-dotted border-energy" /> tu proyección
          </span>
        </span>
      </div>

      <div className="space-y-4">
        {meet.lifts.map((l) => (
          <LiftRow key={l.key} lift={l} meet={meet} />
        ))}
      </div>

      <p className="text-[10px] text-ink-faint">
        Si tu línea cyan va por ENCIMA de la punteada gris, vas adelantado. La punteada corta extrapola
        tus últimas ~6 sesiones al día del meet. e1RM = sets de Hevy (reps + RIR del RPE) · metas en settings.json.
      </p>
    </div>
  )
}
