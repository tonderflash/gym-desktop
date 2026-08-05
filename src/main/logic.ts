// Día lógico (cutoff 4am), rotación y riesgo heuristic_v3. El día lógico y la
// rotación siguen siendo port fiel de gym_bar.py; el riesgo ya no (ver scoreRisk).
import {
  LOGICAL_DAY_CUTOFF_HOUR,
  TRAINING_ROTATION, SESSION_KEYWORDS, DOW_NAMES,
  RISK_WEIGHTS, RISK_CHECKIN_WEIGHTS, RISK_CLAMP, LAPSE_FREE_DAYS, LAPSE_SPAN,
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

/** Entradas explícitas del modelo — sin `logicalToday()` ni settings adentro,
 *  para que el scorer sea puro y testeable contra historial real. */
export interface RiskInputs {
  /** Fecha lógica ISO que se está puntuando. */
  today: string
  /** Fechas lógicas ISO de sesiones, DESC. Deben ser TODAS < today: el modelo
   *  predice si entrenarás hoy, así que incluir hoy sería leakage. */
  history: string[]
  /** ¿`today` es día de descanso configurado? */
  restDay: boolean
  /** Largo del ciclo de rotación — normaliza la carga semanal. */
  rotationLength: number
  checkin: CheckinFeatures | null
}

/**
 * heuristic_v3 — riesgo de NO entrenar hoy (0.04–0.96) + desglose.
 *
 * Suma en LOG-ODDS y cierra con una sigmoide, en vez de sumar probabilidades
 * como v2. Eso importa por dos razones: los términos ya no pueden empujar el
 * resultado fuera de [0,1] (v2 lo tapaba con un clamp que destruía la
 * calibración en los extremos), y el efecto de cada factor pasa a ser
 * multiplicativo sobre las odds, que es como se comportan realmente.
 *
 * Los `contrib` del desglose están en log-odds: el signo se lee igual que antes
 * (+ sube el riesgo, − lo baja) pero la magnitud ya no es "puntos de
 * probabilidad". El `note` de cada fila lo explicita.
 *
 * Ver RISK_WEIGHTS en shared/schema.ts para el porqué de cada peso.
 */
export function scoreRisk(inputs: RiskInputs): { risk: number; factors: RiskFactor[] } {
  const { today, history, restDay, rotationLength, checkin } = inputs
  const factors: RiskFactor[] = []

  if (history.length === 0) {
    return {
      risk: 0.5,
      factors: [{ name: 'sin datos', value: 'N/A', contrib: 0, note: 'sin historial → asumimos 50%' }],
    }
  }

  const W = RISK_WEIGHTS
  let z = W.BASE
  factors.push({
    name: 'base', value: '—', contrib: W.BASE,
    note: 'intercepto del modelo (día laboral, semana en 0)',
  })

  // Día de descanso: el predictor más fuerte del historial y el que v2 ignoraba.
  const restContrib = restDay ? W.REST_DAY : 0
  z += restContrib
  factors.push({
    name: 'descanso', value: restDay ? DOW_NAMES[weekdayOf(today)] : 'no',
    contrib: restContrib,
    note: restDay ? 'día de descanso configurado' : 'hoy no es día de descanso',
  })

  // Cuota semanal ya cumplida — entre más sesiones lleves, más probable parar.
  const monday = addDays(today, -weekdayOf(today))
  const sessionsThisWeek = history.filter((d) => d >= monday && d < today).length
  const weekContrib = W.WEEK_LOAD * (sessionsThisWeek / rotationLength)
  z += weekContrib
  factors.push({
    name: 'semana', value: `${sessionsThisWeek}/${rotationLength}`, contrib: weekContrib,
    note: `carga semanal ya cumplida × ${W.WEEK_LOAD}`,
  })

  // Abandono: el gap SOLO cuenta pasada la ventana de recuperación. Antes de
  // LAPSE_FREE_DAYS un gap corto es la rotación, no una señal de riesgo.
  const daysSince = daysBetween(today, history[0])
  const lapse = Math.min(Math.max(daysSince - LAPSE_FREE_DAYS, 0), LAPSE_SPAN) / LAPSE_SPAN
  const lapseContrib = W.LAPSE * lapse
  z += lapseContrib
  factors.push({
    name: 'abandono', value: `${daysSince}d sin ir`, contrib: lapseContrib,
    note: lapse > 0
      ? `${daysSince}d supera los ${LAPSE_FREE_DAYS}d de recuperación`
      : `${daysSince}d entra en recuperación normal (≤${LAPSE_FREE_DAYS}d)`,
  })

  if (checkin) {
    const C = RISK_CHECKIN_WEIGHTS
    const ia = C.INTENTION[checkin.intention ?? ''] ?? 0
    z += ia
    factors.push({
      name: 'intención', value: checkin.intention ?? '—', contrib: ia,
      note: 'declarada en check-in (prior, no ajustado)',
    })

    let ea = 0
    if (checkin.energy !== null) {
      ea = checkin.energy <= 2 ? C.ENERGY_LOW : checkin.energy >= 4 ? C.ENERGY_HIGH : 0
    }
    z += ea
    factors.push({
      name: 'energía', value: checkin.energy !== null ? `${checkin.energy}/5` : '—', contrib: ea,
      note: 'baja drena adherencia; alta protege',
    })

    let sa = 0
    if (checkin.sleep_hours !== null) {
      sa = checkin.sleep_hours < 6 ? C.SLEEP_SHORT : checkin.sleep_hours >= 8 ? C.SLEEP_LONG : 0
    }
    z += sa
    factors.push({
      name: 'sueño', value: checkin.sleep_hours !== null ? `${checkin.sleep_hours}h` : '—', contrib: sa,
      note: '<6h castiga, ≥8h protege',
    })

    let fa = 0
    if (checkin.factor_sick || checkin.factor_injury) fa += C.SICK_OR_INJURY
    if (checkin.factor_alcohol || checkin.factor_late_night) fa += C.ALCOHOL_OR_LATE
    z += fa
    factors.push({
      name: 'factores', value: 'ayer', contrib: fa,
      note: `enfermo/lesión +${C.SICK_OR_INJURY} · alcohol/trasnoche +${C.ALCOHOL_OR_LATE}`,
    })
  }

  const p = Math.max(RISK_CLAMP.MIN, Math.min(RISK_CLAMP.MAX, sigmoid(z)))
  return { risk: Math.round(p * 1000) / 1000, factors }
}

/**
 * Wrapper para el runtime: resuelve hoy, settings y rotación, y descarta del
 * historial cualquier fecha ≥ hoy — si Hevy ya sincronizó la sesión de hoy,
 * incluirla haría que el modelo "prediga" con la respuesta puesta.
 */
export function calculateRisk(dates: string[], checkin: CheckinFeatures | null = null): {
  risk: number
  factors: RiskFactor[]
} {
  const today = logicalToday()
  return scoreRisk({
    today,
    history: dates.filter((d) => d < today),
    restDay: isRestDay(today),
    rotationLength: TRAINING_ROTATION.length,
    checkin,
  })
}
