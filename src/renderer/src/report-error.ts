// Canal único para reportar errores del renderer al errors.log del main
// (el renderer está en sandbox y no puede escribir a disco). Best-effort:
// si el puente no existe (main viejo), al menos queda en la consola.
export function reportRendererError(source: string, detail: unknown): void {
  const message = detail instanceof Error ? `${detail.message}\n${detail.stack ?? ''}` : String(detail)
  console.error(`[${source}]`, message)
  try {
    void window.extensions.invoke('app:logError', source, message).catch(() => undefined)
  } catch {
    /* puente ausente: consola ya lo tiene */
  }
}

/** Listeners globales: promesas rechazadas sin catch y errores sueltos de
 *  window dejan rastro en vez de evaporarse. Llamar una vez al arrancar. */
export function installGlobalErrorReporting(): void {
  window.addEventListener('error', (e) => {
    reportRendererError('window:error', e.error ?? e.message)
  })
  window.addEventListener('unhandledrejection', (e) => {
    reportRendererError('window:unhandledrejection', e.reason)
  })
}
