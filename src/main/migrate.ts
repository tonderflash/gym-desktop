// Importa la data del gym-bar Python (macOS) si existe: daily_log.csv,
// cache.json y factors_config.json → settings. No toca los archivos origen.
import { existsSync, readFileSync, copyFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { paths } from './env'
import { loadSettings, patchSettings } from './settings'
import { readLog } from './store'
import type { FactorDef } from '@shared/types'

const LEGACY_DIR = join(homedir(), 'Library', 'Application Support', 'gym-bar')

export function legacyAvailable(): boolean {
  return process.platform === 'darwin' && existsSync(join(LEGACY_DIR, 'daily_log.csv'))
}

export function importLegacy(force = false): { ok: boolean; imported?: number; error?: string } {
  if (!legacyAvailable()) return { ok: false, error: 'No se encontró data de gym-bar' }
  const haveRows = readLog().size
  if (haveRows > 0 && !force) {
    return { ok: false, error: `Ya hay ${haveRows} filas locales — importación manual requerida` }
  }
  try {
    copyFileSync(join(LEGACY_DIR, 'daily_log.csv'), paths.log())
    const legacyCache = join(LEGACY_DIR, 'cache.json')
    if (existsSync(legacyCache)) copyFileSync(legacyCache, paths.cache())

    const legacyFactors = join(LEGACY_DIR, 'factors_config.json')
    if (existsSync(legacyFactors)) {
      const cfg = JSON.parse(readFileSync(legacyFactors, 'utf-8')) as {
        user_id?: string
        rest_days_weekday?: number[]
        factors?: FactorDef[]
      }
      patchSettings({
        userId: cfg.user_id ?? loadSettings().userId,
        restDays: cfg.rest_days_weekday ?? loadSettings().restDays,
        factors: cfg.factors?.length ? cfg.factors : loadSettings().factors,
        migratedFromGymBar: true,
      })
    } else {
      patchSettings({ migratedFromGymBar: true })
    }
    return { ok: true, imported: readLog().size }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error importando' }
  }
}

/** Auto-import silencioso en primer arranque (solo si no hay data propia). */
export function autoMigrateOnFirstRun(): void {
  const s = loadSettings()
  if (s.migratedFromGymBar) return
  if (readLog().size > 0) return
  if (!legacyAvailable()) return
  importLegacy()
}
