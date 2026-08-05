import { app } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'

export const isDev = !app.isPackaged

export function dataDir(): string {
  return app.getPath('userData')
}

export const paths = {
  log: () => join(dataDir(), 'daily_log.csv'),
  cache: () => join(dataDir(), 'cache.json'),
  settings: () => join(dataDir(), 'settings.json'),
  backups: () => join(dataDir(), 'backups'),
  // Insights que el agente (Claude en /loop) va escribiendo sobre la data
  // local. El main solo LEE estos archivos; el loop es quien los escribe.
  // - agent: set ACTIVO curado (se reescribe cada ciclo, tope acotado).
  // - agentArchive: JSONL append-only — TODO insight generado, nunca se
  //   reescribe (historial completo sin inflar el archivo activo).
  agent: () => join(dataDir(), 'agent_insights.json'),
  agentArchive: () => join(dataDir(), 'agent_insights_archive.jsonl'),
}

export function ensureDirs(): void {
  mkdirSync(dataDir(), { recursive: true })
  mkdirSync(paths.backups(), { recursive: true })
}

/** Carpeta del skill empaquetado (dev: raíz del proyecto; prod: resources). */
export function skillSourceDir(): string {
  return isDev
    ? join(app.getAppPath(), 'skills')
    : join(process.resourcesPath, 'skills')
}

/** Ruta al icono de tray (template image monochrome). */
export function trayIconPath(): string {
  return isDev
    ? join(app.getAppPath(), 'build', 'trayIconTemplate.png')
    : join(process.resourcesPath, 'trayIconTemplate.png')
}
