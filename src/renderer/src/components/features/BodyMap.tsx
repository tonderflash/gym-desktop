import type { MuscleInsight, MuscleZone, MusclePriority } from '@shared/types'

/**
 * Figura humana (frente + espalda) con calor por grupo muscular. El color NO
 * es "cuánto hiciste" sino EN QUÉ ZONA caes respecto a tus umbrales:
 *
 *   gris   sin trabajo esta semana
 *   cyan   por debajo del MEV → mantienes tejido, no creces
 *   lima   entre MEV y MRV → zona de hipertrofia (más lima = más cerca del MAV)
 *   rojo   pasaste el MRV → fatiga que no vas a recuperar
 *
 * El contorno marca lo que elegiste hipertrofiar: sólido = agresivo,
 * punteado = crecer, sin contorno = mantener.
 */

const GRAY = [28, 84, 92] // panel-2
const CYAN = [7, 188, 200] // accent
const LIME = [209, 255, 3] // energy

function mix(from: number[], to: number[], t: number): string {
  const k = Math.max(0, Math.min(1, t))
  const c = from.map((f, i) => Math.round(f + (to[i] - f) * k))
  return `rgb(${c[0]},${c[1]},${c[2]})`
}

/** Color del músculo según su zona de volumen (no según un ratio suelto). */
export function zoneColor(m: Pick<MuscleInsight, 'sets7d' | 'mev' | 'mav' | 'mrv' | 'zone'>): string {
  switch (m.zone) {
    case 'none':
      return 'var(--color-panel-2)'
    case 'below':
      return mix(GRAY, CYAN, m.mev > 0 ? m.sets7d / m.mev : 0)
    case 'growth':
      return mix(CYAN, LIME, m.mav > m.mev ? (m.sets7d - m.mev) / (m.mav - m.mev) : 1)
    case 'optimal':
      return 'var(--color-energy)'
    case 'over':
      return 'var(--color-danger)'
  }
}

export const ZONE_LABEL: Record<MuscleZone, string> = {
  none: 'sin trabajo',
  below: 'bajo el MEV — mantiene, no crece',
  growth: 'zona de hipertrofia',
  optimal: 'zona productiva alta',
  over: 'sobre el MRV — fatiga sin ganancia',
}

const BASE = 'var(--color-panel-2)'

interface Painter {
  /** props de pintado (relleno por zona + contorno por prioridad) del grupo */
  (key: string): { fill: string; stroke?: string; strokeWidth?: number; strokeDasharray?: string }
}

function makePainter(muscles: MuscleInsight[]): Painter {
  const byKey = new Map(muscles.map((m) => [m.key, m]))
  return (key: string) => {
    const m = byKey.get(key)
    if (!m) return { fill: BASE }
    const outline: Record<MusclePriority, { stroke?: string; strokeWidth?: number; strokeDasharray?: string }> = {
      aggressive: { stroke: 'var(--color-mint)', strokeWidth: 1.4 },
      grow: { stroke: 'var(--color-mint)', strokeWidth: 0.9, strokeDasharray: '2 2' },
      maintain: {},
    }
    return { fill: zoneColor(m), ...outline[m.priority] }
  }
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

function FrontFigure({ p }: { p: Painter }) {
  return (
    <svg viewBox="0 0 120 212" className="h-full">
      <Skeleton />
      {/* trapecio superior (visible de frente, sobre la clavícula) */}
      <path d="M48 27 L60 24 L72 27 L68 31 L52 31 Z" {...p('traps')} />
      {/* deltoides laterales */}
      <circle cx="36" cy="34" r="7" {...p('shoulders')} />
      <circle cx="84" cy="34" r="7" {...p('shoulders')} />
      {/* pecho */}
      <ellipse cx="52.5" cy="41" rx="8" ry="7" {...p('chest')} />
      <ellipse cx="67.5" cy="41" rx="8" ry="7" {...p('chest')} />
      {/* bíceps */}
      <ellipse cx="34.5" cy="50" rx="4.5" ry="10" {...p('biceps')} />
      <ellipse cx="85.5" cy="50" rx="4.5" ry="10" {...p('biceps')} />
      {/* antebrazos */}
      <ellipse cx="33" cy="79" rx="4" ry="13" {...p('forearms')} />
      <ellipse cx="87" cy="79" rx="4" ry="13" {...p('forearms')} />
      {/* core: recto abdominal en tres bloques */}
      <rect x="53" y="52" width="14" height="7" rx="2.5" {...p('core')} />
      <rect x="53" y="61" width="14" height="7" rx="2.5" {...p('core')} />
      <rect x="53" y="70" width="14" height="8" rx="2.5" {...p('core')} />
      {/* cuádriceps */}
      <ellipse cx="51" cy="124" rx="5.5" ry="26" {...p('quads')} />
      <ellipse cx="69" cy="124" rx="5.5" ry="26" {...p('quads')} />
      {/* aductores (cara interna del muslo) */}
      <ellipse cx="56.8" cy="112" rx="2.4" ry="16" {...p('adductors')} />
      <ellipse cx="63.2" cy="112" rx="2.4" ry="16" {...p('adductors')} />
    </svg>
  )
}

function BackFigure({ p }: { p: Painter }) {
  return (
    <svg viewBox="0 0 120 212" className="h-full">
      <Skeleton />
      {/* trapecios (rombo del cuello a media espalda) */}
      <path d="M60 26 L71 32 L60 42 L49 32 Z" {...p('traps')} />
      {/* deltoides posteriores */}
      <circle cx="36" cy="34" r="7" {...p('rear_delts')} />
      <circle cx="84" cy="34" r="7" {...p('rear_delts')} />
      {/* espalda alta: romboides a los lados de la columna, bajo el trapecio */}
      <rect x="49" y="44" width="9" height="9" rx="2.5" {...p('upper_back')} />
      <rect x="62" y="44" width="9" height="9" rx="2.5" {...p('upper_back')} />
      {/* dorsales: de la axila a la cintura, por los flancos */}
      <path d="M44 48 L53 46 L55 72 L45 65 Z" {...p('lats')} />
      <path d="M76 48 L67 46 L65 72 L75 65 Z" {...p('lats')} />
      {/* erectores espinales (a lo largo de la columna) */}
      <rect x="57" y="55" width="2.6" height="21" rx="1.3" {...p('erectors')} />
      <rect x="60.4" y="55" width="2.6" height="21" rx="1.3" {...p('erectors')} />
      {/* tríceps */}
      <ellipse cx="34.5" cy="50" rx="4.5" ry="10" {...p('triceps')} />
      <ellipse cx="85.5" cy="50" rx="4.5" ry="10" {...p('triceps')} />
      {/* antebrazos */}
      <ellipse cx="33" cy="79" rx="4" ry="13" {...p('forearms')} />
      <ellipse cx="87" cy="79" rx="4" ry="13" {...p('forearms')} />
      {/* glúteos */}
      <ellipse cx="53" cy="88" rx="7" ry="9" {...p('glutes')} />
      <ellipse cx="67" cy="88" rx="7" ry="9" {...p('glutes')} />
      {/* isquios */}
      <ellipse cx="52.5" cy="130" rx="5.5" ry="22" {...p('hamstrings')} />
      <ellipse cx="67.5" cy="130" rx="5.5" ry="22" {...p('hamstrings')} />
      {/* gemelos */}
      <ellipse cx="53" cy="180" rx="4.5" ry="17" {...p('calves')} />
      <ellipse cx="67" cy="180" rx="4.5" ry="17" {...p('calves')} />
    </svg>
  )
}

export function BodyMap({ muscles }: { muscles: MuscleInsight[] }) {
  const p = makePainter(muscles)

  return (
    <div className="flex h-56 items-stretch justify-center gap-6">
      <div className="flex flex-col items-center">
        <FrontFigure p={p} />
        <span className="mt-1 text-[10px] uppercase tracking-wider text-ink-faint">Frente</span>
      </div>
      <div className="flex flex-col items-center">
        <BackFigure p={p} />
        <span className="mt-1 text-[10px] uppercase tracking-wider text-ink-faint">Espalda</span>
      </div>
    </div>
  )
}
