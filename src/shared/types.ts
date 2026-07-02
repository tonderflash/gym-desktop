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

export interface MuscleInsight {
  key: string
  label: string
  /** series efectivas (ponderadas por implicación) últimos 7 días */
  sets7d: number
  /** objetivo semanal del programa */
  targetSets: number
  lastDaysAgo: number | null
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
  volume: VolumeInsight
  prs: PrInsight[]
  findings: Finding[]
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
