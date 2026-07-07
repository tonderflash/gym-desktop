import { safeStorage } from 'electron'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { randomUUID } from 'crypto'
import { paths } from './env'
import { DEFAULT_FACTORS, DEFAULT_REST_DAYS, DEFAULT_REMINDER } from '@shared/schema'
import type { FactorDef } from '@shared/types'

export interface MeetLifts {
  squat: number
  bench: number
  deadlift: number
}

/**
 * Objetivo de competencia — dato PERSONAL, se edita desde el dashboard
 * (widget). Los defaults van vacíos a propósito: cada usuario configura el
 * suyo; nada del objetivo de un usuario viaja en el código.
 */
export interface MeetConfig {
  name: string
  date: string // ISO yyyy-mm-dd; '' = sin configurar
  weightClass: string | null
  targets: MeetLifts // e1RM objetivo en LBS; 0 = sin meta para ese lift
}

/** Catálogo de widgets del dashboard (los cards core no se ocultan).
 *  Para publicar un template nuevo en la galería: añadir la key aquí, su
 *  default abajo, y la entrada + render en el renderer (WIDGET_CATALOG). */
export const WIDGET_KEYS = [
  'meet', 'muscles', 'volume', 'prs', 'findings', 'riskBreakdown',
  'consistency', 'total', 'vbtHomolog', 'vbtProfile',
] as const
export type WidgetKey = (typeof WIDGET_KEYS)[number]

export interface Settings {
  userId: string
  restDays: number[]
  factors: FactorDef[]
  weatherLat: number | null
  weatherLon: number | null
  reminderHour: number
  reminderMinute: number
  hevyKeyEncrypted: string | null // base64 del ciphertext de safeStorage
  hevyKeyPlain: string | null     // fallback si safeStorage no está disponible
  lastReminderDate: string | null
  migratedFromGymBar: boolean
  meet: MeetConfig
  dashboardWidgets: Record<WidgetKey, boolean>
}

let cached: Settings | null = null

function defaults(): Settings {
  return {
    userId: randomUUID(),
    restDays: [...DEFAULT_REST_DAYS],
    factors: DEFAULT_FACTORS.map((f) => ({ ...f })),
    weatherLat: null,
    weatherLon: null,
    reminderHour: DEFAULT_REMINDER.hour,
    reminderMinute: DEFAULT_REMINDER.minute,
    hevyKeyEncrypted: null,
    hevyKeyPlain: null,
    lastReminderDate: null,
    migratedFromGymBar: false,
    // vacío a propósito: el objetivo es personal y se configura en el widget
    meet: {
      name: '',
      date: '',
      weightClass: null,
      targets: { squat: 0, bench: 0, deadlift: 0 },
    },
    // los 6 originales activos; los templates nuevos se "instalan" en la galería
    dashboardWidgets: {
      meet: true, muscles: true, volume: true, prs: true, findings: true, riskBreakdown: true,
      consistency: false, total: false,
      // VBT en vivo desde el motor GymVision — visibles por defecto
      vbtHomolog: true, vbtProfile: true,
    },
  }
}

export function loadSettings(): Settings {
  if (cached) return cached
  if (existsSync(paths.settings())) {
    try {
      const raw = JSON.parse(readFileSync(paths.settings(), 'utf-8'))
      const d = defaults()
      // merge profundo: settings.json viejos no traen estas claves, y uno
      // editado a mano puede traerlas incompletas
      cached = {
        ...d,
        ...raw,
        meet: {
          ...d.meet,
          ...(raw.meet ?? {}),
          targets: { ...d.meet.targets, ...(raw.meet?.targets ?? {}) },
        },
        dashboardWidgets: { ...d.dashboardWidgets, ...(raw.dashboardWidgets ?? {}) },
      }
      return cached!
    } catch {
      /* archivo corrupto → defaults */
    }
  }
  cached = defaults()
  saveSettings(cached)
  return cached
}

export function saveSettings(s: Settings): void {
  cached = s
  writeFileSync(paths.settings(), JSON.stringify(s, null, 2), 'utf-8')
}

export function patchSettings(patch: Partial<Settings>): Settings {
  const s = { ...loadSettings(), ...patch }
  saveSettings(s)
  return s
}

export function setHevyKey(plainKey: string): void {
  const s = loadSettings()
  if (safeStorage.isEncryptionAvailable()) {
    s.hevyKeyEncrypted = safeStorage.encryptString(plainKey).toString('base64')
    s.hevyKeyPlain = null
  } else {
    s.hevyKeyEncrypted = null
    s.hevyKeyPlain = plainKey
  }
  saveSettings(s)
}

export function getHevyKey(): string | null {
  const s = loadSettings()
  if (s.hevyKeyEncrypted) {
    try {
      return safeStorage.decryptString(Buffer.from(s.hevyKeyEncrypted, 'base64'))
    } catch {
      return null
    }
  }
  return s.hevyKeyPlain
}

export function hevyKeyMasked(): string | null {
  const k = getHevyKey()
  if (!k) return null
  return '••••••••' + k.slice(-4)
}
