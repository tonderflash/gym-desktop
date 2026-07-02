import { ipcMain, shell, BrowserWindow } from 'electron'
import { dataDir } from './env'
import { readLog, writeLogEntry } from './store'
import { loadSettings, patchSettings, setHevyKey, hevyKeyMasked, WIDGET_KEYS } from './settings'
import { testKey } from './hevy'
import {
  refreshAll, buildState, eligibleSkipDays, computeDelay, trainedDates, markWentManual,
} from './pipeline'
import { calculateRisk, checkinFeaturesFromRow, logicalToday, localIso } from './logic'
import { exportSkill } from './skill-export'
import { importLegacy, legacyAvailable } from './migrate'
import { checkForUpdates, installUpdate, openLatestRelease } from './updater'
import { RISK_MODEL_NAME } from '@shared/schema'
import { SKIP_REASON_OPTS } from '@shared/labels'
import { sanitizeCsvText } from './csv'
import type { AppState, CheckinPayload, CheckinResult, FactorDef, SettingsPatch, SettingsView } from '@shared/types'

const VALID_SKIP_REASONS = new Set(SKIP_REASON_OPTS.map(([code]) => code))

/** Normalización defensiva server-side — el renderer NO es frontera de confianza. */
function normalizeSettingsPatch(p: SettingsPatch): SettingsPatch {
  const out: SettingsPatch = {}
  if (Array.isArray(p.restDays)) {
    out.restDays = [...new Set(p.restDays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort()
  }
  if (Array.isArray(p.factors)) {
    const seen = new Set<string>()
    const clean: FactorDef[] = []
    for (const f of p.factors.slice(0, 20)) {
      const key = String(f?.key ?? '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 30)
      const label = String(f?.label ?? '').replace(/[\r\n\t]/g, ' ').trim().slice(0, 60)
      if (!key || !label || seen.has(key)) continue
      seen.add(key)
      clean.push({ key, label })
    }
    out.factors = clean
  }
  if (p.weatherLat !== undefined) {
    out.weatherLat = p.weatherLat !== null && Number.isFinite(p.weatherLat) && Math.abs(p.weatherLat) <= 90
      ? p.weatherLat : null
  }
  if (p.weatherLon !== undefined) {
    out.weatherLon = p.weatherLon !== null && Number.isFinite(p.weatherLon) && Math.abs(p.weatherLon) <= 180
      ? p.weatherLon : null
  }
  if (p.reminderHour !== undefined && Number.isInteger(p.reminderHour) && p.reminderHour >= 0 && p.reminderHour <= 23) {
    out.reminderHour = p.reminderHour
  }
  if (p.reminderMinute !== undefined && Number.isInteger(p.reminderMinute) && p.reminderMinute >= 0 && p.reminderMinute <= 59) {
    out.reminderMinute = p.reminderMinute
  }
  if (typeof p.hevyKey === 'string') {
    const k = p.hevyKey.trim()
    if (k && k.length <= 200 && !/[^\x21-\x7e]/.test(k)) out.hevyKey = k
  }
  if (p.meet && typeof p.meet === 'object') {
    const cleanLift = (v: unknown): number =>
      Number.isFinite(Number(v)) ? Math.max(0, Math.min(2000, Math.round(Number(v)))) : 0
    const date = String(p.meet.date ?? '').trim()
    const wc = String(p.meet.weightClass ?? '').replace(/[\r\n\t]/g, ' ').trim().slice(0, 30)
    out.meet = {
      name: String(p.meet.name ?? '').replace(/[\r\n\t]/g, ' ').trim().slice(0, 60),
      date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '',
      weightClass: wc || null,
      targets: {
        squat: cleanLift(p.meet.targets?.squat),
        bench: cleanLift(p.meet.targets?.bench),
        deadlift: cleanLift(p.meet.targets?.deadlift),
      },
    }
  }
  if (p.dashboardWidgets && typeof p.dashboardWidgets === 'object') {
    // solo claves del catálogo, solo booleanos — nada arbitrario al disco
    const clean: Record<string, boolean> = {}
    for (const k of WIDGET_KEYS) {
      const v = (p.dashboardWidgets as Record<string, unknown>)[k]
      if (typeof v === 'boolean') clean[k] = v
    }
    if (Object.keys(clean).length) out.dashboardWidgets = clean
  }
  return out
}

let win: BrowserWindow | null = null
let afterBroadcast: ((s: AppState) => void) | null = null

/** Actualiza la ventana destino de los eventos sin re-registrar handlers IPC
 *  (ipcMain.handle lanza si se registra dos veces). Usar al recrear la ventana. */
export function setIpcWindow(window: BrowserWindow): void {
  win = window
}

/** Hook que corre tras cada broadcast de estado (p.ej. repintar el tray). */
export function onBroadcast(fn: (s: AppState) => void): void {
  afterBroadcast = fn
}

export function broadcastState(): void {
  if (!win || win.isDestroyed()) {
    // sin ventana viva igual notificamos al tray con el estado fresco
    afterBroadcast?.(buildState())
    return
  }
  const s = buildState()
  win.webContents.send('state:update', s)
  afterBroadcast?.(s)
}

function validateCheckin(p: CheckinPayload): string[] {
  const errs: string[] = []
  if (!Number.isInteger(p.energy) || p.energy < 1 || p.energy > 5) errs.push('Energía debe ser 1-5')
  if (!Number.isInteger(p.stress) || p.stress < 1 || p.stress > 5) errs.push('Estrés debe ser 1-5')
  if (p.sleep_hours === null || !Number.isFinite(p.sleep_hours)) {
    errs.push('Horas de sueño faltan o no son número')
  } else if (p.sleep_hours < 0 || p.sleep_hours > 18) {
    errs.push(`Sueño debe estar entre 0 y 18 horas (diste ${p.sleep_hours})`)
  }
  const validPain = ['none', 'leg', 'lower_back', 'shoulder', 'arm', 'other']
  if (!validPain.includes(p.pain)) errs.push('Dolor inválido')
  const validIntent = ['yes_now', 'probably', 'unsure', 'no']
  if (!validIntent.includes(p.intention)) errs.push('Intención inválida')
  for (const [k, v] of Object.entries(p.factors)) {
    if (v !== 0 && v !== 1) errs.push(`${k} debe ser 0 o 1`)
  }
  return errs
}

function settingsView(): SettingsView {
  const s = loadSettings()
  return {
    userId: s.userId,
    restDays: s.restDays,
    factors: s.factors,
    weatherLat: s.weatherLat,
    weatherLon: s.weatherLon,
    reminderHour: s.reminderHour,
    reminderMinute: s.reminderMinute,
    hevyKeyMasked: hevyKeyMasked(),
    dataDir: dataDir(),
    legacyAvailable: legacyAvailable(),
    meet: s.meet,
    dashboardWidgets: s.dashboardWidgets,
  }
}

export function registerIpc(window: BrowserWindow): void {
  win = window

  ipcMain.handle('state:get', () => buildState())

  ipcMain.handle('state:refresh', async () => {
    await refreshAll()
    const s = buildState()
    broadcastState()
    return s
  })

  ipcMain.handle('checkin:save', (_e, p: CheckinPayload): CheckinResult => {
    const errors = validateCheckin(p)
    if (errors.length) return { ok: false, errors }

    const today = logicalToday()
    const existing = readLog().get(today)
    const isReEdit = checkinFeaturesFromRow(existing) !== null

    const { delayed, minutesLate, reason } = computeDelay()
    if (delayed && !isReEdit && !p.confirmDelayed) {
      return { ok: false, needsDelayConfirm: true, delayReason: reason }
    }

    const now = localIso()
    const entry: Record<string, unknown> = {
      date: today,
      energy: p.energy,
      stress: p.stress,
      pain: p.pain,
      sleep_hours: p.sleep_hours,
      sleep_source: p.sleep_source === 'tracker' ? 'tracker' : 'manual',
      intention: p.intention,
      notes: sanitizeCsvText(String(p.notes ?? '')),
      updated_at: now,
    }
    for (const [k, v] of Object.entries(p.factors)) entry[k] = v

    if (isReEdit && existing) {
      // re-edición: preservar provenance original
      entry.saved_at = existing.saved_at || now
      entry.checkin_delayed = existing.checkin_delayed ?? ''
      entry.checkin_minutes_late = existing.checkin_minutes_late ?? ''
    } else {
      entry.saved_at = now
      entry.checkin_delayed = delayed ? 1 : 0
      entry.checkin_minutes_late = delayed ? minutesLate : 0
    }

    if (!writeLogEntry(entry)) return { ok: false, errors: ['No se pudo escribir el CSV'] }

    // Freeze del riesgo POST check-in (solo la primera vez)
    const rowNow = readLog().get(today)
    if (rowNow && !String(rowNow.predicted_risk_post ?? '').trim()) {
      const chk = checkinFeaturesFromRow(rowNow)
      const { risk } = calculateRisk(trainedDates(), chk)
      writeLogEntry({
        date: today,
        predicted_risk_post: risk,
        risk_model_version: RISK_MODEL_NAME,
        updated_at: localIso(),
      })
    }
    broadcastState()
    return { ok: true }
  })

  ipcMain.handle('skip:eligible', () => eligibleSkipDays())

  ipcMain.handle('skip:save', (_e, date: string, reason: string) => {
    // poka-yoke server-side: solo días realmente elegibles y razones del catálogo
    if (!VALID_SKIP_REASONS.has(reason)) return { ok: false }
    const ok = eligibleSkipDays().some((d) => d.date === date)
    if (!ok) return { ok: false }
    writeLogEntry({ date, skip_reason: reason, went: 0, updated_at: localIso() })
    broadcastState()
    return { ok: true }
  })

  // "Sí fui": entrenó pero no quedó en Hevy (ni hizo check-in). Resuelve el
  // outcome como asistencia manual y limpia cualquier razón previa.
  ipcMain.handle('outcome:markWent', (_e, date: string) => {
    // Acepta HOY aunque la ventana siga abierta (sesión ya hecha es verificable);
    // la elegibilidad real vive en markWentManual → eligibleWentDays.
    const ok = markWentManual(date)
    if (ok) broadcastState()
    return { ok }
  })

  ipcMain.handle('history:get', () => {
    const log = readLog()
    return [...log.values()].sort((a, b) => b.date.localeCompare(a.date))
  })

  ipcMain.handle('settings:get', () => settingsView())

  ipcMain.handle('settings:save', (_e, patch: SettingsPatch) => {
    const p = normalizeSettingsPatch(patch ?? {})
    if (p.hevyKey) setHevyKey(p.hevyKey)
    const { hevyKey: _hk, ...rest } = p
    const clean: Record<string, unknown> = {}
    if (rest.restDays) clean.restDays = rest.restDays
    if (rest.factors) clean.factors = rest.factors
    if (rest.weatherLat !== undefined) clean.weatherLat = rest.weatherLat
    if (rest.weatherLon !== undefined) clean.weatherLon = rest.weatherLon
    if (rest.reminderHour !== undefined) clean.reminderHour = rest.reminderHour
    if (rest.reminderMinute !== undefined) clean.reminderMinute = rest.reminderMinute
    if (rest.meet) clean.meet = rest.meet
    if (rest.dashboardWidgets) {
      // el patch puede traer un solo toggle — merge con lo existente
      clean.dashboardWidgets = { ...loadSettings().dashboardWidgets, ...rest.dashboardWidgets }
    }
    if (Object.keys(clean).length) patchSettings(clean)
    broadcastState()
    return settingsView()
  })

  ipcMain.handle('hevy:testKey', (_e, key: string) =>
    testKey(String(key ?? '').trim().slice(0, 200)))

  ipcMain.handle('skill:export', () => exportSkill())

  ipcMain.handle('data:openFolder', () => {
    void shell.openPath(dataDir())
  })

  ipcMain.handle('legacy:import', () => {
    const r = importLegacy(true)
    broadcastState()
    return r
  })

  // validación estricta: un valor desconocido NO cae en ninguna acción
  // (antes el else final abría el navegador con cualquier input)
  ipcMain.handle('app:updater', (_e, action: unknown) => {
    if (action === 'check') void checkForUpdates()
    else if (action === 'install') installUpdate()
    else if (action === 'openLatest') openLatestRelease()
  })
}
