// Mapa muscular con umbrales de hipertrofia y recuperación.
//
// Tres ideas separadas que aquí se juntan:
//  1. UMBRALES (MEV/MAV/MRV): cuántas series efectivas por semana hacen falta
//     para que un músculo CREZCA, no solo se mantenga. Debajo del MEV el
//     trabajo sostiene tejido; entre MEV y MAV es donde ocurre la hipertrofia;
//     pasando el MRV acumulas fatiga que no vas a recuperar.
//  2. PRIORIDAD por músculo: no todo se hipertrofia a la vez. Lo que marcas
//     como 'aggressive' apunta alto en su rango; 'maintain' apunta al MEV.
//  3. RECUPERACIÓN: cuánto descanso pide cada músculo según lo que le metiste
//     la última vez — de ahí sale el readiness (¿está fresco o todavía no?).
import { logicalToday, addDays, daysBetween } from './logic'
import { loadSettings } from './settings'
import type { DatedSet } from './lifting'
import type {
  MuscleInsight, MusclePriority, MuscleZone, ReadinessInsight, UnmappedExercise,
} from '@shared/types'

// ── Reglas ejercicio → músculos ──────────────────────────────────────────
// Primer match gana — el orden importa y es la fuente de casi todos los
// errores de conteo. Reglas específicas ARRIBA de las genéricas: "wrist curl"
// antes que "curl" (si no, el antebrazo cuenta como bíceps), "triceps dip"
// antes que "dip" (si no, un fondo de tríceps cuenta como pecho), "leg curl"
// antes que "curl", "lateral raise" antes que "row" (por el upright row).
// El peso es la implicación: 1 = motor principal, 0.5 = sinergista,
// 0.25 = estabilizador.
const MUSCLE_RULES: [RegExp, [string, number][]][] = [
  // pierna — cadena posterior primero (romanian antes que deadlift)
  [/leg curl|nordic|ham curl|glute ham raise/i, [['hamstrings', 1]]],
  [/romanian deadlift|rdl|good morning/i, [['hamstrings', 1], ['glutes', 0.5], ['erectors', 0.5]]],
  [/back extension|hyperextension|reverse hyper/i, [['erectors', 1], ['glutes', 0.5], ['hamstrings', 0.5]]],
  [/pull through/i, [['glutes', 1], ['hamstrings', 0.5]]],
  [/deadlift/i, [['glutes', 1], ['hamstrings', 1], ['erectors', 0.75], ['upper_back', 0.5], ['forearms', 0.5]]],
  [/leg extension|sissy squat/i, [['quads', 1]]],
  // pliométricos: cuentan como estímulo de pierna aunque la carga sea el cuerpo
  [/leg press|jump/i, [['quads', 1], ['glutes', 0.5], ['adductors', 0.25]]],
  [/hip thrust|glute bridge|glute kickback|hip abduction|abductor/i, [['glutes', 1]]],
  [/adduction|adductor|copenhagen/i, [['adductors', 1]]],
  // el split squat carga más glúteo que un back squat: la pierna de atrás
  // trabaja en cadera, no en rodilla
  [/bulgarian|split squat|lunge|step up/i, [['quads', 1], ['glutes', 0.75], ['adductors', 0.25]]],
  [/squat/i, [['quads', 1], ['glutes', 0.5], ['adductors', 0.25]]],
  [/swing/i, [['glutes', 1], ['hamstrings', 0.5], ['erectors', 0.5]]],
  [/calf|soleus/i, [['calves', 1]]],
  // hombro posterior antes que cualquier regla de "fly" o de "row"
  [/face pull|rear delt|reverse fly|reverse pec/i, [['rear_delts', 1], ['upper_back', 0.5], ['traps', 0.25]]],
  // aislamiento de pecho: sin tríceps (el codo no se extiende)
  [/pec deck|butterfly|chest fly|cable fly|dumbbell fly|pec fly/i, [['chest', 1]]],
  // fondo de tríceps ≠ fondo de pecho: el dominante cambia con la inclinación
  [/triceps dip|tricep dip/i, [['triceps', 1], ['chest', 0.5]]],
  [/bench|chest|dip|push up/i, [['chest', 1], ['triceps', 0.5], ['shoulders', 0.25]]],
  [/lateral raise|side raise|upright row/i, [['shoulders', 1], ['traps', 0.25]]],
  [/overhead press|arnold|shoulder press|military/i, [['shoulders', 1], ['triceps', 0.5], ['upper_back', 0.25]]],
  [/pull up|chin up|pulldown|pullover/i, [['lats', 1], ['biceps', 0.5], ['upper_back', 0.25]]],
  [/row/i, [['upper_back', 1], ['lats', 0.5], ['biceps', 0.5], ['rear_delts', 0.25]]],
  [/shrug/i, [['traps', 1]]],
  [/skullcrusher|triceps|pushdown|overhead extension/i, [['triceps', 1]]],
  // muñeca/antebrazo ANTES de curl: un wrist curl no es trabajo de bíceps
  [/wrist curl|wrist extension|wrist flexion|forearm/i, [['forearms', 1]]],
  [/reverse curl/i, [['forearms', 1], ['biceps', 0.5]]],
  [/hammer curl|brachialis/i, [['biceps', 1], ['forearms', 0.5]]],
  [/curl/i, [['biceps', 1], ['forearms', 0.25]]],
  [/ab wheel|crunch|pallof|sit up|plank|leg raise|knee raise|woodchop|hollow/i, [['core', 1]]],
  [/dead hang|farmer|suitcase|grip/i, [['forearms', 1], ['traps', 0.5], ['core', 0.5]]],
]

/**
 * Cardio, movilidad y calentamiento: no suman a ningún músculo, pero tampoco
 * son un hueco del mapeo. Se declaran aparte para que el card no los reporte
 * como "series sin contar" — ese aviso tiene que significar algo.
 */
const NON_LIFTING =
  /walking|treadmill|running|jog|sprint|stationary bike|cycling|rowing machine|elliptical|stair|swim|stretch|mobility|foam roll|warm ?up|sauna|cardio/i

export function musclesFor(exercise: string): [string, number][] {
  for (const [re, groups] of MUSCLE_RULES) {
    if (re.test(exercise)) return groups
  }
  return []
}

export function isNonLifting(exercise: string): boolean {
  return NON_LIFTING.test(exercise)
}

// ── Catálogo: umbrales y recuperación por grupo ──────────────────────────
// mev/mav/mrv en SERIES EFECTIVAS por semana (literatura de landmarks de
// volumen). recovery = horas de recuperación de una sesión ESTÁNDAR de ese
// músculo (dosis ≈ su MEV); la dosis real lo escala abajo.
interface MuscleDef {
  key: string
  label: string
  side: 'front' | 'back' | 'both'
  mev: number
  mav: number
  mrv: number
  recovery: number
}

export const MUSCLE_DEFS: MuscleDef[] = [
  { key: 'quads', label: 'Cuádriceps', side: 'front', mev: 8, mav: 14, mrv: 20, recovery: 54 },
  { key: 'hamstrings', label: 'Isquios', side: 'back', mev: 6, mav: 13, mrv: 20, recovery: 54 },
  { key: 'glutes', label: 'Glúteos', side: 'back', mev: 4, mav: 12, mrv: 16, recovery: 44 },
  { key: 'adductors', label: 'Aductores', side: 'front', mev: 4, mav: 10, mrv: 16, recovery: 44 },
  { key: 'calves', label: 'Gemelos', side: 'back', mev: 8, mav: 14, mrv: 20, recovery: 28 },
  { key: 'erectors', label: 'Lumbares', side: 'back', mev: 4, mav: 8, mrv: 12, recovery: 64 },
  { key: 'lats', label: 'Dorsales', side: 'back', mev: 10, mav: 18, mrv: 25, recovery: 52 },
  { key: 'upper_back', label: 'Espalda alta', side: 'back', mev: 6, mav: 14, mrv: 20, recovery: 44 },
  { key: 'traps', label: 'Trapecios', side: 'both', mev: 4, mav: 12, mrv: 20, recovery: 32 },
  { key: 'chest', label: 'Pecho', side: 'front', mev: 8, mav: 16, mrv: 22, recovery: 44 },
  { key: 'shoulders', label: 'Hombros', side: 'both', mev: 8, mav: 18, mrv: 26, recovery: 36 },
  { key: 'rear_delts', label: 'Deltoide post.', side: 'back', mev: 6, mav: 14, mrv: 20, recovery: 28 },
  { key: 'biceps', label: 'Bíceps', side: 'front', mev: 8, mav: 16, mrv: 20, recovery: 32 },
  { key: 'triceps', label: 'Tríceps', side: 'back', mev: 6, mav: 14, mrv: 18, recovery: 32 },
  { key: 'core', label: 'Core', side: 'front', mev: 6, mav: 12, mrv: 20, recovery: 24 },
  { key: 'forearms', label: 'Agarre', side: 'both', mev: 4, mav: 10, mrv: 16, recovery: 24 },
]

export const MUSCLE_KEYS = MUSCLE_DEFS.map((m) => m.key)

/**
 * A dónde apuntar. Es SIEMPRE un landmark del músculo, nunca un número
 * derivado: 'maintain' apunta al MEV (el piso: debajo de ahí solo sostienes) y
 * 'grow'/'aggressive' apuntan al MAV (donde la evidencia de dosis-respuesta
 * pone el mejor retorno por unidad de fatiga).
 *
 * 'aggressive' NO inventa un objetivo más alto que 'grow'. La diferencia es de
 * atención, no de número: pesa más en el readiness global y manda en qué se
 * sugiere entrenar primero. Un objetivo intermedio entre MAV y MRV sería
 * precisión falsa — nadie midió ese punto.
 */
export function targetFor(d: MuscleDef, p: MusclePriority): number {
  return p === 'maintain' ? d.mev : d.mav
}

function zoneOf(sets: number, d: MuscleDef): MuscleZone {
  if (sets <= 0) return 'none'
  if (sets < d.mev) return 'below'
  if (sets < d.mav) return 'growth'
  if (sets <= d.mrv) return 'optimal'
  return 'over'
}

/**
 * Horas de descanso que pide el músculo tras esa sesión. Base por tamaño,
 * escalada por la DOSIS (series de esa sesión vs su MEV) y por la INTENSIDAD
 * (una serie a RPE≥9 o un pesado de ≤3 reps deja más daño que un 3×12 suave).
 */
export function recoveryHoursFor(d: MuscleDef, sessionSets: number, hard: boolean): number {
  // dosis 1 = una sesión típica de ese músculo (≈ la mitad de su MEV semanal).
  // La raíz aplana la curva: el doble de series NO pide el doble de descanso.
  const typical = Math.max(1, d.mev / 2)
  const dose = Math.sqrt(Math.max(0, sessionSets) / typical)
  const scaled = d.recovery * Math.max(0.5, Math.min(0.55 + 0.45 * dose, 1.5))
  return Math.round(scaled * (hard ? 1.15 : 1))
}

interface LastBout {
  date: string
  ts: number
  sets: number
  hard: boolean
}

/** Prioridades del usuario, con default para las keys que falten. */
function priorities(): Record<string, MusclePriority> {
  const saved = loadSettings().musclePriorities ?? {}
  const out: Record<string, MusclePriority> = {}
  for (const d of MUSCLE_DEFS) {
    const v = saved[d.key]
    out[d.key] = v === 'grow' || v === 'aggressive' || v === 'maintain' ? v : 'maintain'
  }
  return out
}

export function buildMuscles(sets: DatedSet[], now = Date.now()): MuscleInsight[] {
  const today = logicalToday()
  const weekAgo = addDays(today, -6)
  const prio = priorities()

  const vol = new Map<string, number>()
  const last = new Map<string, LastBout>()

  for (const s of sets) {
    const hardSet = (typeof s.rpe === 'number' && s.rpe >= 9) || s.reps <= 3
    for (const [g, w] of musclesFor(s.exercise)) {
      if (s.date >= weekAgo) vol.set(g, (vol.get(g) ?? 0) + w)
      const prev = last.get(g)
      if (!prev || s.date > prev.date) {
        last.set(g, { date: s.date, ts: s.ts, sets: w, hard: hardSet && w >= 0.5 })
      } else if (s.date === prev.date) {
        prev.sets += w
        prev.ts = Math.max(prev.ts, s.ts)
        prev.hard = prev.hard || (hardSet && w >= 0.5)
      }
    }
  }

  return MUSCLE_DEFS.map((d) => {
    const sets7d = Math.round((vol.get(d.key) ?? 0) * 10) / 10
    const bout = last.get(d.key)
    const p = prio[d.key]

    const recoveryHours = bout ? recoveryHoursFor(d, bout.sets, bout.hard) : null
    const hoursSince = bout ? Math.max(0, (now - bout.ts) / 3_600_000) : null
    const readiness = recoveryHours && hoursSince !== null
      ? Math.max(0, Math.min(1, hoursSince / recoveryHours))
      : 1

    return {
      key: d.key,
      label: d.label,
      side: d.side,
      sets7d,
      targetSets: targetFor(d, p),
      mev: d.mev,
      mav: d.mav,
      mrv: d.mrv,
      priority: p,
      zone: zoneOf(sets7d, d),
      lastDaysAgo: bout ? daysBetween(today, bout.date) : null,
      lastSessionSets: bout ? Math.round(bout.sets * 10) / 10 : 0,
      recoveryHours,
      hoursSince: hoursSince === null ? null : Math.round(hoursSince),
      readiness: Math.round(readiness * 100) / 100,
    }
  })
}

/**
 * Ejercicios de la ventana de 7 días que no cuentan para ningún músculo y
 * tampoco son cardio. Sin esto, un nombre nuevo en Hevy que ninguna regla
 * reconoce desaparece en silencio y el mapa se ve completo estando corto —
 * el modo de fallo más peligroso de todo el card.
 */
export function unmappedIn(sets: DatedSet[]): UnmappedExercise[] {
  const from = addDays(logicalToday(), -6)
  const counts = new Map<string, number>()
  for (const s of sets) {
    if (s.date < from) continue
    if (musclesFor(s.exercise).length > 0 || isNonLifting(s.exercise)) continue
    counts.set(s.exercise, (counts.get(s.exercise) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([exercise, setCount]) => ({ exercise, sets: setCount }))
    .sort((a, b) => b.sets - a.sets)
}

const PRIORITY_WEIGHT: Record<MusclePriority, number> = { aggressive: 3, grow: 2, maintain: 1 }

/**
 * Readiness global + qué toca. La sugerencia cruza dos cosas: qué está
 * recuperado y qué le falta volumen respecto a su objetivo — entrenar fresco
 * algo que ya cumplió su semana no es la mejor sesión disponible.
 */
export function buildReadiness(muscles: MuscleInsight[]): ReadinessInsight {
  let wsum = 0
  let acc = 0
  for (const m of muscles) {
    const w = PRIORITY_WEIGHT[m.priority]
    wsum += w
    acc += w * m.readiness
  }
  const score = wsum > 0 ? Math.round((acc / wsum) * 100) : 100

  const ready = muscles.filter((m) => m.readiness >= 1)
  const recovering = muscles
    .filter((m) => m.readiness < 1 && m.recoveryHours !== null && m.hoursSince !== null)
    .map((m) => ({
      key: m.key,
      label: m.label,
      hoursLeft: Math.max(1, Math.round(m.recoveryHours! - m.hoursSince!)),
      readiness: m.readiness,
    }))
    .sort((a, b) => a.hoursLeft - b.hoursLeft)

  // candidatos: recuperados y con déficit contra su objetivo, los prioritarios
  // primero y dentro de eso el que más lejos está de su meta
  const candidates = ready
    .filter((m) => m.sets7d < m.targetSets)
    .sort((a, b) => {
      const p = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority]
      if (p !== 0) return p
      return (b.targetSets - b.sets7d) - (a.targetSets - a.sets7d)
    })

  let suggestion: string
  if (candidates.length === 0 && recovering.length > 0) {
    const next = recovering[0]
    suggestion = `Todo lo pendiente está recuperándose — ${next.label} vuelve en ~${next.hoursLeft}h. Hoy toca descanso o técnica ligera.`
  } else if (candidates.length === 0) {
    suggestion = 'Todo recuperado y con el volumen de la semana cumplido — mantén o descansa.'
  } else {
    const top = candidates.slice(0, 3)
    const names = top.map((m) => {
      const gap = Math.round((m.targetSets - m.sets7d) * 10) / 10
      return `${m.label} (${gap} para el ${m.priority === 'maintain' ? 'MEV' : 'MAV'})`
    })
    suggestion = `Fresco y con volumen pendiente: ${names.join(' · ')}.`
  }

  return { score, ready: ready.map((m) => m.label), recovering, suggestion }
}
