// Auto-update tipo Claude Desktop, con DOS motores según la plataforma:
//
//   electron  → electron-updater completo (Windows, o mac CON firma válida).
//   selfpatch → instalador propio para mac SIN firma: Squirrel rechaza apps
//               adhoc, así que replicamos su trabajo — bajar el zip del
//               release, verificar SHA-512 contra latest-mac.yml, swapear el
//               .app y relanzar. Mismo botón "Reiniciar y actualizar", sin
//               mandar a nadie a GitHub.
//
// Seguridad del selfpatch: solo URLs fijas https://github.com/<REPO>/…,
// versión validada por semver + solo upgrade, hash SHA-512 del manifiesto
// verificado antes de extraer, tamaño acotado, extracción con /usr/bin/ditto
// (execFile, sin shell) y swap por rename dentro del mismo volumen.
import { app, BrowserWindow } from 'electron'
import { execFile } from 'child_process'
import { createHash } from 'crypto'
import { createWriteStream, existsSync, mkdirSync, readdirSync, rmSync, renameSync } from 'fs'
import { join, dirname } from 'path'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import electronUpdater from 'electron-updater'
import { isDev } from './env'
import type { UpdaterEvent } from '@shared/types'

const { autoUpdater } = electronUpdater

// Cambiar junto con electron-builder.yml → publish
export const GITHUB_REPO = 'tonderflash/gym-desktop'
const CHECK_INTERVAL_MS = 60 * 60 * 1000
const FOCUS_CHECK_MIN_GAP_MS = 15 * 60 * 1000
const FETCH_TIMEOUT_MS = 15_000
const MAX_ZIP_BYTES = 500 * 1024 * 1024
const SEMVER_RE = /^v?\d{1,4}\.\d{1,4}\.\d{1,4}$/

type Mode = 'electron' | 'selfpatch'

let win: BrowserWindow | null = null
let mode: Mode = 'selfpatch' // seguro por defecto hasta verificar la firma
let checking = false
let installing = false
let lastCheckAt = 0
// selfpatch: staging listo para instalar
let stagedVersion: string | null = null
let stagedAppPath: string | null = null
// electron mode
let electronDownloaded = false

function updatesDir(): string {
  const d = join(app.getPath('userData'), 'updates')
  mkdirSync(d, { recursive: true })
  return d
}

/** Re-apunta los eventos cuando la ventana se recrea (la app vive en el tray). */
export function setUpdaterWindow(window: BrowserWindow): void {
  win = window
  hookFocusCheck(window)
}

function send(e: UpdaterEvent): void {
  if (win && !win.isDestroyed()) win.webContents.send('updater:event', e)
}

/** Chequeo oportunista al enfocar la ventana (throttled) — así un release
 *  nuevo aparece en minutos, no “cuando toque el timer de la hora”. */
function hookFocusCheck(w: BrowserWindow): void {
  w.on('focus', () => {
    if (Date.now() - lastCheckAt < FOCUS_CHECK_MIN_GAP_MS) return
    void checkForUpdates()
  })
}

/**
 * macOS solo puede usar electron-updater con firma de identidad real.
 * `codesign -dv` reporta "adhoc" para builds sin certificado. Ante cualquier
 * duda → selfpatch (funciona igual; solo es nuestro instalador).
 */
function macSignatureOk(): Promise<boolean> {
  if (process.platform !== 'darwin') return Promise.resolve(true)
  return new Promise((resolve) => {
    execFile('codesign', ['-dv', app.getPath('exe')], { timeout: 5000 }, (err, _o, stderr) => {
      if (err) return resolve(false)
      resolve(!/flags=.*adhoc/i.test(String(stderr)))
    })
  })
}

function isNewer(a: string, b: string): boolean {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const x = pa[i] ?? 0
    const y = pb[i] ?? 0
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false
    if (x > y) return true
    if (x < y) return false
  }
  return false
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, { signal: ctrl.signal, redirect: 'follow' })
  } finally {
    clearTimeout(timer)
  }
}

// ── selfpatch: manifiesto ────────────────────────────────────────────────
interface Manifest {
  version: string
  zipName: string
  sha512: string // base64, como lo publica electron-builder
}

/** Parser mínimo del latest-mac.yml de electron-builder (sin deps YAML). */
function parseManifest(text: string): Manifest | null {
  const version = /^version:\s*(\S+)\s*$/m.exec(text)?.[1]
  if (!version || !SEMVER_RE.test(version)) return null

  const files: { url: string; sha512: string }[] = []
  const re = /-\s*url:\s*(\S+)[\r\n]+\s*sha512:\s*(\S+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) files.push({ url: m[1], sha512: m[2] })

  // arm64 usa el zip "-arm64-mac.zip"; intel el "-mac.zip" plano
  const want = process.arch === 'arm64'
    ? files.find((f) => f.url.endsWith('-arm64-mac.zip'))
    : files.find((f) => f.url.endsWith('-mac.zip') && !f.url.includes('arm64'))
  if (!want) return null
  // nombre de asset plano, sin rutas ni rarezas
  if (!/^[\w.-]+\.zip$/.test(want.url) || !/^[A-Za-z0-9+/=]{20,}$/.test(want.sha512)) return null
  return { version: version.replace(/^v/, ''), zipName: want.url, sha512: want.sha512 }
}

async function fetchManifest(): Promise<Manifest | null> {
  const res = await fetchWithTimeout(`https://github.com/${GITHUB_REPO}/releases/latest/download/latest-mac.yml`)
  if (!res.ok) return null
  return parseManifest(await res.text())
}

// ── selfpatch: descarga + verificación + staging ─────────────────────────
async function downloadAndStage(man: Manifest): Promise<void> {
  const dir = updatesDir()
  const zipPath = join(dir, man.zipName)
  const stageDir = join(dir, `stage-${man.version}`)

  // descarga en streaming con hash simultáneo y progreso
  const url = `https://github.com/${GITHUB_REPO}/releases/download/v${man.version}/${man.zipName}`
  const res = await fetchWithTimeout(url)
  if (!res.ok || !res.body) throw new Error(`descarga HTTP ${res.status}`)
  const total = Number(res.headers.get('content-length') ?? 0)
  if (total > MAX_ZIP_BYTES) throw new Error('asset demasiado grande')

  const hash = createHash('sha512')
  let received = 0
  let lastPct = -1
  const body = Readable.fromWeb(res.body as import('stream/web').ReadableStream)
  body.on('data', (chunk: Buffer) => {
    hash.update(chunk)
    received += chunk.length
    if (received > MAX_ZIP_BYTES) body.destroy(new Error('asset demasiado grande'))
    if (total > 0) {
      const pct = Math.round((received / total) * 100)
      if (pct !== lastPct) { lastPct = pct; send({ type: 'progress', percent: pct }) }
    }
  })
  await pipeline(body, createWriteStream(zipPath))

  if (hash.digest('base64') !== man.sha512) {
    rmSync(zipPath, { force: true })
    throw new Error('checksum SHA-512 no coincide')
  }

  // extraer con ditto (preserva symlinks/permisos del bundle)
  rmSync(stageDir, { recursive: true, force: true })
  await new Promise<void>((resolve, reject) => {
    execFile('/usr/bin/ditto', ['-x', '-k', zipPath, stageDir], { timeout: 120_000 }, (err) =>
      err ? reject(err) : resolve())
  })
  rmSync(zipPath, { force: true })

  const appPath = join(stageDir, 'GymBar.app')
  if (!existsSync(join(appPath, 'Contents', 'Info.plist'))) throw new Error('zip sin GymBar.app válido')

  stagedVersion = man.version
  stagedAppPath = appPath
  send({ type: 'downloaded', version: man.version })
}

async function selfpatchCheck(): Promise<void> {
  send({ type: 'checking' })
  const man = await fetchManifest()
  if (!man || !isNewer(man.version, app.getVersion())) { send({ type: 'none' }); return }
  if (stagedVersion === man.version && stagedAppPath && existsSync(stagedAppPath)) {
    send({ type: 'downloaded', version: man.version }) // ya está listo
    return
  }
  send({ type: 'available', version: man.version })
  await downloadAndStage(man)
}

/** Swap del bundle + relaunch. El proceso viejo sigue vivo por inode aunque
 *  su .app cambie de lugar; al relanzar, la ruta resuelve al binario nuevo. */
function selfpatchInstall(): void {
  if (!stagedVersion || !stagedAppPath || !existsSync(stagedAppPath)) {
    send({ type: 'error', message: 'No hay update descargado todavía' })
    return
  }
  // bundle actual: .../GymBar.app/Contents/MacOS/GymBar → subir 3 niveles
  const bundle = dirname(dirname(dirname(app.getPath('exe'))))
  if (!bundle.endsWith('.app')) {
    send({ type: 'error', message: 'La app no corre desde un bundle .app' })
    return
  }
  try {
    const graveyard = join(updatesDir(), `old-${Date.now()}.app`)
    renameSync(bundle, graveyard)      // mismo volumen → atómico
    try {
      renameSync(stagedAppPath, bundle)
    } catch (e) {
      renameSync(graveyard, bundle)    // rollback: dejar la app como estaba
      throw e
    }
    stagedVersion = null
    stagedAppPath = null
    app.relaunch()
    app.exit(0)
  } catch (e) {
    send({ type: 'error', message: `No se pudo instalar: ${e instanceof Error ? e.message : 'error'}` })
  }
}

/** Limpia bundles viejos y stages huérfanos de instalaciones pasadas. */
function cleanupUpdatesDir(): void {
  try {
    const dir = updatesDir()
    for (const f of readdirSync(dir)) {
      if (f.startsWith('old-') || f.startsWith('stage-') || f.endsWith('.zip')) {
        rmSync(join(dir, f), { recursive: true, force: true })
      }
    }
  } catch { /* limpieza nunca rompe el arranque */ }
}

// ── electron-updater (Windows / mac firmado) ─────────────────────────────
function wireElectronUpdater(): void {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowPrerelease = false
  autoUpdater.allowDowngrade = false

  autoUpdater.on('checking-for-update', () => send({ type: 'checking' }))
  autoUpdater.on('update-not-available', () => send({ type: 'none' }))
  autoUpdater.on('update-available', (info) => {
    if (SEMVER_RE.test(info.version)) send({ type: 'available', version: info.version })
  })
  autoUpdater.on('download-progress', (p) => send({ type: 'progress', percent: Math.round(p.percent) }))
  autoUpdater.on('update-downloaded', (info) => {
    if (!SEMVER_RE.test(info.version)) return
    electronDownloaded = true
    send({ type: 'downloaded', version: info.version })
  })
  autoUpdater.on('error', (e) => send({ type: 'error', message: e?.message ?? 'updater error' }))
}

// ── API ──────────────────────────────────────────────────────────────────
export function initUpdater(window: BrowserWindow): void {
  win = window
  hookFocusCheck(window)
  cleanupUpdatesDir()
  void (async () => {
    mode = (await macSignatureOk()) ? 'electron' : 'selfpatch'
    if (mode === 'electron') wireElectronUpdater()
    if (!isDev) {
      void checkForUpdates()
      setInterval(() => void checkForUpdates(), CHECK_INTERVAL_MS)
    }
  })()
}

export async function checkForUpdates(): Promise<void> {
  if (checking || installing || isDev) return
  checking = true
  lastCheckAt = Date.now()
  try {
    if (mode === 'selfpatch') await selfpatchCheck()
    else await autoUpdater.checkForUpdates()
  } catch (e) {
    send({ type: 'error', message: e instanceof Error ? e.message : 'update check falló' })
  } finally {
    checking = false
  }
}

export function installUpdate(): void {
  if (installing) return
  installing = true
  try {
    if (mode === 'selfpatch') {
      selfpatchInstall()
    } else if (electronDownloaded) {
      autoUpdater.quitAndInstall()
    } else {
      send({ type: 'error', message: 'No hay update descargado todavía' })
    }
  } finally {
    installing = false
  }
}
