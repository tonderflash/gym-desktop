// Cálculo de macros y utilidades de fecha. Funciones puras (testeables, sin
// estado) — el componente sólo orquesta.
import type { Food, Meal, MealItem } from './api'

export interface Macro { kcal: number; protein: number; carbs: number; fat: number }
export const ZERO: Macro = { kcal: 0, protein: 0, carbs: 0, fat: 0 }

export function foodMap(foods: Food[]): Map<string, Food> {
  return new Map(foods.map((f) => [f.id, f]))
}

export function add(a: Macro, b: Macro): Macro {
  return {
    kcal: a.kcal + b.kcal,
    protein: a.protein + b.protein,
    carbs: a.carbs + b.carbs,
    fat: a.fat + b.fat,
  }
}

/** Macros de un item = (cantidad / base) × macros del food. */
export function itemMacro(it: MealItem, fm: Map<string, Food>): Macro {
  const f = fm.get(it.foodId)
  if (!f) return { ...ZERO }
  const k = it.amount / (f.per || 1)
  return { kcal: f.kcal * k, protein: f.protein * k, carbs: f.carbs * k, fat: f.fat * k }
}

export function mealMacro(m: Meal, fm: Map<string, Food>): Macro {
  return m.items.reduce((acc, it) => add(acc, itemMacro(it, fm)), { ...ZERO })
}

export function totalMacro(meals: Meal[], fm: Map<string, Food>): Macro {
  return meals.reduce((acc, m) => add(acc, mealMacro(m, fm)), { ...ZERO })
}

export function roundMacro(m: Macro): Macro {
  return {
    kcal: Math.round(m.kcal),
    protein: Math.round(m.protein),
    carbs: Math.round(m.carbs),
    fat: Math.round(m.fat),
  }
}

/** "210 g Avena cocida" / "2× Huevo" para mostrar un item. */
export function itemLabel(it: MealItem, fm: Map<string, Food>): string {
  const f = fm.get(it.foodId)
  if (!f) return '—'
  return f.unit === 'u' ? `${cleanNum(it.amount)}× ${f.name}` : `${cleanNum(it.amount)} g · ${f.name}`
}

/** Cantidad sin decimales innecesarios (2, no 2.0). */
export function cleanNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

// ── fechas locales (sin UTC shift) ─────────────────────────────────────────
function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function isoOf(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function todayIso(): string {
  return isoOf(new Date())
}

/** Parsea "YYYY-MM-DD" como fecha LOCAL (no UTC), evitando el corrimiento de día. */
export function parseIso(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

/** Día de la semana JS: 0=Dom … 6=Sáb. */
export function dowOf(s: string): number {
  return parseIso(s).getDay()
}

const DOW_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const DOW_LONG = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

export function dowShort(s: string): string {
  return DOW_SHORT[dowOf(s)] ?? ''
}
export function dowLong(s: string): string {
  return DOW_LONG[dowOf(s)] ?? ''
}

/** "2026-06-25" → "25 jun". */
export function ddmon(s: string): string {
  const mon = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  const d = parseIso(s)
  return `${d.getDate()} ${mon[d.getMonth()]}`
}

/** Lista de N fechas ISO hacia atrás desde hoy (incluye hoy), de vieja a nueva. */
export function lastNDays(n: number): string[] {
  const out: string[] = []
  const base = new Date()
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base)
    d.setDate(base.getDate() - i)
    out.push(isoOf(d))
  }
  return out
}

/** % de cumplimiento de un valor vs objetivo, clamp 0..150 para barras. */
export function pct(value: number, target: number): number {
  if (target <= 0) return value > 0 ? 100 : 0
  return Math.max(0, Math.min(150, Math.round((value / target) * 100)))
}
