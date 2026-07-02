import { readFileSync, writeFileSync, existsSync, renameSync, copyFileSync, readdirSync, unlinkSync } from 'fs'
import { join } from 'path'
import { paths } from './env'
import { parseCsv, serializeCsv } from './csv'
import { loadSettings } from './settings'
import { SCHEMA_VERSION, FIXED_PRE, FIXED_POST } from '@shared/schema'
import { localIso } from './logic'

export type LogRow = Record<string, string>

function tzOffsetHours(): number {
  return -new Date().getTimezoneOffset() / 60
}

/** Header = fijas pre + factor_* (config ∪ existentes) + fijas post + extras. */
function buildHeader(existingHeader: string[]): string[] {
  const s = loadSettings()
  const configFactors = s.factors.map((f) => `factor_${f.key}`)
  const existingFactors = existingHeader.filter((c) => c.startsWith('factor_'))
  const factorCols = [...new Set([...existingFactors, ...configFactors])]
  const known = new Set<string>([...FIXED_PRE, ...factorCols, ...FIXED_POST])
  const extras = existingHeader.filter((c) => c && !known.has(c))
  return [...FIXED_PRE, ...factorCols, ...FIXED_POST, ...extras]
}

export function readLog(): Map<string, LogRow> {
  const map = new Map<string, LogRow>()
  if (!existsSync(paths.log())) return map
  try {
    const rows = parseCsv(readFileSync(paths.log(), 'utf-8'))
    for (const r of rows) {
      if (r.date) map.set(r.date, r)
    }
  } catch {
    /* CSV ilegible → tratar como vacío, nunca crashear la app */
  }
  return map
}

function writeAll(map: Map<string, LogRow>): void {
  const existingHeader = existsSync(paths.log())
    ? Object.keys(parseCsv(readFileSync(paths.log(), 'utf-8'))[0] ?? {})
    : []
  const header = buildHeader(existingHeader)
  const rows = [...map.values()].sort((a, b) => a.date.localeCompare(b.date))
  const tmp = paths.log() + '.tmp'
  writeFileSync(tmp, serializeCsv(header, rows), 'utf-8')
  renameSync(tmp, paths.log())
  backupDaily()
}

/** Upsert por fecha. Solo pisa las keys presentes en entry (merge). */
export function writeLogEntry(entry: Record<string, unknown>): boolean {
  const date = String(entry.date ?? '')
  if (!date) return false
  const map = readLog()
  const row: LogRow = map.get(date) ?? { date }

  for (const [k, v] of Object.entries(entry)) {
    if (v === undefined || v === null) continue
    row[k] = String(v)
  }

  // Autopoblar metadata si falta
  const s = loadSettings()
  if (!row.schema_version) row.schema_version = SCHEMA_VERSION
  if (!row.user_id) row.user_id = s.userId
  if (!row.tz_offset) row.tz_offset = String(tzOffsetHours())
  // was_rest_day ya NO se deriva del calendario (un día de semana fijo): el
  // modelo sigue la rotación real, no etiqueta días por calendario rígido.
  if (!row.saved_at) row.saved_at = localIso()

  map.set(date, row)
  try {
    writeAll(map)
    return true
  } catch {
    return false
  }
}

/** Snapshot diario en backups/, retiene los últimos 30. */
function backupDaily(): void {
  try {
    const today = new Date().toISOString().slice(0, 10)
    const dest = join(paths.backups(), `daily_log-${today}.csv`)
    if (!existsSync(dest) && existsSync(paths.log())) {
      copyFileSync(paths.log(), dest)
      const all = readdirSync(paths.backups()).filter((f) => f.startsWith('daily_log-')).sort()
      while (all.length > 30) {
        const oldest = all.shift()!
        unlinkSync(join(paths.backups(), oldest))
      }
    }
  } catch {
    /* backup nunca debe romper un write */
  }
}

// ── Cache de workouts Hevy ───────────────────────────────────────────────
// El API devuelve el workout completo y el cache lo persiste tal cual; estos
// tipos describen lo que ya está en disco (sets con peso/reps/rpe incluidos).
export interface HevySet {
  type?: string // 'warmup' | 'normal' | 'failure' | …
  weight_kg?: number | null
  reps?: number | null
  rpe?: number | null
}

export interface HevyExercise {
  title?: string
  sets?: HevySet[]
}

export interface HevyWorkout {
  id: string
  title: string
  start_time: string
  end_time: string
  exercises?: HevyExercise[]
}

export interface HevyCache {
  fetched_at: string | null
  workouts: HevyWorkout[]
}

export function readCache(): HevyCache {
  if (!existsSync(paths.cache())) return { fetched_at: null, workouts: [] }
  try {
    const raw = JSON.parse(readFileSync(paths.cache(), 'utf-8'))
    return { fetched_at: raw.fetched_at ?? null, workouts: raw.workouts ?? [] }
  } catch {
    return { fetched_at: null, workouts: [] }
  }
}

export function writeCache(c: HevyCache): void {
  writeFileSync(paths.cache(), JSON.stringify(c, null, 2), 'utf-8')
}
