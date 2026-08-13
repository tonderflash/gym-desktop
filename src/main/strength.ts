// Fuerza máxima: qué 1RM tienes HOY por ejercicio, de dónde sale ese número y
// hasta dónde llega si la tendencia se mantiene.
//
// Un e1RM no vale lo mismo según de dónde salga: un triple a RPE 9 predice tu
// máximo mucho mejor que un 8×8 fácil. Por eso cada entrada carga su serie
// fuente y una confianza explícita — el número solo, sin contexto, miente.
import { logicalToday, addDays, daysBetween } from './logic'
import { e1rmLbs, trendSlope, KG_TO_LBS, type DatedSet } from './lifting'
import type { OneRmEntry, StrengthInsight } from '@shared/types'

const BIG3 = [/^squat \(barbell\)$/i, /^bench press \(barbell\)$/i, /^deadlift \(barbell\)$/i]

/** Porcentajes de trabajo útiles del día: pesado, hipertrofia y velocidad. */
const WORK_PCTS = [90, 80, 70]

function confidenceOf(reps: number, rpe: number | null, daysAgo: number): 'low' | 'med' | 'high' {
  if (daysAgo > 30) return 'low'
  if (reps <= 3 && (rpe === null || rpe >= 8)) return 'high'
  if (reps <= 5) return 'med'
  return 'low'
}

interface Best {
  e1rm: number
  weightKg: number
  reps: number
  rpe: number | null
  date: string
}

function betterOf(a: Best | undefined, b: Best): Best {
  return !a || b.e1rm > a.e1rm ? b : a
}

/** Mejor e1RM por sesión, ASC — insumo de la tendencia. */
function sessionSeries(rows: Best[]): { date: string; e1rmLbs: number }[] {
  const byDate = new Map<string, number>()
  for (const r of rows) {
    const prev = byDate.get(r.date)
    if (prev === undefined || r.e1rm > prev) byDate.set(r.date, r.e1rm)
  }
  return [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, v]) => ({ date, e1rmLbs: Math.round(v) }))
}

export function buildStrength(sets: DatedSet[]): StrengthInsight {
  const today = logicalToday()
  // ventana "actual": 45 días. Más viejo que eso ya no describe tu fuerza de
  // hoy — se muestra igual, pero marcado como baja confianza.
  const recentFrom = addDays(today, -45)

  const byExercise = new Map<string, Best[]>()
  for (const s of sets) {
    const v = e1rmLbs(s.weightKg, s.reps, s.rpe)
    if (v === null) continue
    const row: Best = { e1rm: v, weightKg: s.weightKg, reps: s.reps, rpe: s.rpe, date: s.date }
    const arr = byExercise.get(s.exercise)
    if (arr) arr.push(row)
    else byExercise.set(s.exercise, [row])
  }

  const lifts: OneRmEntry[] = []
  for (const [exercise, rows] of byExercise) {
    let current: Best | undefined
    let allTime: Best | undefined
    for (const r of rows) {
      allTime = betterOf(allTime, r)
      if (r.date >= recentFrom) current = betterOf(current, r)
    }
    // sin nada reciente, la referencia es tu mejor marca del cache
    const src = current ?? allTime
    if (!src || !allTime) continue

    const daysAgo = daysBetween(today, src.date)
    const e1rm = Math.round(src.e1rm)
    const slope = trendSlope(sessionSeries(rows))
    const trendWk = slope !== null ? Math.round(slope * 7 * 10) / 10 : null
    // techo realista a 4 semanas: la tendencia extendida, acotada a +15%
    const potential = slope !== null
      ? Math.round(Math.max(e1rm, Math.min(e1rm + slope * 28, e1rm * 1.15)))
      : null

    lifts.push({
      exercise,
      e1rmLbs: e1rm,
      bestLbs: Math.round(allTime.e1rm),
      bestDate: allTime.date,
      confidence: confidenceOf(src.reps, src.rpe, daysAgo),
      source: {
        weightLbs: Math.round(src.weightKg * KG_TO_LBS),
        reps: src.reps,
        rpe: src.rpe,
        date: src.date,
        daysAgo,
      },
      trendPerWeek: trendWk,
      potentialLbs: potential,
      work: WORK_PCTS.map((pct) => ({ pct, lbs: Math.round((e1rm * pct) / 100 / 5) * 5 })),
      isBig3: BIG3.some((re) => re.test(exercise)),
    })
  }

  // básicos primero (son la referencia del programa), luego por e1RM
  lifts.sort((a, b) => {
    if (a.isBig3 !== b.isBig3) return a.isBig3 ? -1 : 1
    return b.e1rmLbs - a.e1rmLbs
  })

  const big3 = lifts.filter((l) => l.isBig3)
  return {
    lifts: lifts.slice(0, 10),
    totalBig3Lbs: big3.length === 3 ? big3.reduce((a, l) => a + l.e1rmLbs, 0) : null,
  }
}
