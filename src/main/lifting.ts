// Núcleo de levantamiento compartido: aplanar el cache de Hevy a sets de
// trabajo fechados y estimar 1RM. Vive aparte porque insights, mapa muscular y
// fuerza máxima leen lo mismo — una sola definición de e1RM para toda la app.
import type { HevyWorkout } from './store'
import { logicalDateFromDt, daysBetween } from './logic'

export const KG_TO_LBS = 2.2046226218

/**
 * e1RM estilo Epley pero con reps EFECTIVAS = reps + RIR (si el set trae RPE),
 * como manda el programa ("por RIR, no Epley inflado"). Sets de >8 reps no
 * estiman fuerza → se descartan.
 */
export function e1rmLbs(weightKg: number, reps: number, rpe: number | null | undefined): number | null {
  if (!(weightKg > 0) || !(reps > 0) || reps > 8) return null
  const rir = typeof rpe === 'number' && rpe >= 5 && rpe <= 10 ? 10 - rpe : 0
  const eff = Math.min(reps + rir, 12)
  const kg = eff <= 1 ? weightKg : weightKg * (1 + eff / 30)
  return kg * KG_TO_LBS
}

export interface DatedSet {
  date: string
  /** epoch ms del FIN de la sesión — la fatiga se cuenta desde que saliste */
  ts: number
  exercise: string
  /** 0 en peso corporal: Hevy no guarda tu masa, solo la carga externa. */
  weightKg: number
  /** 0 en isométricos (plancha, dead hang) — ahí el esfuerzo es `durationSec`. */
  reps: number
  /** Segundos bajo tensión; 0 si el set se mide en reps. */
  durationSec: number
  rpe: number | null
  type: string
}

/** Aplana el cache a sets de trabajo fechados (excluye warmups y sets vacíos). */
export function workingSets(workouts: HevyWorkout[]): DatedSet[] {
  const out: DatedSet[] = []
  for (const w of workouts) {
    if (!w.start_time) continue
    const dt = new Date(w.start_time)
    if (Number.isNaN(dt.getTime())) continue
    const end = w.end_time ? new Date(w.end_time) : null
    const ts = end && !Number.isNaN(end.getTime()) && end > dt ? end.getTime() : dt.getTime()
    const date = logicalDateFromDt(dt)
    for (const ex of w.exercises ?? []) {
      const title = (ex.title ?? '').trim()
      if (!title) continue
      for (const s of ex.sets ?? []) {
        const type = s.type ?? 'normal'
        if (type === 'warmup') continue
        const weightKg = s.weight_kg ?? 0
        const reps = s.reps ?? 0
        const durationSec = s.duration_seconds ?? 0
        // Un set cuenta si hubo esfuerzo: reps (con carga externa o sin ella) o
        // tiempo bajo tensión. Exigir weight_kg > 0 borraba del mapa muscular
        // todo el trabajo corporal — dominadas, fondos, flexiones, remo
        // invertido y el core entero — porque Hevy guarda ese peso como null.
        // El e1RM no se contamina: e1rmLbs ya devuelve null sin carga.
        if (!(reps > 0) && !(durationSec > 0)) continue
        out.push({ date, ts, exercise: title, weightKg, reps, durationSec, rpe: s.rpe ?? null, type })
      }
    }
  }
  return out
}

export function bestE1rm(sets: DatedSet[], titles: Set<string>, from: string, to: string): number | null {
  let best: number | null = null
  for (const s of sets) {
    if (s.date < from || s.date > to) continue
    if (!titles.has(s.exercise.toLowerCase())) continue
    const v = e1rmLbs(s.weightKg, s.reps, s.rpe)
    if (v !== null && (best === null || v > best)) best = v
  }
  return best
}

// Ganancia plausible acotada: ±0.75 lb/día (~5 lb/semana, rápido pero posible
// en un regreso). Sin el cap, un single suelto proyecta números de fantasía.
export const MAX_SLOPE_LBS_PER_DAY = 0.75

/**
 * Pendiente de la tendencia reciente (regresión sobre las últimas ≤6 sesiones)
 * en lb/día. Exige ≥3 sesiones repartidas en ≥21 días — con menos, cualquier
 * recta es adivinanza. Señal direccional, no promesa.
 */
export function trendSlope(history: { date: string; e1rmLbs: number }[]): number | null {
  const pts = history.slice(-6)
  if (pts.length < 3) return null
  if (daysBetween(pts[pts.length - 1].date, pts[0].date) < 21) return null

  const x0 = pts[0].date
  const xs = pts.map((p) => daysBetween(p.date, x0))
  const ys = pts.map((p) => p.e1rmLbs)
  const n = xs.length
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my)
    den += (xs[i] - mx) ** 2
  }
  if (den === 0) return null
  return Math.max(-MAX_SLOPE_LBS_PER_DAY, Math.min(num / den, MAX_SLOPE_LBS_PER_DAY))
}
