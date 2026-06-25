import { safeStorage } from 'electron'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { randomUUID } from 'crypto'
import { paths } from './env'
import { DEFAULT_FACTORS, DEFAULT_REST_DAYS, DEFAULT_REMINDER } from '@shared/schema'
import type { FactorDef } from '@shared/types'

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
  }
}

export function loadSettings(): Settings {
  if (cached) return cached
  if (existsSync(paths.settings())) {
    try {
      const raw = JSON.parse(readFileSync(paths.settings(), 'utf-8'))
      cached = { ...defaults(), ...raw }
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
