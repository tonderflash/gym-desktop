import { AnimatedNumber } from '../ui/AnimatedNumber'
import { BatteryFull, BatteryLow, Clock, Flame, TrendingUp } from 'lucide-react'
import type { MuscleInsight, ReadinessInsight } from '@shared/types'

/**
 * Readiness muscular: qué tan recuperado está cada músculo del último estímulo
 * que recibió. El descanso necesario no es fijo — sale del tamaño del músculo,
 * de cuántas series efectivas le metiste esa sesión y de si fue cerca del fallo
 * o pesado. De ahí salen las horas que faltan.
 */

function toneOf(readiness: number): { color: string; label: string } {
  if (readiness >= 1) return { color: 'var(--color-energy)', label: 'listo' }
  if (readiness >= 0.7) return { color: 'var(--color-accent)', label: 'casi' }
  if (readiness >= 0.35) return { color: 'var(--color-warn)', label: 'recuperando' }
  return { color: 'var(--color-danger)', label: 'fatigado' }
}

function hoursLabel(h: number): string {
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  const r = h % 24
  return r === 0 ? `${d}d` : `${d}d ${r}h`
}

function Row({ m }: { m: MuscleInsight }) {
  const t = toneOf(m.readiness)
  const left = m.recoveryHours !== null && m.hoursSince !== null
    ? Math.max(0, Math.round(m.recoveryHours - m.hoursSince))
    : 0

  return (
    <div
      className="flex items-center gap-2"
      title={
        m.recoveryHours === null
          ? `${m.label}: sin sesiones registradas en el cache`
          : `${m.label}: ${m.lastSessionSets} series efectivas hace ${m.hoursSince}h · pide ${hoursLabel(m.recoveryHours)} de descanso`
      }
    >
      <span className="flex w-[92px] shrink-0 items-center gap-1 text-[11px] text-ink-dim">
        {m.priority === 'aggressive' && <Flame size={10} className="text-energy" />}
        {m.priority === 'grow' && <TrendingUp size={10} className="text-mint" />}
        <span className="truncate">{m.label}</span>
      </span>
      <div className="h-1.5 flex-1 rounded-full bg-panel-2">
        <div
          className="bar-grow h-full rounded-full"
          style={{ width: `${Math.max(3, m.readiness * 100)}%`, background: t.color }}
        />
      </div>
      <span className="w-14 shrink-0 text-right font-mono text-[10px] text-ink-faint">
        {m.readiness >= 1 ? 'listo' : `${hoursLabel(left)}`}
      </span>
    </div>
  )
}

export function ReadinessCard({
  muscles, readiness,
}: {
  muscles: MuscleInsight[]
  readiness: ReadinessInsight
}) {
  // los más fatigados arriba: es lo que decide qué NO entrenas hoy
  const rows = [...muscles].sort((a, b) => a.readiness - b.readiness)
  const fresh = readiness.score >= 75

  return (
    <>
      <div className="mb-3 flex items-baseline gap-2">
        <span className="font-display text-2xl font-black text-ink">
          <AnimatedNumber value={readiness.score} suffix="%" showDelta />
        </span>
        <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: fresh ? 'var(--color-ok)' : 'var(--color-warn)' }}>
          {fresh ? <BatteryFull size={14} /> : <BatteryLow size={14} />}
          {fresh ? 'cuerpo recuperado' : 'recuperación parcial'}
        </span>
        <span className="text-[10px] text-ink-faint">ponderado por tus prioridades</span>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
        {rows.map((m) => (
          <Row key={m.key} m={m} />
        ))}
      </div>

      <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-snug text-ink-dim">
        <Clock size={12} className="mt-0.5 shrink-0 text-accent" />
        {readiness.suggestion}
      </p>
      <p className="mt-1 text-[10px] text-ink-faint">
        el descanso se calcula por músculo: tamaño × series efectivas de la última sesión × intensidad
        (RPE≥9 o ≤3 reps pesan más)
      </p>
    </>
  )
}
