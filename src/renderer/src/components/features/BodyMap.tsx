import type { MuscleInsight } from '@shared/types'

/**
 * Figura humana estilizada (frente + espalda) con calor por grupo muscular:
 * gris = sin trabajo esta semana, cyan = en progreso, lima = volumen objetivo
 * cumplido. La intensidad viene de sets7d / targetSets del programa.
 */

// panel-2 (#1c545c) → accent (#07bcc8); ratio ≥ 1 → energy (#d1ff03)
function heatColor(ratio: number): string {
  if (ratio >= 1) return '#d1ff03'
  const from = [28, 84, 92]
  const to = [7, 188, 200]
  const t = Math.max(0, Math.min(1, ratio))
  const c = from.map((f, i) => Math.round(f + (to[i] - f) * t))
  return `rgb(${c[0]},${c[1]},${c[2]})`
}

const BASE = 'var(--color-panel-2)'

function ratioOf(m: Map<string, MuscleInsight>, key: string): number {
  const g = m.get(key)
  return g && g.targetSets > 0 ? g.sets7d / g.targetSets : 0
}

/** Siluetas neutras compartidas (cabeza, torso, brazos, piernas). */
function Skeleton() {
  return (
    <g fill={BASE}>
      <circle cx="60" cy="14" r="9" />
      <rect x="44" y="26" width="32" height="50" rx="10" />
      <rect x="46" y="76" width="28" height="18" rx="7" />
      {/* brazos */}
      <rect x="29" y="30" width="11" height="32" rx="5.5" />
      <rect x="80" y="30" width="11" height="32" rx="5.5" />
      <rect x="28" y="63" width="10" height="32" rx="5" />
      <rect x="82" y="63" width="10" height="32" rx="5" />
      {/* piernas */}
      <rect x="46" y="94" width="13" height="64" rx="6.5" />
      <rect x="61" y="94" width="13" height="64" rx="6.5" />
      <rect x="48" y="158" width="10" height="48" rx="5" />
      <rect x="62" y="158" width="10" height="48" rx="5" />
    </g>
  )
}

interface FigProps {
  r: (key: string) => number
}

function FrontFigure({ r }: FigProps) {
  return (
    <svg viewBox="0 0 120 212" className="h-full">
      <Skeleton />
      {/* hombros */}
      <circle cx="36" cy="34" r="7" fill={heatColor(r('shoulders'))} />
      <circle cx="84" cy="34" r="7" fill={heatColor(r('shoulders'))} />
      {/* pecho */}
      <ellipse cx="52.5" cy="41" rx="8" ry="7" fill={heatColor(r('chest'))} />
      <ellipse cx="67.5" cy="41" rx="8" ry="7" fill={heatColor(r('chest'))} />
      {/* bíceps */}
      <ellipse cx="34.5" cy="50" rx="4.5" ry="10" fill={heatColor(r('biceps'))} />
      <ellipse cx="85.5" cy="50" rx="4.5" ry="10" fill={heatColor(r('biceps'))} />
      {/* antebrazos */}
      <ellipse cx="33" cy="79" rx="4" ry="13" fill={heatColor(r('forearms'))} />
      <ellipse cx="87" cy="79" rx="4" ry="13" fill={heatColor(r('forearms'))} />
      {/* core */}
      <rect x="52" y="52" width="16" height="26" rx="5" fill={heatColor(r('core'))} />
      {/* cuádriceps */}
      <ellipse cx="52.5" cy="124" rx="6" ry="26" fill={heatColor(r('quads'))} />
      <ellipse cx="67.5" cy="124" rx="6" ry="26" fill={heatColor(r('quads'))} />
    </svg>
  )
}

function BackFigure({ r }: FigProps) {
  return (
    <svg viewBox="0 0 120 212" className="h-full">
      <Skeleton />
      {/* trapecios */}
      <path d="M60 26 L74 32 L60 46 L46 32 Z" fill={heatColor(r('traps'))} />
      {/* deltoides posteriores */}
      <circle cx="36" cy="34" r="7" fill={heatColor(r('shoulders'))} />
      <circle cx="84" cy="34" r="7" fill={heatColor(r('shoulders'))} />
      {/* dorsales + espalda baja */}
      <ellipse cx="51" cy="57" rx="7" ry="13" fill={heatColor(r('back'))} />
      <ellipse cx="69" cy="57" rx="7" ry="13" fill={heatColor(r('back'))} />
      <rect x="54" y="66" width="12" height="12" rx="4" fill={heatColor(r('back'))} />
      {/* tríceps */}
      <ellipse cx="34.5" cy="50" rx="4.5" ry="10" fill={heatColor(r('triceps'))} />
      <ellipse cx="85.5" cy="50" rx="4.5" ry="10" fill={heatColor(r('triceps'))} />
      {/* antebrazos */}
      <ellipse cx="33" cy="79" rx="4" ry="13" fill={heatColor(r('forearms'))} />
      <ellipse cx="87" cy="79" rx="4" ry="13" fill={heatColor(r('forearms'))} />
      {/* glúteos */}
      <ellipse cx="53" cy="88" rx="7" ry="9" fill={heatColor(r('glutes'))} />
      <ellipse cx="67" cy="88" rx="7" ry="9" fill={heatColor(r('glutes'))} />
      {/* isquios */}
      <ellipse cx="52.5" cy="130" rx="5.5" ry="22" fill={heatColor(r('hamstrings'))} />
      <ellipse cx="67.5" cy="130" rx="5.5" ry="22" fill={heatColor(r('hamstrings'))} />
      {/* gemelos */}
      <ellipse cx="53" cy="180" rx="4.5" ry="17" fill={heatColor(r('calves'))} />
      <ellipse cx="67" cy="180" rx="4.5" ry="17" fill={heatColor(r('calves'))} />
    </svg>
  )
}

export function BodyMap({ muscles }: { muscles: MuscleInsight[] }) {
  const byKey = new Map(muscles.map((m) => [m.key, m]))
  const r = (key: string): number => ratioOf(byKey, key)

  return (
    <div className="flex h-56 items-stretch justify-center gap-6">
      <div className="flex flex-col items-center">
        <FrontFigure r={r} />
        <span className="mt-1 text-[10px] uppercase tracking-wider text-ink-faint">Frente</span>
      </div>
      <div className="flex flex-col items-center">
        <BackFigure r={r} />
        <span className="mt-1 text-[10px] uppercase tracking-wider text-ink-faint">Espalda</span>
      </div>
    </div>
  )
}

export { heatColor }
