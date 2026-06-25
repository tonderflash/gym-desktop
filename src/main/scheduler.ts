import { Notification, BrowserWindow } from 'electron'
import { refreshAll } from './pipeline'
import { checkinFeaturesFromRow, logicalToday } from './logic'
import { readLog } from './store'
import { loadSettings, patchSettings } from './settings'
import { broadcastState } from './ipc'

const FETCH_INTERVAL_MS = 30 * 60 * 1000

let win: BrowserWindow | null = null

async function cycle(): Promise<void> {
  await refreshAll()
  broadcastState() // notifica al renderer y repinta el tray (vía onBroadcast)
}

function reminderTick(): void {
  const s = loadSettings()
  const now = new Date()
  if (now.getHours() !== s.reminderHour || now.getMinutes() !== s.reminderMinute) return
  const today = logicalToday()
  if (s.lastReminderDate === today) return
  if (checkinFeaturesFromRow(readLog().get(today))) return

  patchSettings({ lastReminderDate: today })
  const n = new Notification({
    title: 'Check-in del día',
    body: 'Toma 15 segundos. Registra cómo estás antes de decidir si vas.',
  })
  n.on('click', () => {
    win?.show()
    win?.webContents.send('navigate', 'checkin')
  })
  n.show()
}

export function startScheduler(window: BrowserWindow): void {
  win = window
  void cycle()
  setInterval(() => void cycle(), FETCH_INTERVAL_MS)
  setInterval(reminderTick, 30 * 1000)
}
