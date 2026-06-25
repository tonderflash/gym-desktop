// Dieta inicial de Israel como DATOS (no hardcodeada en la vista). Se siembra
// UNA vez en el store local; a partir de ahí es editable y el store manda.
// Macros por 100 g (unit 'g', per 100) salvo foods por unidad (unit 'u', per 1:
// huevo, banana, café). Valores de referencia tipo USDA, redondeados; cualquiera
// se puede ajustar editando el plan/registro.
import type { Food, Plan, PlanDay, Meal } from './api'

export const SEED_FOODS: Food[] = [
  // proteína
  { id: 'pollo', name: 'Pollo (pechuga)', group: 'protein', unit: 'g', per: 100, kcal: 165, protein: 31, carbs: 0, fat: 3.6 },
  { id: 'res_magra', name: 'Res magra', group: 'protein', unit: 'g', per: 100, kcal: 187, protein: 27, carbs: 0, fat: 8 },
  { id: 'carne_molida', name: 'Carne molida', group: 'protein', unit: 'g', per: 100, kcal: 215, protein: 26, carbs: 0, fat: 12 },
  { id: 'pescado', name: 'Pescado', group: 'protein', unit: 'g', per: 100, kcal: 140, protein: 20, carbs: 0, fat: 6 },
  { id: 'huevo', name: 'Huevo', group: 'protein', unit: 'u', per: 1, kcal: 72, protein: 6.3, carbs: 0.4, fat: 5, gramsPerUnit: 50 },
  // lácteo
  { id: 'yogurt_griego', name: 'Yogurt griego', group: 'dairy', unit: 'g', per: 100, kcal: 73, protein: 10, carbs: 4, fat: 2 },
  // carbos
  { id: 'arroz', name: 'Arroz cocido', group: 'carb', unit: 'g', per: 100, kcal: 130, protein: 2.7, carbs: 28, fat: 0.3 },
  { id: 'pasta', name: 'Pasta cocida', group: 'carb', unit: 'g', per: 100, kcal: 158, protein: 5.8, carbs: 31, fat: 0.9 },
  { id: 'avena_cocida', name: 'Avena cocida', group: 'carb', unit: 'g', per: 100, kcal: 71, protein: 2.5, carbs: 12, fat: 1.5 },
  { id: 'pan', name: 'Pan', group: 'carb', unit: 'g', per: 100, kcal: 265, protein: 9, carbs: 49, fat: 3.2 },
  { id: 'papa', name: 'Papa cocida', group: 'carb', unit: 'g', per: 100, kcal: 87, protein: 1.9, carbs: 20, fat: 0.1 },
  { id: 'habichuelas', name: 'Habichuelas cocidas', group: 'carb', unit: 'g', per: 100, kcal: 127, protein: 8.7, carbs: 22.8, fat: 0.5 },
  { id: 'miel', name: 'Miel', group: 'carb', unit: 'g', per: 100, kcal: 304, protein: 0.3, carbs: 82, fat: 0 },
  // fruta
  { id: 'banana', name: 'Banana', group: 'fruit', unit: 'u', per: 1, kcal: 105, protein: 1.3, carbs: 27, fat: 0.4, gramsPerUnit: 118 },
  // grasa
  { id: 'aceite_oliva', name: 'Aceite de oliva', group: 'fat', unit: 'g', per: 100, kcal: 884, protein: 0, carbs: 0, fat: 100 },
  { id: 'aguacate', name: 'Aguacate', group: 'fat', unit: 'g', per: 100, kcal: 160, protein: 2, carbs: 9, fat: 15 },
  { id: 'nueces', name: 'Nueces', group: 'fat', unit: 'g', per: 100, kcal: 654, protein: 15, carbs: 14, fat: 65 },
  // vegetales / otros (macros ~0, presentes por fidelidad del plan)
  { id: 'vegetales', name: 'Vegetales', group: 'veg', unit: 'g', per: 100, kcal: 35, protein: 2, carbs: 7, fat: 0.3 },
  { id: 'cafe', name: 'Café', group: 'other', unit: 'u', per: 1, kcal: 2, protein: 0, carbs: 0, fat: 0, gramsPerUnit: 240 },
  { id: 'sal', name: 'Sal', group: 'other', unit: 'g', per: 100, kcal: 0, protein: 0, carbs: 0, fat: 0 },
]

// helper para escribir meals compactos: [foodId, amount][]
function meal(id: string, name: string, items: [string, number][]): Meal {
  return { id, name, items: items.map(([foodId, amount]) => ({ foodId, amount })) }
}

const days: PlanDay[] = [
  {
    id: 'lunes', name: 'Lunes', dow: 1, focus: 'Lower Fuerza',
    meals: [
      meal('desayuno', 'Desayuno', [['avena_cocida', 210], ['yogurt_griego', 250], ['banana', 1], ['huevo', 2]]),
      meal('almuerzo', 'Almuerzo', [['arroz', 200], ['pollo', 180], ['habichuelas', 100], ['vegetales', 100], ['aceite_oliva', 10]]),
      meal('pre', 'Pre-entreno', [['pan', 80], ['miel', 20], ['cafe', 1]]),
      meal('cena', 'Cena', [['arroz', 150], ['res_magra', 170], ['vegetales', 100]]),
      meal('noche', 'Noche', [['yogurt_griego', 200]]),
    ],
  },
  {
    id: 'martes', name: 'Martes', dow: 2, focus: 'Upper Fuerza',
    meals: [
      meal('desayuno', 'Desayuno', [['avena_cocida', 210], ['yogurt_griego', 250], ['banana', 1], ['huevo', 2]]),
      meal('almuerzo', 'Almuerzo', [['arroz', 200], ['pollo', 180], ['habichuelas', 100], ['vegetales', 100]]),
      meal('pre', 'Pre-entreno', [['pan', 80], ['miel', 20], ['cafe', 1]]),
      meal('cena', 'Cena', [['pasta', 170], ['res_magra', 180], ['vegetales', 100], ['aceite_oliva', 10]]),
      meal('noche', 'Noche', [['yogurt_griego', 200]]),
    ],
  },
  {
    id: 'miercoles', name: 'Miércoles', dow: 3, focus: 'Descanso',
    meals: [
      meal('desayuno', 'Desayuno', [['avena_cocida', 150], ['yogurt_griego', 250], ['huevo', 2]]),
      meal('almuerzo', 'Almuerzo', [['arroz', 150], ['pollo', 180], ['vegetales', 100], ['aguacate', 50]]),
      meal('merienda', 'Merienda', [['yogurt_griego', 200], ['nueces', 15]]),
      meal('cena', 'Cena', [['pollo', 180], ['papa', 150], ['vegetales', 100]]),
    ],
  },
  {
    id: 'jueves', name: 'Jueves', dow: 4, focus: 'Deadlift',
    meals: [
      meal('desayuno', 'Desayuno', [['avena_cocida', 210], ['yogurt_griego', 250], ['banana', 1], ['huevo', 2]]),
      meal('almuerzo', 'Almuerzo', [['arroz', 200], ['pollo', 180], ['habichuelas', 100], ['sal', 2]]),
      meal('pre', 'Pre-entreno', [['banana', 1], ['pan', 70], ['cafe', 1], ['sal', 2]]),
      meal('cena', 'Cena', [['arroz', 170], ['res_magra', 180], ['vegetales', 100]]),
      meal('noche', 'Noche', [['yogurt_griego', 200]]),
    ],
  },
  {
    id: 'viernes', name: 'Viernes', dow: 5, focus: 'Upper Volumen + Z2',
    meals: [
      meal('desayuno', 'Desayuno', [['avena_cocida', 180], ['yogurt_griego', 250], ['banana', 1]]),
      meal('almuerzo', 'Almuerzo', [['arroz', 180], ['pollo', 180], ['habichuelas', 100]]),
      meal('pre', 'Pre-entreno', [['pan', 70], ['cafe', 1]]),
      meal('cena', 'Cena', [['arroz', 150], ['res_magra', 170], ['vegetales', 100], ['aguacate', 50]]),
      meal('noche', 'Noche', [['yogurt_griego', 200]]),
    ],
  },
  {
    id: 'sabado', name: 'Sábado', dow: 6, focus: 'GPP',
    meals: [
      meal('desayuno', 'Desayuno', [['avena_cocida', 180], ['yogurt_griego', 250], ['huevo', 2]]),
      meal('almuerzo', 'Almuerzo', [['arroz', 180], ['carne_molida', 170], ['vegetales', 100]]),
      meal('pre', 'Pre-entreno', [['banana', 1]]),
      meal('cena', 'Cena', [['arroz', 170], ['carne_molida', 170], ['vegetales', 100]]),
    ],
  },
  {
    id: 'domingo', name: 'Domingo', dow: 0, focus: 'Descanso',
    meals: [
      meal('desayuno', 'Desayuno', [['huevo', 3], ['avena_cocida', 150]]),
      meal('almuerzo', 'Almuerzo', [['arroz', 150], ['pollo', 180], ['vegetales', 100], ['aguacate', 50]]),
      meal('merienda', 'Merienda', [['yogurt_griego', 200], ['banana', 1]]),
      meal('cena', 'Cena', [['pescado', 180], ['arroz', 150], ['vegetales', 100]]),
    ],
  },
]

export const SEED_PLAN: Plan = {
  days,
  shopping: [
    { item: 'Arroz cocido', qty: '1.5–1.8 kg' },
    { item: 'Pollo cocido', qty: '1.2–1.4 kg' },
    { item: 'Res magra / molida / pescado', qty: '1.1–1.3 kg' },
    { item: 'Habichuelas cocidas', qty: '400–500 g' },
    { item: 'Papa / batata', qty: '800 g – 1 kg' },
    { item: 'Avena', qty: '400–450 g' },
    { item: 'Huevos', qty: '20–24' },
    { item: 'Yogurt griego', qty: '2.5–3 kg' },
    { item: 'Bananas', qty: '7–8' },
    { item: 'Aguacate, nueces, aceite oliva', qty: 'para grasas' },
  ],
}
