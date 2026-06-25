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
}

export interface SettingsPatch {
  restDays?: number[]
  factors?: FactorDef[]
  weatherLat?: number | null
  weatherLon?: number | null
  reminderHour?: number
  reminderMinute?: number
  hevyKey?: string
}

export type UpdaterEvent =
  | { type: 'checking' }
  | { type: 'none' }
  | { type: 'available'; version: string }
  | { type: 'progress'; percent: number }
  | { type: 'downloaded'; version: string }
  | { type: 'manual'; version: string; url: string }
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
  updaterAction(action: 'check' | 'install' | 'openLatest'): Promise<void>
  onStateUpdate(cb: (s: AppState) => void): () => void
  onUpdaterEvent(cb: (e: UpdaterEvent) => void): () => void
  onNavigate(cb: (page: string) => void): () => void
}
