// Menú del tray (barra superior macOS) — réplica del menú rico de la versión
// Python: encabezado de riesgo + plan del día + flujos rápidos. Es PRESENTACIÓN
// pura: no importa ipc/pipeline/scheduler; todas las acciones llegan por
// callbacks desde index.ts. Eso evita imports circulares por diseño.
import { Tray, Menu, nativeImage, type MenuItemConstructorOptions } from 'electron'
import type { AppState } from '@shared/types'
import { trayIconPath } from './env'

export interface TrayActions {
  onOpen: () => void
  onCheckin: () => void
  onSkipReason: () => void
  onMarkWent: () => void
  onHistory: () => void
  onOpenCsv: () => void
  onFactors: () => void
  onRefresh: () => void
  onQuit: () => void
}

const LEVEL_TAG: Record<AppState['riskLevel'], string> = {
  low: 'Bajo',
  med: 'Medio',
  high: 'Alto',
}

let tray: Tray | null = null
let actions: TrayActions | null = null

/** "2026-06-13" → "13/06" */
function ddmm(iso: string): string {
  const parts = iso.split('-')
  return parts.length === 3 ? `${parts[2]}/${parts[1]}` : iso
}

/** "2026-06-14T20:16:32" → "20:16" (mismo corte que usa el Dashboard) */
function hhmm(s?: string | null): string {
  return (s ?? '').slice(11, 16)
}

function sessionLabel(s: AppState): string {
  if (s.nextSession) return s.isRestDay ? `${s.nextSession} · sueles descansar` : s.nextSession
  return '—'
}

function lastLabel(s: AppState): string {
  if (!s.lastWorkout) return 'Última: sin datos'
  const ago = s.lastWorkout.daysAgo === 0 ? 'hoy' : `hace ${s.lastWorkout.daysAgo}d`
  return `Última: ${ddmm(s.lastWorkout.date)} · ${ago}`
}

function weekLabel(s: AppState): string {
  const target = Math.max(0, s.weekTarget)
  const filled = Math.max(0, Math.min(s.weekCount, target))
  const bar = '█'.repeat(filled) + '░'.repeat(Math.max(0, target - filled))
  return `Semana: ${bar} ${s.weekCount}/${s.weekTarget}`
}

function statusLabel(s: AppState): string {
  if (s.lastError) return `Error: ${s.lastError}`
  if (s.fetchedAt) {
    const streak = s.streak > 0 ? ` · racha ${s.streak}d` : ''
    return `Fetch ${hhmm(s.fetchedAt)}${streak}`
  }
  return 'Sin fetch aún'
}

function checkinLabel(s: AppState): string {
  switch (s.checkin.status) {
    case 'done': {
      const t = hhmm(s.checkin.savedAt)
      return t ? `Editar check-in · hecho ${t}` : 'Editar check-in de hoy'
    }
    case 'late': return 'Check-in del día (tarde)'
    case 'pending': return 'Check-in del día — pendiente'
    default: return 'Check-in del día'
  }
}

/** ¿Fetch viejo (>6h)? — habilita el prefijo "! " del título junto con un error. */
function isStale(s: AppState): boolean {
  if (!s.fetchedAt) return true
  const t = Date.parse(s.fetchedAt)
  if (Number.isNaN(t)) return false
  return Date.now() - t > 6 * 3600 * 1000
}

export function createTray(a: TrayActions): void {
  if (process.platform !== 'darwin' || tray) return
  actions = a
  const img = nativeImage.createFromPath(trayIconPath())
  img.setTemplateImage(true) // monocromo: macOS lo tiñe según el tema de la barra
  tray = new Tray(img)
  tray.setTitle('—')
  tray.setToolTip('GymBar — riesgo de faltar hoy')
}

/** Reconstruye título + menú desde el estado. Idempotente; llamar en cada cambio. */
export function refreshTray(s: AppState): void {
  if (!tray || !actions) return

  const prefix = s.lastError && isStale(s) ? '! ' : ''
  tray.setTitle(`${prefix}${s.riskPct}%`)
  tray.setToolTip(`GymBar — ${s.riskPct}% riesgo de faltar hoy`)

  // Item de outcome: clickeable solo si hay deuda real (días cerrados sin razón).
  // Sin deuda queda gris — imposible registrar razones prematuras (poka-yoke).
  const debtItem: MenuItemConstructorOptions = s.debt.length > 0
    ? {
        label: `Resolver día pendiente: ${s.debt[0].label}` +
          (s.debt.length > 1 ? ` y ${s.debt.length - 1} más` : ''),
        click: () => actions?.onSkipReason(),
      }
    : { label: 'Outcomes al día', enabled: false }

  // Confirmar asistencia de hoy desde la barra, sin abrir la app ni esperar a
  // que cierre la ventana. Solo aparece si hoy es confirmable y aún no resuelto.
  const wentTodayItems: MenuItemConstructorOptions[] = s.canMarkTodayWent
    ? [{ label: '✓ Marcar que entrené hoy', click: () => actions?.onMarkWent() }]
    : []

  const menu = Menu.buildFromTemplate([
    { label: `Riesgo de faltar: ${s.riskPct}% · ${LEVEL_TAG[s.riskLevel]}`, enabled: false },
    { type: 'separator' },
    { label: s.todayWent ? 'Hoy: entrenado ✓' : `Toca: ${sessionLabel(s)}`, enabled: false },
    { label: lastLabel(s), enabled: false },
    { label: weekLabel(s), enabled: false },
    { label: statusLabel(s), enabled: false },
    { type: 'separator' },
    ...wentTodayItems,
    { label: checkinLabel(s), click: () => actions?.onCheckin() },
    debtItem,
    { type: 'separator' },
    { label: 'Historial', click: () => actions?.onHistory() },
    { label: 'Datos (CSV)', click: () => actions?.onOpenCsv() },
    { label: 'Configurar factores', click: () => actions?.onFactors() },
    { label: 'Actualizar', click: () => actions?.onRefresh() },
    { type: 'separator' },
    { label: 'Abrir GymBar', click: () => actions?.onOpen() },
    { label: 'Salir', click: () => actions?.onQuit() },
  ])
  tray.setContextMenu(menu)
}
