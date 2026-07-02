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
const STATUS_COLOR: Record<PaceStatus, string> = {
  ahead: 'var(--color-energy)',
  ontrack: 'var(--color-accent)',
  behind: 'var(--color-danger)',
  nodata: 'var(--color-ink-faint)',
}

/** Barra baseline→target con marcador de "dónde deberías ir hoy". */
function LiftRow({ lift, delay }: { lift: LiftProgress; delay: number }) {
  const span = Math.max(1, lift.targetLbs - lift.baselineLbs)
  const clamp = (v: number): number => Math.max(0, Math.min(1, (v - lift.baselineLbs) / span))
  const curPct = lift.currentLbs !== null ? clamp(lift.currentLbs) : 0
  const expPct = clamp(lift.expectedLbs)

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-ink-dim">{lift.label}</span>
        <span className="font-display text-lg font-extrabold text-ink">
          {lift.currentLbs !== null
            ? <AnimatedNumber value={lift.currentLbs} suffix=" lbs" showDelta />
            : <span className="text-sm font-medium text-ink-faint">sin sets recientes</span>}
        </span>
      </div>
      <div className="relative mt-1 h-2 rounded-full bg-panel-2">
        <div
          className="bar-grow absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${curPct * 100}%`,
            background: STATUS_COLOR[lift.status],
            animationDelay: `${delay}ms`,
          }}
        />
        {/* marcador del ritmo esperado hoy */}
        <div
          className="absolute -top-0.5 h-3 w-0.5 rounded bg-ink/70"
          style={{ left: `${expPct * 100}%` }}
          title={`Hoy deberías ir por ~${lift.expectedLbs} lbs`}
        />
      </div>
      <div className="mt-0.5 flex justify-between text-[10px] text-ink-faint">
        <span>{lift.baselineLbs}</span>
        <span>
          {lift.diffLbs !== null && (
            <span className={lift.diffLbs >= 0 ? 'text-ok' : 'text-danger'}>
              {lift.diffLbs >= 0 ? '+' : ''}{lift.diffLbs} vs ritmo ·{' '}
            </span>
          )}
          meta {lift.targetLbs}
        </span>
      </div>
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

      <div className="flex items-center gap-2">
        <Badge tone={STATUS_TONE[meet.status]}>{STATUS_LABEL[meet.status]}</Badge>
        {meet.totalCurrentLbs !== null ? (
          <span className="text-xs text-ink-faint">
            total <span className="font-semibold text-ink-dim">
              <AnimatedNumber value={meet.totalCurrentLbs} suffix=" lbs" showDelta />
            </span>{' '}
            · ritmo pide {meet.totalExpectedLbs} · meta {meet.totalTargetLbs}
          </span>
        ) : (
          <span className="text-xs text-ink-faint">
            faltan sets recientes de algún básico para calcular el total
          </span>
        )}
      </div>

      <div className="space-y-3">
        {meet.lifts.map((l, i) => (
          <LiftRow key={l.key} lift={l} delay={i * 120} />
        ))}
      </div>

      <p className="text-[10px] text-ink-faint">
        e1RM estimado de tus sets en Hevy (reps + RIR del RPE) · objetivo y baseline editables en settings.json
      </p>
    </div>
  )
}
