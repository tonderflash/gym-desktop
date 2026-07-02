// Auto-update tipo Claude Desktop: electron-updater + GitHub Releases.
//
// Máquina de estados honesta: en macOS Squirrel exige firma válida para
// instalar — sin ella electron-updater DESCARGA el update pero quitAndInstall()
// falla en silencio (síntoma real: toast "lista para instalar" + botón muerto).
// Por eso detectamos la firma al arrancar y elegimos UN modo:
//   auto   → flujo completo electron-updater (Windows, o mac firmado)
//   manual → solo avisar vía GitHub API y abrir la página del release
// Nunca se mezclan: en manual jamás se ofrece "Reiniciar y actualizar".
import { app, shell, BrowserWindow } from 'electron'
import { execFile } from 'child_process'
import electronUpdater from 'electron-updater'
import { isDev } from './env'
import type { UpdaterEvent } from '@shared/types'

const { autoUpdater } = electronUpdater

// Cambiar junto con electron-builder.yml → publish
export const GITHUB_REPO = 'tonderflash/gym-desktop'
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000
const FETCH_TIMEOUT_MS = 10_000
// Releases usan semver estricto; cualquier otra cosa del API se descarta.
const SEMVER_RE = /^v?\d{1,4}\.\d{1,4}\.\d{1,4}$/

type Mode = 'auto' | 'manual'

let win: BrowserWindow | null = null
let mode: Mode = 'manual' // seguro por defecto hasta verificar la firma
let checking = false
let downloadedVersion: string | null = null
let lastNotifiedVersion: string | null = null
let manualUrl: string | null = null

/** Re-apunta los eventos cuando la ventana se recrea (la app vive en el tray). */
export function setUpdaterWindow(window: BrowserWindow): void {
  win = window
}

function send(e: UpdaterEvent): void {
  if (win && !win.isDestroyed()) win.webContents.send('updater:event', e)
}

/**
 * macOS solo puede auto-instalar con firma de identidad real. `codesign -dv`
 * reporta "adhoc" para builds sin certificado (lo que produce electron-builder
 * sin CSC_LINK). Ante cualquier duda devolvemos false → modo manual (el modo
 * seguro: avisa pero no promete instalar).
 */
function macSignatureOk(): Promise<boolean> {
  if (process.platform !== 'darwin') return Promise.resolve(true)
  return new Promise((resolve) => {
    execFile('codesign', ['-dv', app.getPath('exe')], { timeout: 5000 }, (err, _out, stderr) => {
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

/** Chequeo vía GitHub API. `force` re-notifica aunque la versión ya se avisó. */
async function manualCheck(force = false): Promise<void> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: { accept: 'application/vnd.github+json' },
      signal: ctrl.signal,
    })
    if (!res.ok) { send({ type: 'none' }); return }
    const rel = (await res.json()) as { tag_name?: string; html_url?: string }

    const tag = String(rel.tag_name ?? '').trim()
    if (!SEMVER_RE.test(tag)) { send({ type: 'none' }); return }
    const latest = tag.replace(/^v/, '')
    if (!isNewer(latest, app.getVersion())) { send({ type: 'none' }); return }

    // validar la URL al recibirla, no solo al abrirla
    const fallback = `https://github.com/${GITHUB_REPO}/releases/latest`
    manualUrl = fallback
    try {
      const u = new URL(String(rel.html_url ?? ''))
      if (u.protocol === 'https:' && u.hostname === 'github.com') manualUrl = u.toString()
    } catch { /* malformada → fallback */ }

    // los toasts manual son sticky: no re-avisar la misma versión cada 4h
    if (!force && lastNotifiedVersion === latest) return
    lastNotifiedVersion = latest
    send({ type: 'manual', version: latest, url: manualUrl })
  } catch {
    send({ type: 'none' })
  } finally {
    clearTimeout(timer)
  }
}

/** Cae a modo manual definitivo (para esta sesión) y avisa si hay update. */
function degradeToManual(force = false): void {
  mode = 'manual'
  downloadedVersion = null
  void manualCheck(force)
}

function wireAutoUpdater(): void {
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
    downloadedVersion = info.version
    send({ type: 'downloaded', version: info.version })
  })
  // cualquier error del flujo auto (red, firma, yml roto) → modo manual
  autoUpdater.on('error', () => degradeToManual())
}

export function initUpdater(window: BrowserWindow): void {
  win = window
  void (async () => {
    mode = (await macSignatureOk()) ? 'auto' : 'manual'
    if (mode === 'auto') wireAutoUpdater()
    if (!isDev) {
      void checkForUpdates()
      setInterval(() => void checkForUpdates(), CHECK_INTERVAL_MS)
    }
  })()
}

export async function checkForUpdates(): Promise<void> {
  if (checking) return
  checking = true
  try {
    if (isDev || mode === 'manual') {
      await manualCheck()
    } else {
      await autoUpdater.checkForUpdates()
    }
  } catch {
    degradeToManual()
  } finally {
    checking = false
  }
}

export function installUpdate(): void {
  // poka-yoke: instalar solo si este build puede hacerlo Y ya descargó algo.
  // Si no, degradar con force=true para que el usuario reciba el aviso manual
  // en el acto (respuesta visible al click, nunca un botón muerto).
  if (mode !== 'auto' || !downloadedVersion) {
    degradeToManual(true)
    return
  }
  try {
    autoUpdater.quitAndInstall()
  } catch {
    degradeToManual(true)
  }
}

export function openLatestRelease(): void {
  // manualUrl ya se validó (https + github.com) al parsear la respuesta del API
  void shell.openExternal(manualUrl ?? `https://github.com/${GITHUB_REPO}/releases/latest`)
}
