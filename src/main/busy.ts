// Registro global de "hay un proceso largo en curso" (análisis de video, etc).
// Las features lo setean vía IPC; index.ts lo consulta antes de DEJAR SALIR la
// app (Cmd+Q). Cerrar la ventana ya no destruye nada (se oculta), así que la
// única salida peligrosa es el quit real. Mientras esté activo, además, se
// bloquea la suspensión del sistema para que un análisis largo no muera por
// el reposo de la máquina.
import { powerSaveBlocker } from 'electron'

let reason: string | null = null
let blockerId: number | null = null

export function setBusy(newReason: string | null): void {
  reason = newReason
  if (newReason && blockerId === null) {
    blockerId = powerSaveBlocker.start('prevent-app-suspension')
  } else if (!newReason && blockerId !== null) {
    powerSaveBlocker.stop(blockerId)
    blockerId = null
  }
}

export function getBusyReason(): string | null {
  return reason
}
