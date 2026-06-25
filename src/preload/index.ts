import { contextBridge, ipcRenderer } from 'electron'
import type {
  ApiSurface, AppState, CheckinPayload, SettingsPatch, UpdaterEvent,
} from '@shared/types'

const api: ApiSurface = {
  getState: () => ipcRenderer.invoke('state:get'),
  refresh: () => ipcRenderer.invoke('state:refresh'),
  saveCheckin: (p: CheckinPayload) => ipcRenderer.invoke('checkin:save', p),
  getEligibleSkipDays: () => ipcRenderer.invoke('skip:eligible'),
  saveSkipReason: (date: string, reason: string) => ipcRenderer.invoke('skip:save', date, reason),
  resolveWent: (date: string) => ipcRenderer.invoke('outcome:markWent', date),
  getHistory: () => ipcRenderer.invoke('history:get'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (patch: SettingsPatch) => ipcRenderer.invoke('settings:save', patch),
  testHevyKey: (key: string) => ipcRenderer.invoke('hevy:testKey', key),
  exportSkill: () => ipcRenderer.invoke('skill:export'),
  openDataFolder: () => ipcRenderer.invoke('data:openFolder'),
  importLegacy: () => ipcRenderer.invoke('legacy:import'),
  updaterAction: (action) => ipcRenderer.invoke('app:updater', action),
  onStateUpdate: (cb: (s: AppState) => void) => {
    const fn = (_e: unknown, s: AppState) => cb(s)
    ipcRenderer.on('state:update', fn)
    return () => ipcRenderer.removeListener('state:update', fn)
  },
  onUpdaterEvent: (cb: (e: UpdaterEvent) => void) => {
    const fn = (_e: unknown, ev: UpdaterEvent) => cb(ev)
    ipcRenderer.on('updater:event', fn)
    return () => ipcRenderer.removeListener('updater:event', fn)
  },
  onNavigate: (cb: (page: string) => void) => {
    const fn = (_e: unknown, page: string) => cb(page)
    ipcRenderer.on('navigate', fn)
    return () => ipcRenderer.removeListener('navigate', fn)
  },
}

contextBridge.exposeInMainWorld('api', api)

// ── Puente genérico para extensiones desacopladas ────────────────────────────
// Infra permanente: cualquier extensión (dir en src/main/extensions/* y
// src/renderer/src/features/*) habla por aquí sin tocar el ApiSurface tipado.
// Solo alcanza canales con prefijo `ext:`; el main solo registra los suyos.
const extensions = {
  invoke: (channel: string, ...args: unknown[]) =>
    ipcRenderer.invoke(`ext:${channel}`, ...args),
  on: (channel: string, cb: (payload: unknown) => void) => {
    const fn = (_e: unknown, payload: unknown) => cb(payload)
    ipcRenderer.on(`ext:${channel}`, fn)
    return () => ipcRenderer.removeListener(`ext:${channel}`, fn)
  },
}
contextBridge.exposeInMainWorld('extensions', extensions)
