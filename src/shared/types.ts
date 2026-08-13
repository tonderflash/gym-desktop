export interface FactorDef {
  key: string
  label: string
}

export interface RiskFactor {
  name: string
  value: string
  contrib: number
  note: string
}

export type CheckinStatus = 'open' | 'pending' | 'done' | 'late'

// ── Insights del dashboard (calculados en main desde Hevy cache + CSV) ──────

export type PaceStatus = 'ahead' | 'ontrack' | 'behind' | 'nodata'

export interface LiftProgress {
  key: 'squat' | 'bench' | 'deadlift'
  label: string
  /** e1RM estimado de sets recientes en Hevy (lbs); null = sin datos frescos */
  currentLbs: number | null
  targetLbs: number
  /** lb/semana que hay que ganar desde HOY para llegar a la meta */
  neededPerWeek: number | null
  /** lb/semana que llevas según la tendencia reciente (regresión) */
  trendPerWeek: number | null
  /** e1RM extrapolado al día del meet según la tendencia reciente */
  projectedLbs: number | null
  status: PaceStatus
  /** fuerza pico por sesión (mejor e1RM en ventana 21d), ASC */
  history: { date: string; e1rmLbs: number }[]
}

export interface MeetInsight {
  /** false = el usuario aún no configuró su objetivo (widget en estado setup) */
  configured: boolean
  name: string
  date: string
  weightClass: string | null
  daysLeft: number
  lifts: LiftProgress[]
  totalCurrentLbs: number | null
  totalTargetLbs: number
  totalProjectedLbs: number | null
  status: PaceStatus
}

// ── Mapa muscular, hipertrofia y recuperación ──────────────────────────────

/** Qué quieres de cada músculo. Define el objetivo dentro de su rango sano. */
export type MusclePriority = 'maintain' | 'grow' | 'aggressive'

/**
 * Dónde cae tu volumen semanal respecto a los umbrales del músculo:
 * none = sin trabajo · below = por debajo del MEV (mantienes, no creces)
 * growth = entre MEV y MAV (hipertrofia) · optimal = zona productiva alta
 * over = por encima del MRV (más de lo que recuperas)
 */
export type MuscleZone = 'none' | 'below' | 'growth' | 'optimal' | 'over'

export interface MuscleInsight {
  key: string
  label: string
  /** en qué figura se dibuja (la de espalda repite algunos grupos) */
  side: 'front' | 'back' | 'both'
  /** series efectivas (ponderadas por implicación) últimos 7 días */
  sets7d: number
  /**
   * A dónde apuntar: SIEMPRE un landmark (MEV si mantienes, MAV si creces),
   * nunca un número interpolado — un objetivo "entre MAV y MRV" sería
   * precisión que nadie midió.
   */
  targetSets: number
  /** volumen mínimo efectivo — debajo de esto no hay hipertrofia */
  mev: number
  /** volumen adaptativo máximo — la zona donde más se crece */
  mav: number
  /** volumen máximo recuperable — arriba de esto acumulas fatiga sin ganancia */
  mrv: number
  priority: MusclePriority
  zone: MuscleZone
  lastDaysAgo: number | null
  /** series efectivas de la última sesión que lo tocó */
  lastSessionSets: number
  /** horas que ese músculo necesita para recuperarse de esa sesión */
  recoveryHours: number | null
  /** horas transcurridas desde esa sesión */
  hoursSince: number | null
  /** 0-1; 1 = recuperado y listo para volver a estimularlo */
  readiness: number
}

/** Ejercicio logueado que ninguna regla reconoce — volumen que NO se contó. */
export interface UnmappedExercise {
  exercise: string
  sets: number
}

export interface ReadinessInsight {
  /** 0-100, promedio ponderado (los músculos prioritarios pesan más) */
  score: number
  /** listos para entrenar (readiness ≥ 1) */
  ready: string[]
  /** aún recuperándose, ascendente por horas restantes */
  recovering: { key: string; label: string; hoursLeft: number; readiness: number }[]
  /** qué toca hoy según readiness + déficit de volumen de tus prioridades */
  suggestion: string
}

// ── Fuerza máxima (1RM estimados) ──────────────────────────────────────────

export interface OneRmEntry {
  exercise: string
  /** e1RM de la mejor serie reciente (lbs) */
  e1rmLbs: number
  /** e1RM de la mejor serie del cache completo */
  bestLbs: number
  bestDate: string
  /** alta si sale de una serie pesada y cercana al fallo */
  confidence: 'low' | 'med' | 'high'
  source: { weightLbs: number; reps: number; rpe: number | null; date: string; daysAgo: number }
  /** lb/semana de la tendencia reciente; null = sin serie suficiente */
  trendPerWeek: number | null
  /** e1RM proyectado a 4 semanas si la tendencia se mantiene */
  potentialLbs: number | null
  /** cargas de trabajo derivadas del e1RM actual */
  work: { pct: number; lbs: number }[]
  isBig3: boolean
}

export interface StrengthInsight {
  lifts: OneRmEntry[]
  /** suma de los básicos con data (lbs); null si falta alguno */
  totalBig3Lbs: number | null
}

export interface WeekVolume {
  weekStart: string
  tonnageLbs: number
  sessions: number
}

export interface VolumeInsight {
  /** semanas ASC, la última es la actual (parcial) */
  weeks: WeekVolume[]
  thisWeekLbs: number
  avg4Lbs: number | null
  pctVsAvg: number | null
}

export interface PrInsight {
  exercise: string
  e1rmLbs: number
  prevLbs: number
  date: string
}

export interface Finding {
  text: string
  tone: 'ok' | 'warn' | 'info'
}

export interface Insights {
  meet: MeetInsight
  muscles: MuscleInsight[]
  /** lo que Hevy trae y el mapa NO cuenta (últimos 7 días) */
  unmapped: UnmappedExercise[]
  readiness: ReadinessInsight
  strength: StrengthInsight
  volume: VolumeInsight
  prs: PrInsight[]
  findings: Finding[]
}

// ── Agente (insights que Claude escribe en /loop sobre la data local) ───────
// La app solo LEE agent_insights.json; el loop del agente es quien lo escribe,
// eligiendo cada ciclo si busca correlaciones, tendencias o research externo.

export type AgentCategory = 'correlation' | 'trend' | 'research' | 'data'

export interface AgentInsight {
  id: string
  createdAt: string
  category: AgentCategory
  title: string
  body: string
  /** 0-100; el card ordena descendente (lo más importante primero) */
  priority: number
  confidence: 'low' | 'med' | 'high'
  tone: 'ok' | 'warn' | 'info'
  /** los números/fechas que sostienen el insight */
  evidence?: string
  /** siguiente paso accionable, si aplica */
  action?: string
  /** URL de la fuente (solo research externo) */
  source?: string
}

export interface AgentReport {
  version: number
  /** última vez que el loop escribió el archivo */
  updatedAt: string | null
  /** qué planea hacer el agente en el próximo ciclo (correlación/tendencia/research) */
  nextAction: string | null
  /** presente = el archivo existe y se pudo leer */
  present: boolean
  insights: AgentInsight[]
}

export interface AppState {
  version: string
  hevyConfigured: boolean
  today: string
  riskPct: number
  riskLevel: 'low' | 'med' | 'high'
  riskFactors: RiskFactor[]
  nextSession: string | null
  isRestDay: boolean
  todayWent: boolean
  canMarkTodayWent: boolean
  lastWorkout: { date: string; title: string; daysAgo: number } | null
  weekCount: number
  weekTarget: number
  streak: number
  fetchedAt: string | null
  checkin: { status: CheckinStatus; savedAt?: string; delayed?: boolean }
  debt: { date: string; label: string }[]
  todayRow: Record<string, string> | null
  weather: { rainProb: number | null; tempMax: number | null }
  insights: Insights
  lastError: string | null
}

export interface CheckinPayload {
  energy: number
  stress: number
  pain: string
  sleep_hours: number | null
  sleep_source: string
  intention: string
  notes: string
  factors: Record<string, 0 | 1>
  confirmDelayed?: boolean
}

export interface CheckinResult {
  ok: boolean
  errors?: string[]
  needsDelayConfirm?: boolean
  delayReason?: string
}

export interface EligibleSkipDay {
  date: string
  label: string
  current: string | null
}

export interface MeetSettings {
  name: string
  date: string
  weightClass: string | null
  targets: { squat: number; bench: number; deadlift: number }
}

export interface SettingsView {
  userId: string
  restDays: number[]
  factors: FactorDef[]
  weatherLat: number | null
  weatherLon: number | null
  reminderHour: number
  reminderMinute: number
  hevyKeyMasked: string | null
  dataDir: string
  legacyAvailable: boolean
  meet: MeetSettings
  dashboardWidgets: Record<string, boolean>
  musclePriorities: Record<string, MusclePriority>
}

export interface SettingsPatch {
  restDays?: number[]
  factors?: FactorDef[]
  weatherLat?: number | null
  weatherLon?: number | null
  reminderHour?: number
  reminderMinute?: number
  hevyKey?: string
  meet?: MeetSettings
  dashboardWidgets?: Record<string, boolean>
  musclePriorities?: Record<string, MusclePriority>
}

export type UpdaterEvent =
  | { type: 'checking' }
  | { type: 'none' }
  | { type: 'available'; version: string }
  | { type: 'progress'; percent: number }
  | { type: 'downloaded'; version: string }
  | { type: 'error'; message: string }

export interface ApiSurface {
  getState(): Promise<AppState>
  refresh(): Promise<AppState>
  saveCheckin(p: CheckinPayload): Promise<CheckinResult>
  getEligibleSkipDays(): Promise<EligibleSkipDay[]>
  saveSkipReason(date: string, reason: string): Promise<{ ok: boolean }>
  resolveWent(date: string): Promise<{ ok: boolean }>
  getHistory(): Promise<Record<string, string>[]>
  getAgentInsights(): Promise<AgentReport>
  getAgentArchive(): Promise<AgentInsight[]>
  getSettings(): Promise<SettingsView>
  saveSettings(patch: SettingsPatch): Promise<SettingsView>
  testHevyKey(key: string): Promise<{ ok: boolean; error?: string }>
  exportSkill(): Promise<{ ok: boolean; path?: string; error?: string }>
  openDataFolder(): Promise<void>
  importLegacy(): Promise<{ ok: boolean; imported?: number; error?: string }>
  updaterAction(action: 'check' | 'install'): Promise<void>
  onStateUpdate(cb: (s: AppState) => void): () => void
  onUpdaterEvent(cb: (e: UpdaterEvent) => void): () => void
  onNavigate(cb: (page: string) => void): () => void
}
