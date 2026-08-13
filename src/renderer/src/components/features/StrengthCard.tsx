import { AnimatedNumber } from '../ui/AnimatedNumber'
import { Badge } from '../ui/Badge'
import { Dumbbell, ArrowUpRight } from 'lucide-react'
import type { OneRmEntry, StrengthInsight } from '@shared/types'

/**
 * Fuerza máxima: tu 1RM estimado por ejercicio, de qué serie sale y hasta
 * dónde llega si la tendencia se mantiene. El e1RM se calcula con reps
 * EFECTIVAS (reps + RIR), así que una serie fácil no infla el número — pero
 * tampoco predice igual: por eso cada fila declara su confianza.
 */

const CONF: Record<OneRmEntry['confidence'], { label: string; tone: 'ok' | 'warn' | 'neutral' }> = {
  high: { label: 'alta', tone: 'ok' },
  med: { label: 'media', tone: 'neutral' },
  low: { label: 'baja', tone: 'warn' },
}

/** Descanso entre series según lo pesado que sea el trabajo del día. */
const REST_HINT = '≥90% del 1RM: 3-5 min entre series · 70-85%: 2-3 min · <70%: 60-90 s'

function LiftRow({ l }: { l: OneRmEntry }) {
  const conf = CONF[l.confidence]
  const gain = l.potentialLbs !== null ? l.potentialLbs - l.e1rmLbs : 0

  return (
    <div className="rounded-xl bg-panel-2/40 p-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-sm text-ink-dim">
          {l.isBig3 && <Dumbbell size={13} className="shrink-0 text-energy" />}
          <span className="truncate">{l.exercise}</span>
        </span>
        <span className="font-display shrink-0 text-base font-extrabold text-ink">
          <AnimatedNumber value={l.e1rmLbs} suffix=" lbs" />
        </span>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-ink-faint">
        <Badge tone={conf.tone}>confianza {conf.label}</Badge>
        <span className="font-mono">
          {l.source.weightLbs} lbs × {l.source.reps}
          {l.source.rpe !== null ? ` @${l.source.rpe}` : ''} · hace {l.source.daysAgo}d
        </span>
        {l.bestLbs > l.e1rmLbs && (
          <span title={`Tu mejor marca del cache, del ${l.bestDate}`}>
            mejor {l.bestLbs}
          </span>
        )}
      </div>

      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="flex gap-2 font-mono text-[10px] text-ink-faint">
          {l.work.map((w) => (
            <span key={w.pct} title={`${w.pct}% de tu 1RM estimado`}>
              {w.pct}% <span className="text-ink-dim">{w.lbs}</span>
            </span>
          ))}
        </span>
        {l.potentialLbs !== null && gain > 0 ? (
          <span
            className="flex items-center gap-1 text-[10px] font-semibold text-ok"
            title={`Tendencia ${l.trendPerWeek} lb/semana proyectada a 4 semanas`}
          >
            <ArrowUpRight size={11} /> techo 4 sem: {l.potentialLbs}
          </span>
        ) : (
          <span className="text-[10px] text-ink-faint">
            {l.trendPerWeek === null ? 'sin tendencia aún' : `${l.trendPerWeek} lb/sem`}
          </span>
        )}
      </div>
    </div>
  )
}

export function StrengthCard({ strength }: { strength: StrengthInsight }) {
  if (strength.lifts.length === 0) {
    return (
      <p className="text-sm text-ink-dim">
        Sin series con peso y reps suficientes en Hevy para estimar 1RM.
      </p>
    )
  }

  return (
    <>
      {strength.totalBig3Lbs !== null && (
        <div className="mb-3 flex items-baseline gap-2">
          <span className="font-display text-2xl font-black text-energy">
            <AnimatedNumber value={strength.totalBig3Lbs} suffix=" lbs" showDelta />
          </span>
          <span className="text-xs text-ink-faint">total estimado de los tres básicos</span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        {strength.lifts.map((l) => (
          <LiftRow key={l.exercise} l={l} />
        ))}
      </div>
      <p className="mt-3 text-[10px] leading-relaxed text-ink-faint">
        e1RM con reps efectivas (reps + RIR) · los % son cargas de trabajo redondeadas a 5 lbs ·
        descanso: {REST_HINT}
      </p>
    </>
  )
}
