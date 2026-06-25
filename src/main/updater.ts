// Auto-update tipo Claude Desktop: electron-updater + GitHub Releases.
// En macOS SIN firma, electron-updater no puede aplicar el update → fallback
// "manual": detecta la versión nueva vía GitHub API y abre la página de release.
import { app, shell, BrowserWindow } from 'electron'
import electronUpdater from 'electron-updater'
import { isDev } from './env'
import type { UpdaterEvent } from '@shared/types'

const { autoUpdater } = electronUpdater

// Cambiar junto con electron-builder.yml → publish
export const GITHUB_REPO = 'tonderflash/gym-desktop'

let win: BrowserWindow | null = null
let manualUrl: string | null = null

function send(e: UpdaterEvent): void {
  win?.webContents.send('updater:event', e)
}

async function manualCheck(): Promise<void> {
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: { accept: 'application/vnd.github+json' },
    })
    if (!res.ok) { send({ type: 'none' }); return }
    const rel = (await res.json()) as { tag_name?: string; html_url?: string }
    const latest = (rel.tag_name ?? '').replace(/^v/, '')
    if (latest && latest !== app.getVersion() && isNewer(latest, app.getVersion())) {
      manualUrl = rel.html_url ?? `https://github.com/${GITHUB_REPO}/releases/latest`
      send({ type: 'manual', version: latest, url: manualUrl })
    } else {
      send({ type: 'none' })
    }
  } catch {
    send({ type: 'none' })
  }
}

function isNewer(a: string, b: string): boolean {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return true
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return false
  }
  return false
}

export function initUpdater(window: BrowserWindow): void {
  win = window
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => send({ type: 'checking' }))
  autoUpdater.on('update-not-available', () => send({ type: 'none' }))
  autoUpdater.on('update-available', (info) => send({ type: 'available', version: info.version }))
  autoUpdater.on('download-progress', (p) => send({ type: 'progress', percent: Math.round(p.percent) }))
  autoUpdater.on('update-downloaded', (info) => send({ type: 'downloaded', version: info.version }))
  autoUpdater.on('error', () => {
    // típico: build mac sin firmar → degradar a chequeo manual
    void manualCheck()
  })

  if (!isDev) {
    void checkForUpdates()
    setInterval(() => void checkForUpdates(), 4 * 60 * 60 * 1000)
  }
}

export async function checkForUpdates(): Promise<void> {
  if (isDev) { await manualCheck(); return }
  try {
    await autoUpdater.checkForUpdates()
  } catch {
    await manualCheck()
  }
}

export function installUpdate(): void {
  autoUpdater.quitAndInstall()
}

export function openLatestRelease(): void {
  const fallback = `https://github.com/${GITHUB_REPO}/releases/latest`
  let url = fallback
  // la URL viene de la respuesta del API — verificar que apunte a github.com
  if (manualUrl) {
    try {
      const u = new URL(manualUrl)
      if (u.protocol === 'https:' && u.hostname === 'github.com') url = manualUrl
    } catch { /* malformada → fallback */ }
  }
  void shell.openExternal(url)
}
