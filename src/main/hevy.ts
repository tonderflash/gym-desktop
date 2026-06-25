// Cliente Hevy: pageSize máx 10; 404 = fin de paginación (no es error).
import { getHevyKey } from './settings'
import { writeCache, readCache, type HevyWorkout } from './store'
import { logicalDateFromDt, localIso } from './logic'

const BASE = 'https://api.hevyapp.com/v1'
const PAGE_SIZE = 10
const PAGES = 5

async function fetchPage(key: string, page: number): Promise<HevyWorkout[] | null> {
  const res = await fetch(`${BASE}/workouts?page=${page}&pageSize=${PAGE_SIZE}`, {
    headers: { 'api-key': key, accept: 'application/json' },
  })
  if (res.status === 404) return null // fin de paginación
  if (!res.ok) throw new Error(`Hevy HTTP ${res.status}`)
  const data = (await res.json()) as { workouts?: HevyWorkout[] }
  return data.workouts ?? []
}

/** Trae hasta PAGES×PAGE_SIZE workouts y persiste el cache. */
export async function fetchWorkouts(): Promise<HevyWorkout[]> {
  const key = getHevyKey()
  if (!key) return readCache().workouts

  const all: HevyWorkout[] = []
  for (let page = 1; page <= PAGES; page++) {
    const batch = await fetchPage(key, page)
    if (batch === null || batch.length === 0) break
    all.push(...batch)
    if (batch.length < PAGE_SIZE) break
  }
  writeCache({ fetched_at: localIso(), workouts: all })
  return all
}

export async function testKey(key: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${BASE}/workouts?page=1&pageSize=1`, {
      headers: { 'api-key': key, accept: 'application/json' },
    })
    if (res.ok || res.status === 404) return { ok: true }
    if (res.status === 401 || res.status === 403) return { ok: false, error: 'Key inválida (401)' }
    return { ok: false, error: `HTTP ${res.status}` }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error de red' }
  }
}

/** Fechas lógicas únicas de entrenamiento, DESC. */
export function gymDates(workouts: HevyWorkout[]): string[] {
  const set = new Set<string>()
  for (const w of workouts) {
    if (!w.start_time) continue
    const dt = new Date(w.start_time) // ISO UTC → hora local de la máquina
    if (Number.isNaN(dt.getTime())) continue
    set.add(logicalDateFromDt(dt))
  }
  return [...set].sort().reverse()
}

/** Workout (título/duración/tipo) para una fecha lógica dada. */
export function workoutInfoForDate(workouts: HevyWorkout[], dateIso: string): {
  title: string
  durationMin: number | null
} | null {
  for (const w of workouts) {
    if (!w.start_time) continue
    const dt = new Date(w.start_time)
    if (Number.isNaN(dt.getTime())) continue
    if (logicalDateFromDt(dt) !== dateIso) continue
    let dur: number | null = null
    if (w.end_time) {
      const end = new Date(w.end_time)
      if (!Number.isNaN(end.getTime())) dur = Math.round((end.getTime() - dt.getTime()) / 60000)
    }
    return { title: w.title ?? '', durationMin: dur }
  }
  return null
}
