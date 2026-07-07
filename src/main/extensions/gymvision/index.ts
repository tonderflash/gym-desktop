// Extensión GymVision (proceso main) — habla con la API local de Django
// (el proyecto gymvision, `python manage.py runserver`). Solo expone canales
// `ext:gymvision:*`. Para desactivar la integración: BORRA esta carpeta y la
// gemela en src/renderer/src/features/gymvision/.
import { ipcMain, dialog, BrowserWindow } from 'electron'
import { setBusy } from '../../busy'
import { getHevyKey } from '../../settings'

// Base configurable por env; por defecto el runserver local de GymVision.
const BASE = (process.env.GYMVISION_API ?? 'http://127.0.0.1:8000/api').replace(/\/$/, '')

export interface ApiResult<T = unknown> {
  ok: boolean
  data?: T
  error?: string
  status?: number
}

interface CallOpts extends RequestInit {
  timeoutMs?: number
}

async function call<T = unknown>(path: string, opts: CallOpts = {}): Promise<ApiResult<T>> {
  const { timeoutMs = 6000, ...init } = opts
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(timeoutMs),
    })
    let data: unknown = null
    try { data = await res.json() } catch { /* respuesta sin body */ }
    if (!res.ok) {
      const error = (data as { error?: string })?.error ?? `HTTP ${res.status}`
      return { ok: false, status: res.status, error }
    }
    return { ok: true, data: data as T }
  } catch (e) {
    // Distinguir "no está corriendo" de "está corriendo pero tardó": el
    // remedio del usuario es distinto (arrancar el server vs esperar/reintentar).
    const timedOut = e instanceof DOMException && e.name === 'TimeoutError'
    return { ok: false, error: timedOut ? 'timeout' : 'offline', status: 0 }
  }
}

const q = (slug?: string) => (slug ? `?athlete=${encodeURIComponent(slug)}` : '')

export function register(): void {
  // Guarda de proceso: el renderer declara su pipeline activo y el registro
  // global (main/busy.ts) activa el powerSaveBlocker; index.ts lo consulta
  // antes de permitir el quit real. Cerrar la ventana solo la oculta, así que
  // el pipeline sobrevive sin fricción.
  ipcMain.handle('ext:gymvision:setBusy', (_e, reason?: string | null) => {
    setBusy(typeof reason === 'string' && reason.trim() ? reason : null)
    return { ok: true }
  })

  ipcMain.handle('ext:gymvision:ping', () => call('/'))
  ipcMain.handle('ext:gymvision:athletes', () => call('/athletes/'))
  ipcMain.handle('ext:gymvision:exercises', () => call('/exercises/'))
  ipcMain.handle('ext:gymvision:summary', (_e, slug?: string) => call(`/vbt/summary/${q(slug)}`))
  ipcMain.handle('ext:gymvision:sessions', (_e, slug?: string) => call(`/sessions/${q(slug)}`))
  ipcMain.handle('ext:gymvision:session', (_e, id: number) =>
    call(`/sessions/${Number(id)}/`))
  ipcMain.handle('ext:gymvision:activate', (_e, slug: string) =>
    call(`/athletes/${encodeURIComponent(String(slug))}/activate/`, { method: 'POST' }))
  ipcMain.handle('ext:gymvision:createAthlete', (_e, name: string) =>
    call('/athletes/', { method: 'POST', body: JSON.stringify({ name: String(name ?? '').trim() }) }))

  // ── integración Hevy (espejo local en Django) ──────────────────────────
  // Lo entrenado ese día según Hevy, con cada serie enlazada (o no) a su
  // sesión VBT. El endpoint puede auto-sincronizar contra Hevy → timeout amplio.
  ipcMain.handle('ext:gymvision:hevyDay', (_e, date: string, refresh?: boolean) =>
    call(`/hevy/day/${encodeURIComponent(String(date))}/${refresh ? '?refresh=1' : ''}`,
      { timeoutMs: 30000 }))

  // Reutiliza la API key que GymBar ya guarda en sus settings: Django la
  // persiste en su config la primera vez y de ahí sincroniza solo.
  ipcMain.handle('ext:gymvision:hevySync', () =>
    call('/hevy/sync/', {
      method: 'POST',
      body: JSON.stringify({ api_key: getHevyKey() ?? '' }),
      timeoutMs: 30000,
    }))

  // Corrige el peso de una sesión sin re-analizar: {from_hevy:true} toma el
  // peso ya sincronizado de la serie enlazada; {weight_kg:N} es manual.
  ipcMain.handle('ext:gymvision:updateWeight',
    (_e, id: number, payload: Record<string, unknown>) =>
      call(`/sessions/${Number(id)}/weight/`, {
        method: 'POST',
        body: JSON.stringify(payload ?? {}),
      }))

  // ── flujo de entrada de datos ──────────────────────────────────────────
  // Selector NATIVO de video (el renderer está en sandbox, no puede abrir FS).
  ipcMain.handle('ext:gymvision:pickVideo', async () => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const res = await dialog.showOpenDialog(win, {
      title: 'Selecciona el video de la serie',
      properties: ['openFile'],
      filters: [{ name: 'Video', extensions: ['mov', 'mp4', 'm4v', 'avi', 'mkv', 'webm'] }],
    })
    if (res.canceled || res.filePaths.length === 0) return { ok: false, error: 'cancelado' }
    const path = res.filePaths[0]
    return { ok: true, data: { path, name: path.split('/').pop() ?? path } }
  })

  // Crea la sesión copiando el video local (por ruta) hacia GymVision.
  ipcMain.handle('ext:gymvision:createSession', (_e, payload: Record<string, unknown>) =>
    call('/sessions/create/', {
      method: 'POST',
      body: JSON.stringify(payload ?? {}),
      timeoutMs: 60000, // copiar el archivo puede tardar
    }))

  ipcMain.handle('ext:gymvision:saveSeed', (_e, id: number, bbox: Record<string, number>) =>
    call(`/sessions/${Number(id)}/seed/`, { method: 'POST', body: JSON.stringify(bbox ?? {}) }))

  // Anotaciones manuales (verdad absoluta): barra {frame,x,y,w,h} + pose {frame,joint,x,y}.
  ipcMain.handle('ext:gymvision:saveKeyframes',
    (_e, id: number, keyframes: unknown[], poseKeyframes: unknown[]) =>
      call(`/sessions/${Number(id)}/keyframes/`, {
        method: 'POST',
        body: JSON.stringify({ keyframes: keyframes ?? [], pose_keyframes: poseKeyframes ?? [] }),
      }))

  // Procesamiento de visión: pesado, puede tardar minutos.
  ipcMain.handle('ext:gymvision:analyze', (_e, id: number) =>
    call(`/sessions/${Number(id)}/analyze/`, { method: 'POST', timeoutMs: 600000 }))
}
