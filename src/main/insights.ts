// Insights del dashboard: e1RM/meet, mapa muscular, tonelaje, PRs y
// correlaciones. Todo se calcula del cache de Hevy (que ya persiste los sets
// completos) + el CSV — cero requests extra.
import type { HevyWorkout } from './store'
import type { LogRow } from './store'
import { loadSettings, type MeetLifts } from './settings'
import { logicalToday, addDays, daysBetween, weekdayOf } from './logic'
import {
  KG_TO_LBS, e1rmLbs, bestE1rm, workingSets, trendSlope, type DatedSet,
} from './lifting'
import { buildMuscles, buildReadiness } from './muscles'
import { buildStrength } from './strength'
import { DOW_NAMES } from '@shared/schema'
import type {
  Insights, MeetInsight, LiftProgress, PaceStatus, MuscleInsight,
  VolumeInsight, WeekVolume, PrInsight, Finding,
} from '@shared/types'

// ── Meet ─────────────────────────────────────────────────────────────────
const LIFT_TITLES: Record<keyof MeetLifts, string[]> = {
  squat: ['squat (barbell)'],
  bench: ['bench press (barbell)'],
  deadlift: ['deadlift (barbell)'],
}
const LIFT_LABELS: Record<keyof MeetLifts, string> = {
  squat: 'Squat', bench: 'Bench', deadlift: 'Deadlift',
}

function paceStatus(diff: number | null, tolerance: number): PaceStatus {
  if (diff === null) return 'nodata'
  if (diff > tolerance) return 'ahead'
  if (diff < -tolerance) return 'behind'
  return 'ontrack'
}

/**
 * Serie de FUERZA PICO del lift: en cada sesión, el mejor e1RM de la ventana
 * móvil de 21 días. El best por sesión crudo mete ruido falso — los días de
 * velocidad/volumen del programa (squat 3×8 @105, bench 3×5 @95) hunden la
 * línea aunque la fuerza no bajó. La ventana los absorbe.
 */
function liftHistory(sets: DatedSet[], titles: Set<string>): { date: string; e1rmLbs: number }[] {
  const byDate = new Map<string, number>()
  for (const s of sets) {
    if (!titles.has(s.exercise.toLowerCase())) continue
    const v = e1rmLbs(s.weightKg, s.reps, s.rpe)
    if (v === null) continue
    const prev = byDate.get(s.date)
    if (prev === undefined || v > prev) byDate.set(s.date, v)
  }
  const sessions = [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  return sessions
    .map(([date]) => {
      let best = 0
      for (const [d2, v2] of sessions) {
        if (d2 > date) break
        if (daysBetween(date, d2) <= 21) best = Math.max(best, v2)
      }
      return { date, e1rmLbs: Math.round(best) }
    })
    .slice(-30)
}

function buildMeet(sets: DatedSet[]): MeetInsight {
  const m = loadSettings().meet
  const today = logicalToday()
  const configured = Boolean(m.date) && Object.values(m.targets).some((t) => t > 0)
  const daysLeft = m.date ? Math.max(0, daysBetween(m.date, today)) : 0
  const weeksLeft = Math.max(daysLeft / 7, 0.1)

  const lifts: LiftProgress[] = (Object.keys(LIFT_TITLES) as (keyof MeetLifts)[]).map((key) => {
    const titles = new Set(LIFT_TITLES[key])
    // forma reciente: últimos 21 días; si no tocaste el lift, ampliar a 45
    const current =
      bestE1rm(sets, titles, addDays(today, -21), today) ??
      bestE1rm(sets, titles, addDays(today, -45), today)
    const cur = current !== null ? Math.round(current) : null
    const target = m.targets[key]
    const history = liftHistory(sets, titles)

    // Todo mira HACIA ADELANTE desde hoy: cuánto hay que ganar por semana
    // (needed) vs cuánto se viene ganando (trend); la proyección es la
    // tendencia extendida hasta el día del meet, acotada a rango sano.
    const needed = cur !== null && target > 0 && daysLeft > 0
      ? Math.round(((target - cur) / weeksLeft) * 10) / 10
      : null
    const slope = trendSlope(history)
    const trendWk = slope !== null ? Math.round(slope * 7 * 10) / 10 : null

    let projected: number | null = null
    if (cur !== null && slope !== null && daysLeft > 0) {
      const raw = cur + slope * daysLeft
      projected = Math.round(Math.max(cur * 0.7, Math.min(raw, Math.max(target, cur) * 1.25)))
    }

    let status: PaceStatus = 'nodata'
    if (cur !== null && target > 0) {
      if (cur >= target) status = 'ahead'
      else if (projected !== null) status = paceStatus(projected - target, 5)
      // sin tendencia todavía → nodata (el chip lo explica)
    }

    return {
      key, label: LIFT_LABELS[key],
      currentLbs: cur, targetLbs: target,
      neededPerWeek: needed, trendPerWeek: trendWk,
      projectedLbs: projected, status, history,
    }
  })

  const scored = lifts.filter((l) => l.targetLbs > 0)
  const allHaveData = scored.length > 0 && scored.every((l) => l.currentLbs !== null)
  const totalCurrent = allHaveData ? scored.reduce((a, l) => a + (l.currentLbs ?? 0), 0) : null
  const totalTarget = scored.reduce((a, l) => a + l.targetLbs, 0)
  const totalProjected = allHaveData && scored.every((l) => l.projectedLbs !== null || (l.currentLbs ?? 0) >= l.targetLbs)
    ? scored.reduce((a, l) => a + (l.projectedLbs ?? l.currentLbs ?? 0), 0)
    : null

  return {
    configured,
    name: m.name, date: m.date, weightClass: m.weightClass, daysLeft,
    lifts,
    totalCurrentLbs: totalCurrent,
    totalTargetLbs: totalTarget,
    totalProjectedLbs: totalProjected,
    status: totalProjected !== null ? paceStatus(totalProjected - totalTarget, 15) : 'nodata',
  }
}

// ── Volumen semanal ──────────────────────────────────────────────────────
function mondayOf(dateIso: string): string {
  return addDays(dateIso, -weekdayOf(dateIso))
}

function buildVolume(sets: DatedSet[]): VolumeInsight {
  const today = logicalToday()
  const thisMonday = mondayOf(today)

  const tonnage = new Map<string, number>()
  const sessions = new Map<string, Set<string>>()
  for (const s of sets) {
    const wk = mondayOf(s.date)
    tonnage.set(wk, (tonnage.get(wk) ?? 0) + s.weightKg * s.reps * KG_TO_LBS)
    if (!sessions.has(wk)) sessions.set(wk, new Set())
    sessions.get(wk)!.add(s.date)
  }

  const oldest = sets.length ? mondayOf(sets.reduce((a, s) => (s.date < a ? s.date : a), today)) : thisMonday
  const weeks: WeekVolume[] = []
  for (let i = 7; i >= 0; i--) {
    const wk = addDays(thisMonday, -7 * i)
    if (wk < oldest) continue // el cache solo cubre ~2 meses; no pintar ceros falsos
    weeks.push({
      weekStart: wk,
      tonnageLbs: Math.round(tonnage.get(wk) ?? 0),
      sessions: sessions.get(wk)?.size ?? 0,
    })
  }

  const thisWeek = Math.round(tonnage.get(thisMonday) ?? 0)
  const prev = weeks.filter((w) => w.weekStart !== thisMonday).slice(-4)
  const avg4 = prev.length >= 2
    ? Math.round(prev.reduce((a, w) => a + w.tonnageLbs, 0) / prev.length)
    : null
  const pctVsAvg = avg4 && avg4 > 0 ? Math.round(((thisWeek - avg4) / avg4) * 100) : null

  return { weeks, thisWeekLbs: thisWeek, avg4Lbs: avg4, pctVsAvg }
}

// ── PRs recientes ────────────────────────────────────────────────────────
function buildPrs(sets: DatedSet[]): PrInsight[] {
  const today = logicalToday()
  const recentFrom = addDays(today, -13)
  const prevFrom = addDays(today, -90)

  const recent = new Map<string, { e1rm: number; date: string }>()
  const prevBest = new Map<string, number>()

  for (const s of sets) {
    const v = e1rmLbs(s.weightKg, s.reps, s.rpe)
    if (v === null) continue
    if (s.date >= recentFrom) {
      const r = recent.get(s.exercise)
      if (!r || v > r.e1rm) recent.set(s.exercise, { e1rm: v, date: s.date })
    } else if (s.date >= prevFrom) {
      prevBest.set(s.exercise, Math.max(prevBest.get(s.exercise) ?? 0, v))
    }
  }

  const prs: PrInsight[] = []
  for (const [ex, r] of recent) {
    const prev = prevBest.get(ex)
    if (prev === undefined || r.e1rm <= prev + 0.5) continue
    prs.push({
      exercise: ex,
      e1rmLbs: Math.round(r.e1rm),
      prevLbs: Math.round(prev),
      date: r.date,
    })
  }
  return prs
    .sort((a, b) => (b.e1rmLbs - b.prevLbs) / b.prevLbs - (a.e1rmLbs - a.prevLbs) / a.prevLbs)
    .slice(0, 3)
}

// ── Correlaciones del CSV ────────────────────────────────────────────────
function wentRate(rows: LogRow[]): number {
  return rows.filter((r) => String(r.went).trim() === '1').length / rows.length
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`
}

function buildFindings(
  log: Map<string, LogRow>,
  volume: VolumeInsight,
  muscles: MuscleInsight[],
): Finding[] {
  const resolved = [...log.values()].filter((r) => ['0', '1'].includes(String(r.went).trim()))
  const findings: Finding[] = []

  // Hipertrofia: lo que marcaste para crecer y no llega al umbral que la
  // dispara — el hallazgo más accionable que hay, va primero.
  const priority = muscles.filter((m) => m.priority !== 'maintain')
  const underMev = priority.filter((m) => m.sets7d < m.mev)
  const over = muscles.filter((m) => m.zone === 'over')
  if (underMev.length > 0) {
    findings.push({
      text: `${underMev.map((m) => m.label).join(', ')} está por debajo de su umbral de hipertrofia (MEV) esta semana — a ese volumen mantienes, no creces.`,
      tone: 'warn',
    })
  } else if (over.length > 0) {
    findings.push({
      text: `${over.map((m) => m.label).join(', ')} pasó su volumen máximo recuperable — más series ahí solo suman fatiga.`,
      tone: 'warn',
    })
  } else if (priority.length > 0) {
    const inZone = priority.filter((m) => m.zone === 'growth' || m.zone === 'optimal')
    if (inZone.length > 0) {
      findings.push({
        text: `${inZone.map((m) => m.label).join(', ')} en zona de hipertrofia esta semana — el estímulo está donde lo pediste.`,
        tone: 'ok',
      })
    }
  }

  // Sueño vs asistencia
  const withSleep = resolved.filter((r) => Number.isFinite(parseFloat(r.sleep_hours ?? '')))
  const good = withSleep.filter((r) => parseFloat(r.sleep_hours) >= 7)
  const bad = withSleep.filter((r) => parseFloat(r.sleep_hours) < 6.5)
  if (good.length >= 5 && bad.length >= 5) {
    const g = wentRate(good)
    const b = wentRate(bad)
    findings.push({
      text: `Con ≥7h de sueño entrenas el ${pct(g)} de los días; con <6.5h ${b < g ? 'cae a' : 'sube a'} ${pct(b)}.`,
      tone: g - b >= 0.15 ? 'warn' : 'info',
    })
  }

  // Día de la semana más/menos fiable
  const byDow = new Map<number, LogRow[]>()
  for (const r of resolved) {
    const wd = weekdayOf(r.date)
    if (!byDow.has(wd)) byDow.set(wd, [])
    byDow.get(wd)!.push(r)
  }
  const dowRates = [...byDow.entries()]
    .filter(([, rows]) => rows.length >= 3)
    .map(([wd, rows]) => ({ wd, rate: wentRate(rows), n: rows.length }))
    .sort((a, b) => b.rate - a.rate)
  if (dowRates.length >= 3) {
    const best = dowRates[0]
    const worst = dowRates[dowRates.length - 1]
    findings.push({
      text: `Tu día más fiable es ${DOW_NAMES[best.wd]} (${pct(best.rate)}); el más flojo, ${DOW_NAMES[worst.wd]} (${pct(worst.rate)}).`,
      tone: worst.rate < 0.4 ? 'warn' : 'info',
    })
  }

  // Energía declarada vs asistencia
  const withEnergy = resolved.filter((r) => Number.isFinite(parseInt(r.energy ?? '', 10)))
  const hi = withEnergy.filter((r) => parseInt(r.energy, 10) >= 4)
  const lo = withEnergy.filter((r) => parseInt(r.energy, 10) <= 3)
  if (hi.length >= 5 && lo.length >= 5) {
    findings.push({
      text: `Energía ≥4 en el check-in → entrenas el ${pct(wentRate(hi))}; con ≤3 → ${pct(wentRate(lo))}.`,
      tone: 'info',
    })
  }

  // Tendencia de volumen (siempre disponible con datos de Hevy)
  if (findings.length < 3 && volume.pctVsAvg !== null) {
    findings.push({
      text: volume.pctVsAvg >= 0
        ? `Volumen de esta semana va ${volume.pctVsAvg}% por encima de tu promedio de 4 semanas.`
        : `Volumen de esta semana va ${Math.abs(volume.pctVsAvg)}% por debajo de tu promedio de 4 semanas.`,
      tone: volume.pctVsAvg < -30 ? 'warn' : 'ok',
    })
  }

  if (findings.length === 0) {
    findings.push({
      text: 'Aún no hay historial suficiente para correlaciones — sigue haciendo el check-in diario.',
      tone: 'info',
    })
  }
  return findings.slice(0, 3)
}

// ── API ──────────────────────────────────────────────────────────────────
export function buildInsights(workouts: HevyWorkout[], log: Map<string, LogRow>): Insights {
  const sets = workingSets(workouts)
  const volume = buildVolume(sets)
  const muscles = buildMuscles(sets)
  return {
    meet: buildMeet(sets),
    muscles,
    readiness: buildReadiness(muscles),
    strength: buildStrength(sets),
    volume,
    prs: buildPrs(sets),
    findings: buildFindings(log, volume, muscles),
  }
}
