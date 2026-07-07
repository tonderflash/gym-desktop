// Cliente tipado de la extensión GymVision. Habla por el puente genérico
// `window.extensions` (canales ext:gymvision:*) → main → API local de Django.

export interface ApiResult<T> {
  ok: boolean
  data?: T
  error?: string
  status?: number
}

export interface Athlete {
  id: number
  name: string
  slug: string
  is_active: boolean
  bodyweight_kg: number | null
  session_count: number
}

export interface SessionSummary {
  rep_count: number
  best_velocity: number | null       // máx de las medias por rep
  best_velocity_peak: number | null  // máx de los picos instantáneos — base correcta para comparar contra el velocímetro en vivo (también instantáneo)
  mean_velocity: number | null
  velocity_loss_pct: number | null
  best_1rm: number | null
  top_zone: string
  avg_confidence: number | null
}

export interface HevyRepMatch {
  logged: number | null
  detected: number | null
  ok: boolean
}

/** Serie de Hevy enlazada a una sesión VBT (1 video = 1 serie). */
export interface HevyLink {
  set_id: number
  set_number: number
  set_type: string
  exercise_title: string
  weight_kg: number | null
  reps: number | null
  rpe: number | null
  rep_match: HevyRepMatch | null // null = aún sin analizar
  // true si el peso se corrigió en Hevy después de crear la sesión (la sesión
  // guarda una copia) — remediable con gv.updateWeight(id, {from_hevy:true})
  weight_drift: boolean
}

export interface SessionRow {
  id: number
  date: string
  weight_kg: number
  exercise: string
  exercise_slug: string
  athlete: string | null
  athlete_slug: string | null
  pose_engine: string
  summary: SessionSummary
  hevy: HevyLink | null
}

// ── día de Hevy (GET /api/hevy/day/<fecha>/) ──────────────────────────────
export interface HevyDaySet {
  id: number
  index: number
  number: number
  type: string
  weight_kg: number | null
  reps: number | null
  rpe: number | null
  session_id: number | null // sesión VBT ya enlazada a esta serie
  session_analyzed: boolean
}

export interface HevyDayExercise {
  id: number
  title: string
  exercise_slug: string | null // null = sin mapear a un Exercise de GymVision
  exercise_name: string | null
  sets: HevyDaySet[]
}

export interface HevyDayWorkout {
  id: number
  hevy_id: string
  title: string
  start_time: string
  exercises: HevyDayExercise[]
}

export interface HevyDay {
  date: string
  configured: boolean
  last_sync: string | null
  sync_error: string | null
  workouts: HevyDayWorkout[]
}

export interface TrendPoint {
  session_id: number
  date: string
  exercise: string
  weight_kg: number
  mean_velocity: number
  best_velocity: number
  velocity_loss_pct: number | null
  best_1rm: number | null
}

export interface PR {
  exercise: string
  best_1rm: number
  weight_kg: number
  date: string
}

export interface VbtSummary {
  athlete: string | null
  athlete_slug?: string
  session_count: number
  last_session?: string | null
  velocity_trend: TrendPoint[]
  zone_distribution: Record<string, number>
  prs: PR[]
}

export interface Exercise {
  slug: string
  name: string
  requires_bar_tracker: boolean
  has_zones: boolean
}

export interface Rep {
  number: number
  velocity_mean: number | null
  velocity_peak: number | null
  velocity_loss_pct: number | null
  time_concentric: number | null
  time_eccentric: number | null
  time_pause: number | null
  knee_angle_bottom: number | null
  hip_angle_bottom: number | null
  torso_angle_bottom: number | null
  knee_valgus_detected: boolean
  bar_path_lateral_dev: number | null
  training_zone: string
  estimated_1rm: number | null
  tracking_confidence: number | null
  // ventana concéntrica en frames del video — para overlays sincronizados
  frame_start: number | null
  frame_end: number | null
}

export type Bbox = { x: number; y: number; w: number; h: number }
export type Keyframe = { frame: number; x: number; y: number; w: number; h: number }
export type PoseJoint = 'shoulder' | 'hip' | 'knee' | 'ankle'
export type PoseKeyframe = {
  frame: number; joint: PoseJoint; x: number; y: number
  rel_bar?: boolean   // sigue la barra (offset desde el plato) cuando está ocluida
}

export interface SessionDetail extends SessionRow {
  notes: string
  reps: Rep[]
  zones: Record<string, number> | null
  video_url: string | null
  video_file: string | null
  annotated_url: string | null
  first_frame_url: string | null
  bar_seed: number[] | null
  bar_keyframes: Keyframe[]
  pose_keyframes: PoseKeyframe[]
  fps: number | null
  frame_count: number | null
  analyzed: boolean
  plate_diameter_m: number
  // rapidez instantánea del plato por frame (m/s, EMA — la curva del HUD);
  // alimenta el velocímetro en vivo sincronizado con el playback
  velocity_series: number[]
}

export interface NewSession {
  exercise?: string // opcional si viene hevy_set_id (se resuelve desde Hevy)
  date: string
  weight_kg?: number // opcional si viene hevy_set_id (precarga de Hevy)
  pose_engine: string
  video_path: string
  plate_diameter_m?: number
  notes?: string
  hevy_set_id?: number
}

const API_BASE = 'http://127.0.0.1:8000/api'

function isStaleMain(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return msg.includes('No handler registered')
}

async function directFetch<T>(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<ApiResult<T>> {
  const { timeoutMs = 6000, ...rest } = init
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...rest,
      headers: { 'Content-Type': 'application/json', ...(rest.headers ?? {}) },
      signal: AbortSignal.timeout(timeoutMs),
    })
    let data: unknown = null
    try { data = await res.json() } catch { /* sin body */ }
    if (!res.ok) {
      const error = (data as { error?: string })?.error ?? `HTTP ${res.status}`
      return { ok: false, status: res.status, error }
    }
    return { ok: true, data: data as T }
  } catch (e) {
    const timedOut = e instanceof DOMException && e.name === 'TimeoutError'
    return { ok: false, error: timedOut ? 'timeout' : 'offline', status: 0 }
  }
}

/** Mensaje humano para los errores de transporte del cliente.
 *  'offline'/'timeout' son los códigos que emite la capa de fetch (main y
 *  directo); cualquier otro string ya viene legible del API de Django. */
export function humanError(error: string | undefined, fallback = 'Error inesperado'): string {
  if (error === 'offline') return 'GymVision no responde — ¿está corriendo el motor?'
  if (error === 'timeout') return 'El motor tardó demasiado en responder (sigue vivo: reintenta).'
  if (error === 'unavailable') return 'Extensión no disponible — reinicia la app (Cmd+Q).'
  return error || fallback
}

async function call<T>(channel: string, ...args: unknown[]): Promise<ApiResult<T>> {
  return window.extensions.invoke<ApiResult<T>>(`gymvision:${channel}`, ...args)
}

async function callOrDirect<T>(
  channel: string,
  direct: () => Promise<ApiResult<T>>,
  ...args: unknown[]
): Promise<ApiResult<T>> {
  try {
    return await call<T>(channel, ...args)
  } catch (err) {
    if (isStaleMain(err)) return direct()
    throw err
  }
}

export const gv = {
  ping: () => call<{ ok: boolean; active_athlete: string | null }>('ping'),
  athletes: () => call<Athlete[]>('athletes'),
  exercises: () => call<Exercise[]>('exercises'),
  summary: (slug?: string) => call<VbtSummary>('summary', slug),
  sessions: (slug?: string) => call<SessionRow[]>('sessions', slug),
  session: (id: number) => call<SessionDetail>('session', id),
  activate: (slug: string) => call<Athlete>('activate', slug),
  createAthlete: (name: string) => call<Athlete>('createAthlete', name),
  // Corrige el peso de una sesión sin re-analizar (recalcula solo el 1RM).
  updateWeight: (id: number, payload: { from_hevy: true } | { weight_kg: number }) =>
    callOrDirect<SessionDetail>(
      'updateWeight',
      () => directFetch<SessionDetail>(`/sessions/${id}/weight/`, {
        method: 'POST', body: JSON.stringify(payload),
      }),
      id, payload,
    ),
  // Declara al proceso main que hay un pipeline en curso (subida/seed/análisis):
  // activa la confirmación al cerrar la ventana y el powerSaveBlocker.
  // Con un main desactualizado el canal no existe → ignorar (solo pierde la guarda).
  setBusy: (reason: string | null) =>
    call<{ ok: boolean }>('setBusy', reason).catch(() => ({ ok: false }) as ApiResult<{ ok: boolean }>),
  // integración Hevy (espejo local en Django). Con main desactualizado cae a
  // fetch directo (el sync directo depende de que Django ya tenga la key).
  hevyDay: (date: string, refresh?: boolean) =>
    callOrDirect<HevyDay>(
      'hevyDay',
      () => directFetch<HevyDay>(
        `/hevy/day/${encodeURIComponent(date)}/${refresh ? '?refresh=1' : ''}`,
        { timeoutMs: 30000 }),
      date, refresh,
    ),
  hevySync: () =>
    callOrDirect<{ ok: boolean; created: number; updated: number }>(
      'hevySync',
      () => directFetch(`/hevy/sync/`, { method: 'POST', body: '{}', timeoutMs: 30000 }),
    ),
  // flujo de entrada de datos
  pickVideo: () => call<{ path: string; name: string }>('pickVideo'),
  createSession: (payload: NewSession) => call<SessionDetail>('createSession', payload),
  saveSeed: (id: number, bbox: Bbox) => call<{ ok: boolean; bar_seed: number[] }>('saveSeed', id, bbox),
  saveKeyframes: (id: number, keyframes: Keyframe[], poseKeyframes: PoseKeyframe[]) =>
    callOrDirect(
      'saveKeyframes',
      () => directFetch(`/sessions/${id}/keyframes/`, {
        method: 'POST', body: JSON.stringify({ keyframes, pose_keyframes: poseKeyframes }),
      }),
      id, keyframes, poseKeyframes,
    ),
  analyze: (id: number) =>
    callOrDirect(
      'analyze',
      () => directFetch<SessionDetail>(`/sessions/${id}/analyze/`, { method: 'POST', timeoutMs: 600000 }),
      id,
    ),
}

export const ZONE_LABEL: Record<string, string> = {
  power: 'POWER',
  strength_speed: 'STR-SPEED',
  hypertrophy: 'HYPERTROPHY',
  max_strength: 'MAX-STRENGTH',
  danger: 'GRINDER',
}

export const ZONE_ORDER = ['power', 'strength_speed', 'hypertrophy', 'max_strength', 'danger']
