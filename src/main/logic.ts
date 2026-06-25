// Port fiel de la lógica de gym_bar.py: día lógico, rotación, riesgo heuristic_v2.
import {
  LOGICAL_DAY_CUTOFF_HOUR,
  TRAINING_ROTATION, SESSION_KEYWORDS, DOW_NAMES,
} from '@shared/schema'
import type { RiskFactor } from '@shared/types'
import { loadSettings } from './settings'

export function localNow(): Date {
  return new Date()
}

/** ISO local sin zona (como guardaba el app Python), ej. 2026-06-11T17:30:05 */
export function localIso(): string {
  const d = localNow()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

export function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Datetimes antes del cutoff (4am) pertenecen al día anterior. */
export function logicalDateFromDt(dt: Date): string {
  const d = new Date(dt)
  if (d.getHours() < LOGICAL_DAY_CUTOFF_HOUR) d.setDate(d.getDate() - 1)
  return isoDate(d)
}

export function logicalToday(): string {
  return logicalDateFromDt(localNow())
}

export function addDays(dateIso: string, n: number): string {
  const d = new Date(dateIso + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return isoDate(d)
}

export function daysBetween(aIso: string, bIso: string): number {
  const a = new Date(aIso + 'T12:00:00').getTime()
  const b = new Date(bIso + 'T12:00:00').getTime()
  return Math.round((a - b) / 86400000)
}

export function weekdayOf(dateIso: string): number {
  // JS: 0=domingo → convertir a 0=lunes como Python
  const js = new Date(dateIso + 'T12:00:00').getDay()
  return (js + 6) % 7
}

export function isRestDay(d: Date | string): boolean {
  const wd = typeof d === 'string' ? weekdayOf(d) : (d.getDay() + 6) % 7
  return loadSettings().restDays.includes(wd)
}

export function dowLabel(dateIso: string): string {
  const [, m, day] = dateIso.split('-')
  return `${DOW_NAMES[weekdayOf(dateIso)]} ${day}/${m}`
}

/**
 * Día cerrado = su outcome ya no puede cambiar.
 * Diseño robusto: un día solo cierra cuando logicalToday() ha avanzado.
 * Evita marcar el día como cerrado mientras el usuario sigue entrenando
 * (caso típico: trainings tardíos 22:00–01:00). logicalToday ya respeta
 * LOGICAL_DAY_CUTOFF_HOUR, así que esta función queda libre de horas fijas.
 */
export function dayIsClosed(dateIso: string): boolean {
  return dateIso < logicalToday()
}

/**
 * ¿Se puede confirmar asistencia (went=1) de este día?
 * Asimetría intencional respecto a skip_reason: una sesión YA hecha es
 * verificable durante el día (puedo confirmar que entrené esta tarde), así que
 * HOY entra aunque la ventana siga abierta. Un no-show NO es verificable hasta
 * que el día cierra — esa rama sigue atada a dayIsClosed (poka-yoke de recall).
 */
export function attendanceEligible(dateIso: string): boolean {
  return dateIso === logicalToday() || dayIsClosed(dateIso)
}

export function identifySession(title: string | null | undefined): string | null {
  if (!title) return null
  const t = title.toLowerCase()
  for (const [session, kws] of Object.entries(SESSION_KEYWORDS)) {
    if (kws.some((kw) => t.includes(kw))) return session
  }
  return null
}

export function nextSessionInRotation(last: string | null): string {
  if (!last || !TRAINING_ROTATION.includes(last)) return TRAINING_ROTATION[0]
  const idx = TRAINING_ROTATION.indexOf(last)
  return TRAINING_ROTATION[(idx + 1) % TRAINING_ROTATION.length]
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x))
}

export interface CheckinFeatures {
  intention: string | null
  energy: number | null
  sleep_hours: number | null
  factor_sick: boolean
  factor_injury: boolean
  factor_alcohol: boolean
  factor_late_night: boolean
}

export function checkinFeaturesFromRow(row: Record<string, string> | undefined | null): CheckinFeatures | null {
  if (!row || !String(row.energy ?? '').trim() || String(row.energy).trim() === 'None') return null
  const energy = parseInt(row.energy, 10)
  const sleep = parseFloat(row.sleep_hours ?? '')
  return {
    intention: (row.intention ?? '').trim() || null,
    energy: Number.isFinite(energy) ? energy : null,
    sleep_hours: Number.isFinite(sleep) ? sleep : null,
    factor_sick: (row.factor_sick ?? '').trim() === '1',
    factor_injury: (row.factor_injury ?? '').trim() === '1',
    factor_alcohol: (row.factor_alcohol ?? '').trim() === '1',
    factor_late_night: (row.factor_late_night ?? '').trim() === '1',
  }
}

/**
 * heuristic_v2 — riesgo de NO entrenar hoy (0.04–0.96) + desglose.
 * dates: fechas lógicas ISO de sesiones, ordenadas DESC (dates[0] = última).
 * Heurística ponderada, no modelo entrenado — señal direccional.
 */
export function calculateRisk(dates: string[], checkin: CheckinFeatures | null = null): {
  risk: number
  factors: RiskFactor[]
} {
  const today = logicalToday()
  const factors: RiskFactor[] = []

  if (dates.length === 0) {
    return {
      risk: 0.5,
      factors: [{ name: 'sin datos', value: 'N/A', contrib: 0.5, note: 'sin historial → asumimos 50%' }],
    }
  }

  const daysSince = daysBetween(today, dates[0])
  const gapRisk = sigmoid((daysSince - 3) * 0.85)
  const gapContrib = gapRisk * 0.65
  factors.push({
    name: 'gap', value: `${daysSince}d sin ir`, contrib: gapContrib,
    note: `sigmoid(${daysSince}-3)×0.85 × 65%`,
  })

  const last5 = dates.filter((d) => daysBetween(today, d) <= 5)
  const postCluster = last5.length >= 3 && daysSince >= 2 ? 0.2 : 0
  factors.push({
    name: 'cluster', value: `${last5.length} en 5d`, contrib: postCluster,
    note: postCluster ? 'ráfaga + pausa ≥2d → +0.20' : 'sin patrón ráfaga/pausa',
  })

  const todayWd = weekdayOf(today)
  const monday = addDays(today, -todayWd)
  const sessionsThisWeek = dates.filter((d) => d >= monday && d < today).length
  const busyWeek = sessionsThisWeek >= 3 && daysSince >= 2 ? 0.08 : 0
  factors.push({
    name: 'semana', value: `${sessionsThisWeek} sesiones`, contrib: busyWeek,
    note: busyWeek ? 'ya 3+ esta semana → descanso espontáneo' : 'no aplica',
  })

  const dowAdj: Record<number, number> = { 0: 0.02, 1: 0.02, 2: 0.08, 3: 0.13, 4: 0.03, 5: 0.1, 6: 0.06 }
  const dowContrib = (dowAdj[todayWd] ?? 0.05) * 0.5
  factors.push({
    name: 'día', value: DOW_NAMES[todayWd], contrib: dowContrib,
    note: 'ajuste histórico del día × 50%',
  })

  let raw = gapContrib + postCluster + busyWeek + dowContrib

  if (checkin) {
    const intentMap: Record<string, number> = { yes_now: -0.25, probably: -0.08, unsure: 0.12, no: 0.4 }
    const ia = intentMap[checkin.intention ?? ''] ?? 0
    factors.push({
      name: 'intención', value: checkin.intention ?? '—', contrib: ia,
      note: 'declarada en check-in (predictor #1)',
    })

    let ea = 0
    if (checkin.energy !== null) ea = checkin.energy <= 2 ? 0.08 : checkin.energy >= 4 ? -0.06 : 0
    factors.push({
      name: 'energía', value: checkin.energy !== null ? `${checkin.energy}/5` : '—', contrib: ea,
      note: 'baja drena adherencia; alta protege',
    })

    let sa = 0
    if (checkin.sleep_hours !== null) sa = checkin.sleep_hours < 6 ? 0.07 : checkin.sleep_hours >= 8 ? -0.03 : 0
    factors.push({
      name: 'sueño', value: checkin.sleep_hours !== null ? `${checkin.sleep_hours}h` : '—', contrib: sa,
      note: '<6h castiga, ≥8h protege',
    })

    let fa = 0
    if (checkin.factor_sick || checkin.factor_injury) fa += 0.12
    if (checkin.factor_alcohol || checkin.factor_late_night) fa += 0.05
    factors.push({
      name: 'factores', value: 'ayer', contrib: fa,
      note: 'enfermo/lesión +0.12 · alcohol/trasnoche +0.05',
    })

    raw += ia + ea + sa + fa
  }

  const final = Math.round(Math.max(0.04, Math.min(0.96, raw)) * 1000) / 1000
  return { risk: final, factors }
}
