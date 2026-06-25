// Cliente tipado de la extensión Nutrición. Habla por el puente genérico
// `window.extensions` (canales ext:nutrition:*) → main → archivo JSON local.
// 100% local: no hay server que pueda estar "offline" (a diferencia de
// gymvision). Si el handler no existe (main desactualizado) → ok:false.

export interface ApiResult<T> { ok: boolean; data?: T; error?: string }

export type FoodGroup = 'protein' | 'carb' | 'fat' | 'veg' | 'fruit' | 'dairy' | 'other'

export interface Food {
  id: string
  name: string
  group: FoodGroup
  unit: 'g' | 'u'        // gramos, o unidades (huevo, banana, café)
  per: number            // base de las macros: 100 para 'g', 1 para 'u'
  kcal: number
  protein: number
  carbs: number
  fat: number
  gramsPerUnit?: number  // sólo display, para foods por unidad
}

export interface MealItem { foodId: string; amount: number }
export interface Meal { id: string; name: string; items: MealItem[] }
export interface PlanDay { id: string; name: string; dow: number; focus: string; meals: Meal[]; foods?: Food[] }
export interface ShoppingItem { item: string; qty: string }
export interface Plan { days: PlanDay[]; shopping: ShoppingItem[] }
export interface LogEntry { date: string; meals: Meal[]; note?: string; savedAt?: string; foods?: Food[] }

export interface NutritionStore {
  version: number
  seeded: boolean
  foods: Food[]
  plan: Plan
  logs: Record<string, LogEntry>
}

async function call<T>(channel: string, ...args: unknown[]): Promise<ApiResult<T>> {
  try {
    return await window.extensions.invoke<ApiResult<T>>(`nutrition:${channel}`, ...args)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error'
    return { ok: false, error: msg.includes('No handler registered') ? 'stale-main' : msg }
  }
}

export const nt = {
  get: () => call<NutritionStore>('get'),
  seed: (foods: Food[], plan: Plan) => call<NutritionStore>('seed', { foods, plan }),
  savePlan: (plan: Plan) => call<NutritionStore>('savePlan', plan),
  savePlanDay: (day: PlanDay) => call<NutritionStore>('savePlanDay', day),
  logDay: (entry: LogEntry) => call<NutritionStore>('logDay', entry),
  deleteLog: (date: string) => call<NutritionStore>('deleteLog', date),
}

export const GROUP_LABEL: Record<FoodGroup, string> = {
  protein: 'Proteína',
  carb: 'Carbohidrato',
  fat: 'Grasa',
  veg: 'Vegetal',
  fruit: 'Fruta',
  dairy: 'Lácteo',
  other: 'Otro',
}

// Orden de grupos en los selectores (proteína y carbos primero — lo más usado).
export const GROUP_ORDER: FoodGroup[] = ['protein', 'carb', 'dairy', 'fruit', 'veg', 'fat', 'other']
