// Red de seguridad de errores: nada muere en silencio.
//
// - Errores no manejados del PROCESO MAIN (uncaughtException / rechazos de
//   promesas) → errors.log en la carpeta de datos + dialog (una sola vez por
//   sesión, para no spamear).
// - Errores del RENDERER (window.onerror / unhandledrejection, reportados por
//   el puente ext:app:logError) → mismo errors.log.
//
// El log es append-only y con timestamp: si algo "raro pasó ayer", ahí está.
import { dialog, ipcMain } from 'electron'
import { appendFileSync } from 'fs'
import { join } from 'path'
import { dataDir } from './env'

const logPath = (): string => join(dataDir(), 'errors.log')

export function logError(source: string, err: unknown): void {
  const detail = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err)
  const line = `[${new Date().toISOString()}] [${source}] ${detail}\n`
  try {
    appendFileSync(logPath(), line, 'utf-8')
  } catch {
    /* disco lleno / carpeta aún no creada: al menos queda en consola */
  }
  console.error(line.trimEnd())
}

let fatalDialogShown = false

export function installCrashGuard(): void {
  process.on('uncaughtException', (err) => {
    logError('main:uncaughtException', err)
    if (!fatalDialogShown) {
      fatalDialogShown = true
      dialog.showErrorBox(
        'GymBar — error interno',
        `${err instanceof Error ? err.message : String(err)}\n\n` +
        `Detalle completo en:\n${logPath()}\n\n` +
        'La app sigue corriendo; si ves comportamientos raros, reiníciala (Cmd+Q).',
      )
    }
  })
  process.on('unhandledRejection', (reason) => {
    logError('main:unhandledRejection', reason)
  })

  // Receptor de errores del renderer — el renderer no puede escribir a disco.
  ipcMain.handle('ext:app:logError', (_e, source: unknown, message: unknown) => {
    logError(`renderer:${String(source).slice(0, 80)}`, String(message).slice(0, 4000))
    return { ok: true }
  })
}
