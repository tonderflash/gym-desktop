// Orquestación: fetch Hevy → resolución retroactiva → backfill → freeze de
// riesgo/clima → AppState. Port del ciclo de gym_bar.py con el mismo contrato.
import { app } from 'electron'
import { readLog, writeLogEntry, readCache, type HevyWorkout, type LogRow } from './store'
import { fetchWorkouts, gymDates, workoutInfoForDate } from './hevy'
import { fetchWeather } from './weather'
import { getHevyKey, loadSettings } from './settings'
import {
  logicalToday, dayIsClosed, attendanceEligible, addDays, daysBetween, dowLabel, weekdayOf,
  identifySession, nextSessionInRotation, isRestDay, localNow, localIso,
  calculateRisk, checkinFeaturesFromRow,
} from './logic'
import { RISK_MODEL_NAME, TRAINING_ROTATION } from '@shared/schema'
import { sanitizeCsvText } from './csv'
import type { AppState, EligibleSkipDay } from '@shared/types'

let lastError: string | null = null

/** Primer día con check-in real (energy llena) — frontera del dataset denso. */
export function earliestCheckinDate(): string | null {
  const log = readLog()
  const dates = [...log.keys()].sort()
  for (const d of dates) {
    if (checkinFeaturesFromRow(log.get(d))) return d
  }
  return null
}

/** went 0→1 si Hevy ahora muestra sesión (últimos 7 días). Monotónico: nunca 1→0. */
function retroactiveResolve(dates: Set<string>): void {
  const log = readLog()
  const today = logicalToday()
  for (let i = 0; i < 7; i++) {
    const d = addDays(today, -i)
    if (!dates.has(d)) continue
    const row = log.get(d)
    if (row && String(row.went).trim() === '1') continue
    writeLogEntry({
      date: d, went: 1,
      went_resolved_at: localIso(), went_source: 'hevy_fetch',
    })
  }
}

/** Filas faltantes desde el primer check-in. Días cerrados sin sesión → went=0. */
function backfillSkeleton(dates: Set<string>): void {
  const start = earliestCheckinDate()
  if (!start) return
  const log = readLog()
  const today = logicalToday()
  for (let d = start; d <= today; d = addDays(d, 1)) {
    if (log.has(d)) {
      // fila existe: si está cerrada, sin went y sin sesión → went=0
      const row = log.get(d)!
      if (!String(row.went ?? '').trim() && dayIsClosed(d) && !dates.has(d)) {
        writeLogEntry({ date: d, went: 0, went_source: 'window_closed', went_resolved_at: localIso() })
      }
      continue
    }
    const entry: Record<string, unknown> = { date: d }
    if (dates.has(d)) {
      entry.went = 1
      entry.went_source = 'hevy_fetch'
      entry.went_resolved_at = localIso()
    } else if (dayIsClosed(d)) {
      entry.went = 0
      entry.went_source = 'window_closed'
      entry.went_resolved_at = localIso()
    }
    writeLogEntry(entry)
  }
}

/** Congela predicted_risk (BASE, sin check-in) una sola vez por día. */
function freezeBaseRisk(sortedDates: string[]): void {
  const today = logicalToday()
  const row = readLog().get(today)
  if (row && String(row.predicted_risk ?? '').trim()) return
  const { risk } = calculateRisk(sortedDates, null)
  writeLogEntry({ date: today, predicted_risk: risk, risk_model_version: RISK_MODEL_NAME })
}

/** Congela clima del día una sola vez. */
async function freezeWeather(): Promise<void> {
  const today = logicalToday()
  const row = readLog().get(today)
  if (row && String(row.wx_rain_prob ?? '').trim()) return
  const wx = await fetchWeather()
  if (!wx) return
  writeLogEntry({
    date: today,
    wx_rain_prob: wx.rainProb ?? '',
    wx_temp_max: wx.tempMax ?? '',
  })
}

/** Enriquece días went=1 sin título con la info del workout de Hevy. */
function enrichWorkoutInfo(workouts: HevyWorkout[], dates: Set<string>): void {
  const log = readLog()
  const today = logicalToday()
  for (let i = 0; i < 14; i++) {
    const d = addDays(today, -i)
    if (!dates.has(d)) continue
    const row = log.get(d)
    if (!row || String(row.workout_title ?? '').trim()) continue
    const info = workoutInfoForDate(workouts, d)
    if (!info) continue
    writeLogEntry({
      date: d,
      // título viene de un API externo → sanitizar antes de escribir al CSV
      workout_title: sanitizeCsvText(info.title, 200),
      workout_duration_min: info.durationMin ?? '',
      workout_session_type: identifySession(info.title) ?? '',
    })
  }
}

/** Ciclo completo. silent=true para el scheduler (errores → lastError). */
export async function refreshAll(): Promise<void> {
  let workouts = readCache().workouts
  // Falla NO silenciosa: sin key, fetchWorkouts devuelve cache viejo sin error.
  // Esto congeló los datos 5 días sin avisar. Surfacearlo explícitamente.
  if (!getHevyKey()) {
    lastError = 'Hevy no configurado — pega tu API key en Ajustes (datos en caché)'
    const dateSet = new Set(gymDates(workouts))
    try { retroactiveResolve(dateSet) } catch { /* no romper ciclo */ }
    try { backfillSkeleton(dateSet) } catch { /* no romper ciclo */ }
    try { freezeBaseRisk(trainedDates()) } catch { /* no romper ciclo */ }
    return
  }
  try {
    workouts = await fetchWorkouts()
    lastError = null
  } catch (e) {
    lastError = e instanceof Error ? e.message : 'Error fetch Hevy'
  }
  const dates = gymDates(workouts)
  const dateSet = new Set(dates)
  try { retroactiveResolve(dateSet) } catch { /* no romper ciclo */ }
  try { backfillSkeleton(dateSet) } catch { /* no romper ciclo */ }
  // freeze del riesgo base tras resolver: usa asistencia canónica (Hevy + manual)
  try { freezeBaseRisk(trainedDates()) } catch { /* no romper ciclo */ }
  try { await freezeWeather() } catch { /* clima es opcional */ }
  try { enrichWorkoutInfo(workouts, dateSet) } catch { /* no romper ciclo */ }
}

/** Días cerrados de los últimos 7 que necesitan razón (deuda de outcome). */
export function outcomeDebt(): { date: string; label: string }[] {
  const earliest = earliestCheckinDate()
  if (!earliest) return []
  const dates = new Set(gymDates(readCache().workouts))
  const log = readLog()
  const today = logicalToday()
  const debt: { date: string; label: string }[] = []
  for (let i = 0; i < 7; i++) {
    const d = addDays(today, -i)
    if (d < earliest || !dayIsClosed(d)) continue
    const row = log.get(d) ?? {}
    if (String(row.went ?? '').trim() === '1' || dates.has(d)) continue
    if (String(row.skip_reason ?? '').trim()) continue
    // Rotación, no calendario: sin check-in = sin intención declarada =
    // descanso emergente. Solo es deuda si registraste el día y aun así no
    // entrenaste (engagement real), no por ser tal día de la semana.
    if (checkinFeaturesFromRow(row) === null) continue
    debt.push({ date: d, label: dowLabel(d) })
  }
  return debt
}

/** Días elegibles para skip_reason: cerrados, sin went=1, últimos 7. */
export function eligibleSkipDays(): EligibleSkipDay[] {
  const earliest = earliestCheckinDate()
  if (!earliest) return []
  const dates = new Set(gymDates(readCache().workouts))
  const log = readLog()
  const today = logicalToday()
  const out: EligibleSkipDay[] = []
  for (let i = 0; i < 7; i++) {
    const d = addDays(today, -i)
    if (d < earliest || !dayIsClosed(d)) continue
    const row = log.get(d) ?? {}
    if (String(row.went ?? '').trim() === '1' || dates.has(d)) continue
    if (checkinFeaturesFromRow(row) === null) continue // solo días con check-in
    const current = String(row.skip_reason ?? '').trim() || null
    out.push({
      date: d,
      label: `${dowLabel(d)} — ${current ? `razón actual: ${current}` : 'sin registro'}`,
      current,
    })
  }
  return out
}

/** Días que pueden CONFIRMARSE como asistencia (went=1) manualmente: últimos 7,
 *  aún sin resolver como entrenados, y elegibles por `attendanceEligible` — es
 *  decir, cerrados O HOY. A diferencia de `eligibleSkipDays`, HOY sí entra: si
 *  ya entrené hoy puedo marcarlo sin esperar a que cierre la ventana (22:00).
 *  Resuelve el caso "fui hoy pero no quedó en Hevy" / día cambiado de lugar. */
export function eligibleWentDays(): EligibleSkipDay[] {
  const earliest = earliestCheckinDate()
  if (!earliest) return []
  const dates = new Set(gymDates(readCache().workouts))
  const log = readLog()
  const today = logicalToday()
  const out: EligibleSkipDay[] = []
  for (let i = 0; i < 7; i++) {
    const d = addDays(today, -i)
    if (d < earliest || !attendanceEligible(d)) continue
    const row = log.get(d) ?? {}
    if (String(row.went ?? '').trim() === '1' || dates.has(d)) continue
    out.push({ date: d, label: dowLabel(d), current: String(row.skip_reason ?? '').trim() || null })
  }
  return out
}

/** Confirma asistencia manual de `date` si es elegible. Lógica compartida por el
 *  handler IPC y el item del tray; limpia cualquier skip_reason previo. */
export function markWentManual(date: string): boolean {
  if (!eligibleWentDays().some((d) => d.date === date)) return false
  writeLogEntry({
    date, went: 1, went_source: 'manual', went_resolved_at: localIso(),
    skip_reason: '', updated_at: localIso(),
  })
  return true
}

function checkinStreak(): number {
  const log = readLog()
  let streak = 0
  let d = logicalToday()
  let todayGrace = true
  for (;;) {
    const row = log.get(d)
    if (checkinFeaturesFromRow(row)) {
      streak++
    } else if (todayGrace) {
      // hoy sin llenar no rompe la racha
    } else {
      break
    }
    todayGrace = false
    d = addDays(d, -1)
    if (streak > 365) break
  }
  return streak
}

/** Días entrenados = Hevy ∪ asistencias manuales (CSV went=1). Registro canónico
 *  de asistencia tras resolución; alimenta riesgo, recencia, gap y semana — así
 *  marcar "sí fui" (cuando no quedó en Hevy) sí baja el riesgo y mueve "última". */
export function mergeTrainedDates(hevyDates: string[], log: Map<string, LogRow>): string[] {
  const set = new Set(hevyDates)
  for (const [date, row] of log) {
    if (String(row.went ?? '').trim() === '1') set.add(date)
  }
  return [...set].sort().reverse()
}

export function trainedDates(): string[] {
  return mergeTrainedDates(gymDates(readCache().workouts), readLog())
}

export function buildState(): AppState {
  const settings = loadSettings()
  const cache = readCache()
  const workouts = cache.workouts
  const log = readLog()
  const dates = mergeTrainedDates(gymDates(workouts), log)
  const today = logicalToday()
  const todayRow = log.get(today) ?? null

  const checkin = checkinFeaturesFromRow(todayRow)
  const { risk, factors } = calculateRisk(dates, checkin)
  const riskPct = Math.round(risk * 100)
  const riskLevel: AppState['riskLevel'] = risk < 0.3 ? 'low' : risk < 0.6 ? 'med' : 'high'

  const lastTitle = workouts[0]?.title ?? null
  const nextSession = lastTitle ? nextSessionInRotation(identifySession(lastTitle)) : null

  const last = dates[0] ?? null
  const lastInfo = last ? workoutInfoForDate(workouts, last) : null

  const monday = addDays(today, -weekdayOf(today))
  const weekCount = dates.filter((d) => d >= monday && d <= today).length
  // Objetivo por ROTACIÓN (largo del ciclo), no por calendario (7 - restDays).
  const weekTarget = TRAINING_ROTATION.length

  // Asistencia de hoy: ya resuelta (Hevy o manual) vs. confirmable ahora mismo.
  // canMarkTodayWent habilita el botón "Ya entrené hoy" aunque la ventana siga
  // abierta y aunque hoy fuese día de descanso (día cambiado de lugar).
  const todayWent = dates.includes(today)
  const canMarkTodayWent = !todayWent && eligibleWentDays().some((d) => d.date === today)

  const now = localNow()
  let status: AppState['checkin']['status'] = 'open'
  if (checkin) status = 'done'
  else if (dayIsClosed(today)) status = 'late'
  else if (
    now.getHours() > settings.reminderHour ||
    (now.getHours() === settings.reminderHour && now.getMinutes() >= settings.reminderMinute)
  ) status = 'pending'

  return {
    version: app.getVersion(),
    hevyConfigured: Boolean(getHevyKey()),
    today,
    riskPct,
    riskLevel,
    riskFactors: factors,
    nextSession,
    // Realidad sobre calendario: si ya entrenaste hoy NO es descanso. Cuando es
    // true es solo una pista suave ("sueles descansar"); nunca tapa la rotación.
    isRestDay: !todayWent && isRestDay(today),
    todayWent,
    canMarkTodayWent,
    lastWorkout: last
      ? { date: last, title: lastInfo?.title ?? '', daysAgo: daysBetween(today, last) }
      : null,
    weekCount,
    weekTarget,
    streak: checkinStreak(),
    fetchedAt: cache.fetched_at,
    checkin: {
      status,
      savedAt: todayRow?.saved_at && checkin ? todayRow.saved_at : undefined,
      delayed: String(todayRow?.checkin_delayed ?? '').trim() === '1',
    },
    debt: outcomeDebt(),
    todayRow,
    weather: {
      rainProb: todayRow?.wx_rain_prob ? Number(todayRow.wx_rain_prob) : null,
      tempMax: todayRow?.wx_temp_max ? Number(todayRow.wx_temp_max) : null,
    },
    lastError,
  }
}

/**
 * Delay = outcome ya observable al llenar (recall bias), no el mero paso del tiempo.
 * Antes incluíamos `windowPassed >= 22:00` como señal, pero Israel entrena
 * 22:00–01:00; cualquier umbral fijo lo marca tarde mientras está en el gym.
 * La única señal robusta de outcome observable es: Hevy ya registró sesión hoy.
 */
export function computeDelay(): { delayed: boolean; minutesLate: number; reason: string } {
  const today = logicalToday()
  const dates = new Set(gymDates(readCache().workouts))
  const now = localNow()
  const hevyHasToday = dates.has(today)

  const reasons: string[] = []
  if (hevyHasToday) reasons.push('Hevy ya registra entrenamiento hoy')

  const delayed = hevyHasToday
  let minutesLate = 0
  if (delayed) {
    const s = loadSettings()
    const target = new Date(now)
    target.setHours(s.reminderHour, s.reminderMinute, 0, 0)
    minutesLate = Math.max(0, Math.round((now.getTime() - target.getTime()) / 60000))
  }
  return { delayed, minutesLate, reason: reasons.join(' · ') || 'on time' }
}
