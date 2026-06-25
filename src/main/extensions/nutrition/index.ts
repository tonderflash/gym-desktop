// Extensión Nutrición (proceso main) — registro local de comidas y macros.
// Persistencia 100% LOCAL en `userData/nutrition.json`; NO depende de ningún
// server externo (a diferencia de gymvision). Solo expone canales
// `ext:nutrition:*`. Para desactivar: BORRA esta carpeta y la gemela en
// `src/renderer/src/features/nutrition/` — el glob deja de encontrarla y no
// queda referencia. El JSON de datos queda huérfano (inofensivo).
import { app, ipcMain } from 'electron'
import { readFileSync, writeFileSync, renameSync, existsSync } from 'fs'
import { join } from 'path'

const STORE_VERSION = 1

type Unit = 'g' | 'u'
interface Food {
  id: string; name: string; group: string
  unit: Unit; per: number
  kcal: number; protein: number; carbs: number; fat: number
  gramsPerUnit?: number
}
interface MealItem { foodId: string; amount: number }
interface Meal { id: string; name: string; items: MealItem[] }
interface PlanDay { id: string; name: string; dow: number; focus: string; meals: Meal[]; foods?: Food[] }
interface ShoppingItem { item: string; qty: string }
interface Plan { days: PlanDay[]; shopping: ShoppingItem[] }
interface LogEntry { date: string; meals: Meal[]; note?: string; savedAt?: string; foods?: Food[] }
interface Store {
  version: number; seeded: boolean
  foods: Food[]; plan: Plan; logs: Record<string, LogEntry>
}

function mergeFoods(s: Store, foods?: Food[]): void {
  const incoming = Array.isArray(foods) ? foods : []
  for (const food of incoming) {
    if (!food?.id) continue
    const i = s.foods.findIndex((f) => f.id === food.id)
    if (i >= 0) s.foods[i] = food
    else s.foods.push(food)
  }
}

function file(): string {
  return join(app.getPath('userData'), 'nutrition.json')
}

function empty(): Store {
  return { version: STORE_VERSION, seeded: false, foods: [], plan: { days: [], shopping: [] }, logs: {} }
}

function read(): Store {
  try {
    if (!existsSync(file())) return empty()
    const raw = JSON.parse(readFileSync(file(), 'utf-8')) as Partial<Store>
    return { ...empty(), ...raw }
  } catch {
    // JSON ilegible → tratar como vacío, nunca crashear la app
    return empty()
  }
}

/** Write atómico (tmp + rename), igual que store.ts del core. */
function write(s: Store): Store {
  const tmp = file() + '.tmp'
  writeFileSync(tmp, JSON.stringify(s, null, 2), 'utf-8')
  renameSync(tmp, file())
  return s
}

export function register(): void {
  ipcMain.handle('ext:nutrition:get', () => ({ ok: true, data: read() }))

  // Sembrado idempotente: el contenido (foods + plan) lo provee el renderer
  // (seed.ts) — main es sólo almacenamiento. No re-siembra si ya hay plan.
  ipcMain.handle('ext:nutrition:seed', (_e, payload: { foods: Food[]; plan: Plan }) => {
    const s = read()
    if (s.seeded && s.plan.days.length) return { ok: true, data: s }
    s.foods = payload?.foods ?? []
    s.plan = payload?.plan ?? { days: [], shopping: [] }
    s.seeded = true
    return { ok: true, data: write(s) }
  })

  ipcMain.handle('ext:nutrition:savePlan', (_e, plan: Plan) => {
    const s = read()
    s.plan = plan ?? s.plan
    s.seeded = true
    return { ok: true, data: write(s) }
  })

  // Upsert de un día del plan (editar la dieta sin pisar el resto).
  ipcMain.handle('ext:nutrition:savePlanDay', (_e, payload: PlanDay & { foods?: Food[] }) => {
    const s = read()
    mergeFoods(s, payload?.foods)
    const { foods: _foods, ...day } = payload ?? {}
    if (!day?.id) return { ok: false, error: 'día inválido' }
    const i = s.plan.days.findIndex((d) => d.id === day.id)
    if (i >= 0) s.plan.days[i] = day
    else s.plan.days.push(day)
    return { ok: true, data: write(s) }
  })

  // Registro real de un día (lo que de verdad se comió).
  ipcMain.handle('ext:nutrition:logDay', (_e, entry: LogEntry) => {
    const s = read()
    if (!entry?.date) return { ok: false, error: 'sin fecha' }
    mergeFoods(s, entry.foods)
    s.logs[entry.date] = {
      date: entry.date,
      meals: entry.meals ?? [],
      note: entry.note ?? '',
      savedAt: new Date().toISOString(),
    }
    return { ok: true, data: write(s) }
  })

  ipcMain.handle('ext:nutrition:deleteLog', (_e, date: string) => {
    const s = read()
    if (date && s.logs[date]) delete s.logs[date]
    return { ok: true, data: write(s) }
  })
}
