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
import type { MuscleInsight, MusclePriority, MuscleZone, ReadinessInsight } from '@shared/types'

// ── Reglas ejercicio → músculos ──────────────────────────────────────────
// Primer match gana — el orden importa (leg curl antes que curl, romanian
// antes que deadlift, lateral raise antes que row, etc.). El peso es la
// implicación: 1 = motor principal, 0.5 = sinergista, 0.25 = estabilizador.
const MUSCLE_RULES: [RegExp, [string, number][]][] = [
  [/leg curl|nordic|ham curl|glute ham raise/i, [['hamstrings', 1]]],
  [/romanian deadlift|rdl|good morning/i, [['hamstrings', 1], ['glutes', 0.5], ['erectors', 0.5]]],
  [/back extension|hyperextension|reverse hyper/i, [['erectors', 1], ['glutes', 0.5], ['hamstrings', 0.5]]],
  [/pull through/i, [['glutes', 1], ['hamstrings', 0.5]]],
  [/deadlift/i, [['glutes', 1], ['hamstrings', 1], ['erectors', 0.75], ['upper_back', 0.5], ['forearms', 0.5]]],
  [/leg extension|sissy squat/i, [['quads', 1]]],
  [/leg press/i, [['quads', 1], ['glutes', 0.5], ['adductors', 0.25]]],
  [/hip thrust|glute bridge|glute kickback|hip abduction|abductor/i, [['glutes', 1]]],
  [/adduction|adductor|copenhagen/i, [['adductors', 1]]],
  [/squat|lunge|split squat|step up/i, [['quads', 1], ['glutes', 0.5], ['adductors', 0.25]]],
  [/swing/i, [['glutes', 1], ['hamstrings', 0.5], ['erectors', 0.5]]],
  [/calf|soleus/i, [['calves', 1]]],
  [/bench|chest|butterfly|pec deck|dip|push up|chest fly/i, [['chest', 1], ['triceps', 0.5], ['shoulders', 0.25]]],
  [/face pull|rear delt|reverse fly|reverse pec/i, [['rear_delts', 1], ['upper_back', 0.5], ['traps', 0.25]]],
  [/lateral raise|side raise|upright row/i, [['shoulders', 1], ['traps', 0.25]]],
  [/overhead press|arnold|shoulder press|military/i, [['shoulders', 1], ['triceps', 0.5], ['upper_back', 0.25]]],
  [/pull up|chin up|pulldown|pullover/i, [['lats', 1], ['biceps', 0.5], ['upper_back', 0.25]]],
  [/row/i, [['upper_back', 1], ['lats', 0.5], ['biceps', 0.5], ['rear_delts', 0.25]]],
  [/shrug/i, [['traps', 1]]],
  [/skullcrusher|triceps|pushdown|overhead extension/i, [['triceps', 1]]],
  [/curl/i, [['biceps', 1], ['forearms', 0.5]]],
  [/ab wheel|crunch|pallof|sit up|plank|leg raise|woodchop|hollow/i, [['core', 1]]],
  [/dead hang|farmer|suitcase|wrist|grip/i, [['forearms', 1], ['traps', 0.5], ['core', 0.5]]],
]

export function musclesFor(exercise: string): [string, number][] {
  for (const [re, groups] of MUSCLE_RULES) {
    if (re.test(exercise)) return groups
  }
  return []
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
 * Objetivo semanal según prioridad. 'maintain' apunta al MEV (sostener sin
 * gastar recuperación), 'grow' al MAV (la zona productiva) y 'aggressive' al
 * punto medio entre MAV y MRV — alto, pero todavía recuperable.
 */
export function targetFor(d: MuscleDef, p: MusclePriority): number {
  if (p === 'aggressive') return Math.round((d.mav + d.mrv) / 2)
  if (p === 'grow') return d.mav
  return d.mev
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
    const names = top.map((m) => `${m.label} (faltan ${Math.round((m.targetSets - m.sets7d) * 10) / 10})`)
    suggestion = `Fresco y con déficit: ${names.join(' · ')}.`
  }

  return { score, ready: ready.map((m) => m.label), recovering, suggestion }
}
