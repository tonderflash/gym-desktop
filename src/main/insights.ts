// Insights del dashboard: e1RM/meet, mapa muscular, tonelaje, PRs y
// correlaciones. Todo se calcula del cache de Hevy (que ya persiste los sets
// completos) + el CSV — cero requests extra.
import type { HevyWorkout } from './store'
import type { LogRow } from './store'
import { loadSettings, type MeetLifts } from './settings'
import { logicalToday, logicalDateFromDt, addDays, daysBetween, weekdayOf } from './logic'
import { DOW_NAMES } from '@shared/schema'
import type {
  Insights, MeetInsight, LiftProgress, PaceStatus, MuscleInsight,
  VolumeInsight, WeekVolume, PrInsight, Finding,
} from '@shared/types'

const KG_TO_LBS = 2.2046226218

// ── e1RM ─────────────────────────────────────────────────────────────────
/**
 * e1RM estilo Epley pero con reps EFECTIVAS = reps + RIR (si el set trae RPE),
 * como manda el programa ("por RIR, no Epley inflado"). Sets de >8 reps no
 * estiman fuerza → se descartan.
 */
function e1rmLbs(weightKg: number, reps: number, rpe: number | null | undefined): number | null {
  if (!(weightKg > 0) || !(reps > 0) || reps > 8) return null
  const rir = typeof rpe === 'number' && rpe >= 5 && rpe <= 10 ? 10 - rpe : 0
  const eff = Math.min(reps + rir, 12)
  const kg = eff <= 1 ? weightKg : weightKg * (1 + eff / 30)
  return kg * KG_TO_LBS
}

interface DatedSet {
  date: string
  exercise: string
  weightKg: number
  reps: number
  rpe: number | null
  type: string
}

/** Aplana el cache a sets de trabajo fechados (excluye warmups y sets vacíos). */
function workingSets(workouts: HevyWorkout[]): DatedSet[] {
  const out: DatedSet[] = []
  for (const w of workouts) {
    if (!w.start_time) continue
    const dt = new Date(w.start_time)
    if (Number.isNaN(dt.getTime())) continue
    const date = logicalDateFromDt(dt)
    for (const ex of w.exercises ?? []) {
      const title = (ex.title ?? '').trim()
      if (!title) continue
      for (const s of ex.sets ?? []) {
        const type = s.type ?? 'normal'
        if (type === 'warmup') continue
        const weightKg = s.weight_kg ?? 0
        const reps = s.reps ?? 0
        if (!(weightKg > 0) || !(reps > 0)) continue
        out.push({ date, exercise: title, weightKg, reps, rpe: s.rpe ?? null, type })
      }
    }
  }
  return out
}

function bestE1rm(sets: DatedSet[], titles: Set<string>, from: string, to: string): number | null {
  let best: number | null = null
  for (const s of sets) {
    if (s.date < from || s.date > to) continue
    if (!titles.has(s.exercise.toLowerCase())) continue
    const v = e1rmLbs(s.weightKg, s.reps, s.rpe)
    if (v !== null && (best === null || v > best)) best = v
  }
  return best
}

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

function buildMeet(sets: DatedSet[]): MeetInsight {
  const m = loadSettings().meet
  const today = logicalToday()
  const daysLeft = daysBetween(m.date, today)
  const span = Math.max(1, daysBetween(m.date, m.baselineDate))
  const elapsed = Math.min(span, Math.max(0, daysBetween(today, m.baselineDate)))

  const lifts: LiftProgress[] = (Object.keys(LIFT_TITLES) as (keyof MeetLifts)[]).map((key) => {
    const titles = new Set(LIFT_TITLES[key])
    // forma reciente: últimos 21 días; si no tocaste el lift, ampliar a 45
    const current =
      bestE1rm(sets, titles, addDays(today, -21), today) ??
      bestE1rm(sets, titles, addDays(today, -45), today)
    const baseline = m.baseline[key]
    const target = m.targets[key]
    const expected = Math.round((baseline + ((target - baseline) * elapsed) / span) * 10) / 10
    const cur = current !== null ? Math.round(current) : null
    const diff = cur !== null ? Math.round((cur - expected) * 10) / 10 : null
    return {
      key, label: LIFT_LABELS[key],
      currentLbs: cur, expectedLbs: expected,
      targetLbs: target, baselineLbs: baseline,
      diffLbs: diff, status: paceStatus(diff, 7.5),
    }
  })

  const allHaveData = lifts.every((l) => l.currentLbs !== null)
  const totalCurrent = allHaveData ? lifts.reduce((a, l) => a + (l.currentLbs ?? 0), 0) : null
  const totalExpected = Math.round(lifts.reduce((a, l) => a + l.expectedLbs, 0))
  const totalTarget = lifts.reduce((a, l) => a + l.targetLbs, 0)
  const totalBaseline = lifts.reduce((a, l) => a + l.baselineLbs, 0)
  const totalDiff = totalCurrent !== null ? totalCurrent - totalExpected : null

  return {
    name: m.name, date: m.date, weightClass: m.weightClass, daysLeft,
    lifts,
    totalCurrentLbs: totalCurrent,
    totalExpectedLbs: totalExpected,
    totalTargetLbs: totalTarget,
    totalBaselineLbs: totalBaseline,
    status: paceStatus(totalDiff, 15),
  }
}

// ── Mapa muscular ────────────────────────────────────────────────────────
// Primer match gana — el orden importa (leg curl antes que curl, romanian
// antes que deadlift, lateral raise antes que row, etc.)
const MUSCLE_RULES: [RegExp, [string, number][]][] = [
  [/leg curl/i, [['hamstrings', 1]]],
  [/romanian deadlift/i, [['hamstrings', 1], ['glutes', 0.5]]],
  [/deadlift/i, [['glutes', 1], ['hamstrings', 1], ['back', 0.5], ['forearms', 0.5]]],
  [/leg press/i, [['quads', 1], ['glutes', 0.5]]],
  [/squat|lunge/i, [['quads', 1], ['glutes', 0.5]]],
  [/hip thrust/i, [['glutes', 1]]],
  [/swing/i, [['glutes', 1], ['hamstrings', 0.5]]],
  [/calf/i, [['calves', 1]]],
  [/bench|chest|butterfly|pec deck|dip/i, [['chest', 1], ['triceps', 0.5], ['shoulders', 0.25]]],
  [/face pull|rear delt|reverse fly/i, [['shoulders', 1], ['traps', 0.25]]],
  [/lateral raise/i, [['shoulders', 1]]],
  [/overhead press|arnold|shoulder press/i, [['shoulders', 1], ['triceps', 0.5]]],
  [/pull up|pulldown|row/i, [['back', 1], ['biceps', 0.5]]],
  [/shrug/i, [['traps', 1]]],
  [/skullcrusher|triceps|pushdown/i, [['triceps', 1]]],
  [/curl/i, [['biceps', 1]]],
  [/ab wheel|crunch|pallof|sit up|plank/i, [['core', 1]]],
  [/dead hang|farmer|suitcase/i, [['forearms', 1], ['traps', 0.5], ['core', 0.5]]],
]

// Objetivos semanales del programa balanceado (series por grupo).
const MUSCLE_GROUPS: { key: string; label: string; target: number }[] = [
  { key: 'quads', label: 'Cuádriceps', target: 10 },
  { key: 'hamstrings', label: 'Isquios', target: 9 },
  { key: 'glutes', label: 'Glúteos', target: 6 },
  { key: 'chest', label: 'Pecho', target: 13 },
  { key: 'back', label: 'Espalda', target: 10 },
  { key: 'shoulders', label: 'Hombros', target: 13 },
  { key: 'biceps', label: 'Bíceps', target: 7 },
  { key: 'triceps', label: 'Tríceps', target: 3 },
  { key: 'calves', label: 'Gemelos', target: 6 },
  { key: 'core', label: 'Core', target: 6 },
  { key: 'traps', label: 'Trapecios', target: 3 },
  { key: 'forearms', label: 'Agarre', target: 3 },
]

function musclesFor(exercise: string): [string, number][] {
  for (const [re, groups] of MUSCLE_RULES) {
    if (re.test(exercise)) return groups
  }
  return []
}

function buildMuscles(sets: DatedSet[]): MuscleInsight[] {
  const today = logicalToday()
  const weekAgo = addDays(today, -6)
  const vol = new Map<string, number>()
  const last = new Map<string, string>()

  for (const s of sets) {
    for (const [g, w] of musclesFor(s.exercise)) {
      if (s.date >= weekAgo) vol.set(g, (vol.get(g) ?? 0) + w)
      const prev = last.get(g)
      if (!prev || s.date > prev) last.set(g, s.date)
    }
  }

  return MUSCLE_GROUPS.map((g) => ({
    key: g.key,
    label: g.label,
    sets7d: Math.round((vol.get(g.key) ?? 0) * 10) / 10,
    targetSets: g.target,
    lastDaysAgo: last.has(g.key) ? daysBetween(today, last.get(g.key)!) : null,
  }))
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

function buildFindings(log: Map<string, LogRow>, volume: VolumeInsight): Finding[] {
  const resolved = [...log.values()].filter((r) => ['0', '1'].includes(String(r.went).trim()))
  const findings: Finding[] = []

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
  return {
    meet: buildMeet(sets),
    muscles: buildMuscles(sets),
    volume,
    prs: buildPrs(sets),
    findings: buildFindings(log, volume),
  }
}
