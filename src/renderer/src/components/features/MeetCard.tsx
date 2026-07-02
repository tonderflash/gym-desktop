import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { AnimatedNumber } from '../ui/AnimatedNumber'
import { Trophy, Pencil } from 'lucide-react'
import type { MeetInsight, LiftProgress, PaceStatus } from '@shared/types'

const STATUS_LABEL: Record<PaceStatus, string> = {
  ahead: 'Vas a llegar', ontrack: 'Justo en el límite', behind: 'A este paso no llegas', nodata: 'Sin tendencia aún',
}
const STATUS_TONE: Record<PaceStatus, 'ok' | 'warn' | 'neutral' | 'danger'> = {
  ahead: 'ok', ontrack: 'warn', behind: 'danger', nodata: 'neutral',
}

const DAY_MS = 86_400_000
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const dayOf = (iso: string): number => new Date(iso + 'T12:00:00').getTime() / DAY_MS
// fecha local, NO toISOString() (UTC movería "hoy" un día por la noche)
const todayIso = (): string => {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/**
 * Trayectoria del lift, en tiempo real (eje X = calendario, con meses):
 *   izquierda de HOY  → tu fuerza medida (línea cyan)
 *   derecha de HOY    → dos futuros desde tu fuerza actual:
 *     · punteada gris  = lo que NECESITAS ganar para llegar a la meta
 *     · punteada color = lo que ganarías siguiendo tu tendencia
 * Si la de color va por encima de la gris, llegas.
 */
function LiftChart({ lift, meetDate }: { lift: LiftProgress; meetDate: string }) {
  const W = 600
  const H = 72
  const today = todayIso()

  const x0 = dayOf(lift.history[0]?.date ?? today)
  const x1 = dayOf(meetDate)
  const xspan = Math.max(1, x1 - x0)
  const px = (day: number): number => ((day - x0) / xspan) * 100 // en %
  const xOf = (iso: string): number => (px(dayOf(iso)) / 100) * W

  const vals = [
    ...(lift.targetLbs > 0 ? [lift.targetLbs] : []),
    ...(lift.currentLbs !== null ? [lift.currentLbs] : []),
    ...(lift.projectedLbs !== null ? [lift.projectedLbs] : []),
    ...lift.history.map((h) => h.e1rmLbs),
  ]
  const rawLo = Math.min(...vals)
  const rawHi = Math.max(...vals)
  const pad = Math.max(5, (rawHi - rawLo) * 0.12)
  const lo = rawLo - pad
  const hi = rawHi + pad
  const y = (v: number): number => H - ((v - lo) / (hi - lo)) * H
  const py = (v: number): number => (y(v) / H) * 100 // en %

  const histPts = lift.history.map((h) => `${xOf(h.date).toFixed(1)},${y(h.e1rmLbs).toFixed(1)}`).join(' ')
  const xToday = xOf(today)
  const cur = lift.currentLbs

  // etiquetas de mes: cada 1º de mes dentro del rango
  const months: { label: string; pct: number }[] = []
  const start = new Date(lift.history[0]?.date ?? today)
  const cursor = new Date(start.getFullYear(), start.getMonth() + 1, 1, 12)
  const end = new Date(meetDate + 'T12:00:00')
  while (cursor <= end && months.length < 14) {
    const t = cursor.getTime() / DAY_MS
    months.push({ label: MONTHS[cursor.getMonth()], pct: px(t) })
    cursor.setMonth(cursor.getMonth() + 1)
  }

  return (
    <div>
      <div className="relative h-[72px] w-full overflow-hidden rounded-t-lg bg-surface/60">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          {/* guía horizontal de la meta: la línea de color debe alcanzar esta altura */}
          {lift.targetLbs > 0 && (
            <line
              x1="0" y1={y(lift.targetLbs)} x2={W} y2={y(lift.targetLbs)}
              stroke="var(--color-energy)" strokeWidth="1" strokeDasharray="1 6"
              vectorEffect="non-scaling-stroke" opacity="0.45"
            />
          )}
          {/* pasado: tu fuerza medida */}
          {lift.history.length > 1 && (
            <polyline
              points={histPts} fill="none"
              stroke="var(--color-accent)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"
              vectorEffect="non-scaling-stroke" pathLength={1} className="chart-draw"
            />
          )}
          {/* futuro necesario: de tu fuerza de hoy a la meta el día del meet */}
          {cur !== null && lift.targetLbs > 0 && (
            <line
              x1={xToday} y1={y(cur)} x2={W} y2={y(lift.targetLbs)}
              stroke="var(--color-ink-faint)" strokeWidth="1.5" strokeDasharray="7 5"
              vectorEffect="non-scaling-stroke" opacity="0.8"
            />
          )}
          {/* futuro probable: tu tendencia extendida */}
          {cur !== null && lift.projectedLbs !== null && (
            <line
              x1={xToday} y1={y(cur)} x2={W} y2={y(lift.projectedLbs)}
              stroke={lift.projectedLbs >= lift.targetLbs ? 'var(--color-energy)' : 'var(--color-warn)'}
              strokeWidth="2" strokeDasharray="2 5" strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
        {/* HOY: a la izquierda lo medido, a la derecha los dos futuros */}
        <div className="absolute inset-y-0 w-px bg-ink-faint/50" style={{ left: `${px(dayOf(today))}%` }} />
        <span
          className="absolute top-0.5 -translate-x-1/2 text-[9px] font-bold uppercase tracking-wider text-ink-faint"
          style={{ left: `${px(dayOf(today))}%` }}
        >
          hoy
        </span>
        {/* tu fuerza actual (ancla de los dos futuros) */}
        {cur !== null && (
          <div
            className="absolute h-2 w-2 rounded-full bg-energy shadow-[0_0_6px_rgba(209,255,3,0.7)]"
            style={{ left: `calc(${px(dayOf(today))}% - 4px)`, top: `calc(${py(cur)}% - 4px)` }}
          />
        )}
        {/* la meta, en el borde del día del meet */}
        {lift.targetLbs > 0 && (
          <span
            className="absolute right-1 -translate-y-1/2 font-mono text-[9px] font-bold text-energy"
            style={{ top: `${py(lift.targetLbs)}%` }}
          >
            {lift.targetLbs}
          </span>
        )}
      </div>
      {/* eje de tiempo: meses reales entre tu primer dato y el meet */}
      <div className="relative h-4 rounded-b-lg border-t border-line/40 bg-surface/40 text-[9px] text-ink-faint">
        {months.map((m) => (
          <span key={m.pct} className="absolute top-0.5 -translate-x-1/2" style={{ left: `${m.pct}%` }}>
            {m.label}
          </span>
        ))}
        <span className="absolute right-1 top-0.5 font-bold text-energy">meet</span>
      </div>
    </div>
  )
}

function liftChip(lift: LiftProgress) {
  if (lift.currentLbs === null) return <Badge tone="warn">sin sets recientes</Badge>
  if (lift.targetLbs <= 0) return <Badge tone="neutral">sin meta</Badge>
  if (lift.currentLbs >= lift.targetLbs) return <Badge tone="energy">meta superada 🎉</Badge>
  if (lift.status === 'nodata') return <Badge tone="neutral">sin tendencia aún</Badge>
  return <Badge tone={STATUS_TONE[lift.status]}>{STATUS_LABEL[lift.status]}</Badge>
}

function LiftRow({ lift, meetDate }: { lift: LiftProgress; meetDate: string }) {
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
      {lift.history.length > 1 ? (
        <LiftChart lift={lift} meetDate={meetDate} />
      ) : (
        <p className="text-xs text-ink-faint">sin historial suficiente de este lift en Hevy todavía</p>
      )}
      {/* la comparación en una sola frase: lo que pide la meta vs lo que llevas */}
      {lift.currentLbs !== null && lift.targetLbs > 0 && lift.currentLbs < lift.targetLbs && (
        <p className="mt-1 text-[11px] text-ink-faint">
          te faltan <span className="font-semibold text-ink-dim">{lift.targetLbs - lift.currentLbs} lbs</span>
          {lift.neededPerWeek !== null && (
            <> → necesitas <span className="font-semibold text-ink-dim">+{lift.neededPerWeek} lb/sem</span></>
          )}
          {lift.trendPerWeek !== null && (
            <>
              {' '}· llevas{' '}
              <span className={`font-semibold ${(lift.trendPerWeek ?? 0) >= (lift.neededPerWeek ?? 0) ? 'text-ok' : 'text-warn'}`}>
                {lift.trendPerWeek >= 0 ? '+' : ''}{lift.trendPerWeek} lb/sem
              </span>
              {lift.projectedLbs !== null && <> → llegarías a ~{lift.projectedLbs}</>}
            </>
          )}
        </p>
      )}
    </div>
  )
}

export function MeetCard({ meet, onEdit }: { meet: MeetInsight; onEdit: () => void }) {
  // estado setup: la app se distribuye sin objetivo — cada usuario pone el suyo
  if (!meet.configured) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <Trophy size={28} className="text-ink-faint" />
        <div>
          <p className="font-display text-lg font-extrabold text-ink">Ponle una meta a tu entrenamiento</p>
          <p className="mx-auto mt-1 max-w-[380px] text-xs text-ink-faint">
            Un meet, un PR test, una fecha límite — defines metas de e1RM por básico y el panel
            te dice cada día si tu ritmo alcanza.
          </p>
        </div>
        <Button onClick={onEdit}>Configurar objetivo</Button>
      </div>
    )
  }

  const scored = meet.lifts.filter((l) => l.targetLbs > 0)

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="flex items-center gap-2 font-display text-xl font-extrabold text-ink">
            <Trophy size={18} className="text-energy" /> {meet.name || 'Mi objetivo'}
            <button
              onClick={onEdit}
              className="no-drag rounded p-1 text-ink-faint transition hover:text-ink"
              title="Editar objetivo"
            >
              <Pencil size={13} />
            </button>
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
        {meet.totalCurrentLbs !== null && (
          <span className="text-xs text-ink-faint">
            total hoy <span className="font-semibold text-ink-dim">
              <AnimatedNumber value={meet.totalCurrentLbs} suffix=" lbs" showDelta />
            </span>
            {meet.totalProjectedLbs !== null && <> · proyección {meet.totalProjectedLbs}</>}
            {' '}· meta {meet.totalTargetLbs}
          </span>
        )}
        <span className="ml-auto flex items-center gap-3 text-[10px] text-ink-faint">
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-4 rounded bg-accent" /> tu fuerza
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-0 w-4 border-t border-dashed border-ink-faint" /> lo que necesitas
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-0 w-4 border-t-2 border-dotted border-energy" /> tu ritmo actual
          </span>
        </span>
      </div>

      <div className="space-y-4">
        {scored.map((l) => (
          <LiftRow key={l.key} lift={l} meetDate={meet.date} />
        ))}
      </div>

      <p className="text-[10px] text-ink-faint">
        Eje X = calendario real, desde tu primera sesión registrada hasta el día del meet. En HOY tu fuerza
        se bifurca: la punteada gris sube hasta la meta (lo que hace falta) y la de color sigue tu tendencia
        de las últimas ~6 sesiones (a dónde vas). Color por encima del gris = llegas. Fuerza = mejor e1RM
        en ventana de 21 días, de tus sets en Hevy.
      </p>
    </div>
  )
}
