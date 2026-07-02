import { app, BrowserWindow, nativeImage, shell, session } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { ensureDirs, isDev, paths } from './env'
import { loadSettings } from './settings'
import { autoMigrateOnFirstRun } from './migrate'
import { registerIpc, broadcastState, onBroadcast, setIpcWindow } from './ipc'
import { startScheduler } from './scheduler'
import { initUpdater, setUpdaterWindow } from './updater'
import { refreshAll, buildState, markWentManual } from './pipeline'
import { logicalToday } from './logic'
import { createTray, refreshTray, type TrayActions } from './tray'
import { registerExtensions } from './extensions/loader'

/** Páginas a las que el tray puede saltar; 'skip' abre el modal de razón. */
type NavTarget = 'dashboard' | 'checkin' | 'history' | 'settings' | 'skip'

let win: BrowserWindow | null = null

function createWindow(): BrowserWindow {
  const w = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 940,
    minHeight: 600,
    show: false,
    title: 'GymBar',
    backgroundColor: '#0d3238',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 18, y: 16 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  w.on('ready-to-show', () => w.show())
  // Al cerrar la ventana, soltar la referencia para que ensureWindow la recree.
  w.on('closed', () => { win = null })

  // Links externos: solo https, nunca file:/smb:/etc., y siempre fuera de la app
  w.webContents.setWindowOpenHandler(({ url }) => {
    try {
      if (new URL(url).protocol === 'https:') void shell.openExternal(url)
    } catch { /* URL malformada → ignorar */ }
    return { action: 'deny' }
  })

  // La ventana solo puede navegar dentro de sí misma (dev server o file local)
  w.webContents.on('will-navigate', (e, url) => {
    const devUrl = process.env.ELECTRON_RENDERER_URL
    if (!(isDev && devUrl && url.startsWith(devUrl))) e.preventDefault()
  })

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    void w.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void w.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return w
}

/** Garantiza una ventana viva. Si se cerró, la recrea y re-apunta el IPC
 *  (setIpcWindow, NO registerIpc — re-registrar handlers lanzaría). */
function ensureWindow(): BrowserWindow {
  if (!win || win.isDestroyed()) {
    win = createWindow()
    setIpcWindow(win)
    setUpdaterWindow(win) // el updater también envía eventos a la ventana
  }
  return win
}

/** Muestra la ventana y navega a la página pedida (flujo rápido desde el tray). */
function showWindow(target: NavTarget = 'dashboard'): void {
  const w = ensureWindow()
  if (w.isMinimized()) w.restore()
  w.show()
  w.focus()
  const send = (): void => { if (!w.isDestroyed()) w.webContents.send('navigate', target) }
  if (w.webContents.isLoading()) {
    // ventana recién creada: esperar a que el renderer registre onNavigate
    w.webContents.once('did-finish-load', () => setTimeout(send, 150))
  } else {
    send()
  }
}

const trayActions: TrayActions = {
  onOpen: () => showWindow('dashboard'),
  onCheckin: () => showWindow('checkin'),
  onSkipReason: () => showWindow('skip'),
  onMarkWent: () => { if (markWentManual(logicalToday())) broadcastState() },
  onHistory: () => showWindow('history'),
  onOpenCsv: () => { void shell.openPath(paths.log()) },
  onFactors: () => showWindow('settings'),
  onRefresh: () => { void refreshAll().catch(() => undefined).then(() => broadcastState()) },
  onQuit: () => app.quit(),
}

// En dev, Electron muestra su átomo en el Dock. Cargamos el icono de marca
// a mano. En prod, electron-builder ya incrustó build/icon.icns en el .app.
function setDockIconInDev(): void {
  if (process.platform !== 'darwin' || !isDev || !app.dock) return
  const p = join(app.getAppPath(), 'build', 'icon.png')
  if (existsSync(p)) app.dock.setIcon(nativeImage.createFromPath(p))
}

// Nombre visible en la barra de menús de macOS y el panel "Acerca de".
// En empaquetado lo toma de electron-builder (productName: GymBar); en dev
// Electron usaría "Electron" si no lo forzamos aquí, antes de crear el menú.
app.setName('GymBar')
app.setAboutPanelOptions({ applicationName: 'GymBar' })

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (win && !win.isDestroyed()) { win.show(); win.focus() }
  })

  app.whenReady().then(async () => {
    // La app no usa cámara/micrófono/geolocalización/etc. — denegar todo
    session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false))

    setDockIconInDev()
    ensureDirs()
    loadSettings()
    autoMigrateOnFirstRun()

    win = createWindow()
    registerIpc(win)          // registra handlers UNA vez + fija la ventana destino
    registerExtensions()      // extensiones desacopladas auto-descubiertas (gymvision, nutrition)
    createTray(trayActions)   // icono de marca en la barra superior (macOS)
    onBroadcast(refreshTray)  // cada cambio de estado repinta el menú del tray
    initUpdater(win)

    // Pinta el tray con el estado en cache, sin esperar el primer fetch.
    refreshTray(buildState())

    // Dispara el primer ciclo (fetch → broadcastState → refreshTray) + timers.
    startScheduler(win)

    app.on('activate', () => showWindow('dashboard'))
  })

  // En macOS la app vive en el tray; cerrar ventana no mata el scheduler.
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
