import { describe, it, expect, vi } from 'vitest'

// muscles.ts → settings.ts → electron. Cortamos en settings: el catálogo, los
// umbrales y la recuperación son puros, solo las prioridades vienen de disco.
vi.mock('./settings', () => ({
  loadSettings: () => ({
    restDays: [6],
    musclePriorities: { hamstrings: 'aggressive', glutes: 'grow' },
  }),
}))

import {
  musclesFor, buildMuscles, buildReadiness, recoveryHoursFor, targetFor, MUSCLE_DEFS,
} from './muscles'
import { logicalToday, addDays } from './logic'
import type { DatedSet } from './lifting'

const def = (key: string) => MUSCLE_DEFS.find((d) => d.key === key)!
const HOUR = 3_600_000

function set(over: Partial<DatedSet> & { exercise: string }): DatedSet {
  return {
    date: logicalToday(),
    ts: Date.now(),
    weightKg: 60,
    reps: 10,
    rpe: null,
    type: 'normal',
    ...over,
  }
}

// ────────────────────────────── reglas ejercicio → músculo ──────────────────

describe('musclesFor — el orden de las reglas manda', () => {
  it('leg curl es isquio puro, no bíceps por "curl"', () => {
    expect(musclesFor('Seated Leg Curl').map(([k]) => k)).toEqual(['hamstrings'])
  })

  it('romanian deadlift no cae en la regla genérica de deadlift', () => {
    const keys = musclesFor('Romanian Deadlift (Barbell)').map(([k]) => k)
    expect(keys).toEqual(['hamstrings', 'glutes', 'erectors'])
  })

  it('deadlift reparte a cadena posterior, espalda alta y agarre', () => {
    const keys = musclesFor('Deadlift (Barbell)').map(([k]) => k)
    expect(keys).toContain('glutes')
    expect(keys).toContain('erectors')
    expect(keys).toContain('upper_back')
  })

  it('upright row cuenta como hombro, no como espalda', () => {
    expect(musclesFor('Upright Row (Barbell)')[0][0]).toBe('shoulders')
  })

  it('glute kickback va a glúteo y triceps kickback a tríceps', () => {
    expect(musclesFor('Glute Kickback (Machine)')[0][0]).toBe('glutes')
    expect(musclesFor('Triceps Kickback')[0][0]).toBe('triceps')
  })

  it('un ejercicio desconocido no inventa músculos', () => {
    expect(musclesFor('Sauna')).toEqual([])
  })
})

// ────────────────────────────── umbrales y prioridad ────────────────────────

describe('targetFor — apuntar siempre a un landmark, nunca a un número derivado', () => {
  it('mantener apunta al MEV; crecer y agresivo al MAV', () => {
    const d = def('hamstrings')
    expect(targetFor(d, 'maintain')).toBe(d.mev)
    expect(targetFor(d, 'grow')).toBe(d.mav)
    expect(targetFor(d, 'aggressive')).toBe(d.mav)
  })

  it('ningún objetivo cae entre landmarks (eso sería precisión inventada)', () => {
    for (const d of MUSCLE_DEFS) {
      for (const p of ['maintain', 'grow', 'aggressive'] as const) {
        expect([d.mev, d.mav]).toContain(targetFor(d, p))
      }
    }
  })
})

describe('buildMuscles — zonas', () => {
  const many = (exercise: string, n: number, over: Partial<DatedSet> = {}): DatedSet[] =>
    Array.from({ length: n }, () => set({ exercise, ...over }))

  it('sin trabajo la zona es none y el readiness queda en 1', () => {
    const m = buildMuscles([]).find((x) => x.key === 'hamstrings')!
    expect(m.zone).toBe('none')
    expect(m.readiness).toBe(1)
    expect(m.lastDaysAgo).toBeNull()
  })

  it('debajo del MEV la zona es below — mantiene, no crece', () => {
    const m = buildMuscles(many('Seated Leg Curl', 3)).find((x) => x.key === 'hamstrings')!
    expect(m.sets7d).toBe(3)
    expect(m.sets7d).toBeLessThan(m.mev)
    expect(m.zone).toBe('below')
  })

  it('entre MEV y MAV la zona es growth', () => {
    const m = buildMuscles(many('Seated Leg Curl', 8)).find((x) => x.key === 'hamstrings')!
    expect(m.zone).toBe('growth')
  })

  it('pasando el MRV la zona es over', () => {
    const m = buildMuscles(many('Seated Leg Curl', 25)).find((x) => x.key === 'hamstrings')!
    expect(m.zone).toBe('over')
  })

  it('solo cuenta la ventana de 7 días', () => {
    const old = many('Seated Leg Curl', 6, { date: addDays(logicalToday(), -20) })
    const m = buildMuscles(old).find((x) => x.key === 'hamstrings')!
    expect(m.sets7d).toBe(0)
    expect(m.lastDaysAgo).toBe(20) // pero sí recuerda cuándo fue la última vez
  })

  it('lee la prioridad guardada y ajusta el objetivo', () => {
    const ms = buildMuscles([])
    const ham = ms.find((x) => x.key === 'hamstrings')!
    const chest = ms.find((x) => x.key === 'chest')!
    expect(ham.priority).toBe('aggressive')
    expect(ham.targetSets).toBe(ham.mav)
    expect(chest.priority).toBe('maintain') // no está en el mapa → default
    expect(chest.targetSets).toBe(chest.mev)
  })
})

// ────────────────────────────── recuperación ────────────────────────────────

describe('recoveryHoursFor — el descanso escala con dosis e intensidad', () => {
  const d = def('hamstrings')

  it('más series piden más horas, pero no proporcionalmente', () => {
    const one = recoveryHoursFor(d, 3, false)
    const double = recoveryHoursFor(d, 6, false)
    expect(double).toBeGreaterThan(one)
    expect(double).toBeLessThan(one * 2)
  })

  it('una sesión pesada o al fallo suma descanso', () => {
    expect(recoveryHoursFor(d, 4, true)).toBeGreaterThan(recoveryHoursFor(d, 4, false))
  })

  it('un músculo chico se recupera antes que uno grande con la misma dosis', () => {
    expect(recoveryHoursFor(def('calves'), 4, false))
      .toBeLessThan(recoveryHoursFor(def('quads'), 4, false))
  })
})

describe('buildMuscles — readiness', () => {
  it('recién entrenado está fatigado; pasado el tiempo de recuperación, listo', () => {
    const now = Date.now()
    const sets = Array.from({ length: 4 }, () => set({ exercise: 'Seated Leg Curl', ts: now - 2 * HOUR }))
    const fresh = buildMuscles(sets, now).find((m) => m.key === 'hamstrings')!
    expect(fresh.readiness).toBeLessThan(0.2)
    expect(fresh.lastSessionSets).toBe(4)

    const later = buildMuscles(sets, now + 200 * HOUR).find((m) => m.key === 'hamstrings')!
    expect(later.readiness).toBe(1)
  })

  it('la readiness nunca pasa de 1 aunque hayan pasado meses', () => {
    const now = Date.now()
    const sets = [set({ exercise: 'Seated Leg Curl', ts: now - 5000 * HOUR })]
    expect(buildMuscles(sets, now).find((m) => m.key === 'hamstrings')!.readiness).toBe(1)
  })
})

describe('buildReadiness — score y sugerencia', () => {
  it('sin data todo está listo y el score es 100', () => {
    const r = buildReadiness(buildMuscles([]))
    expect(r.score).toBe(100)
    expect(r.recovering).toEqual([])
  })

  it('sugiere primero lo prioritario que está fresco y con déficit', () => {
    const r = buildReadiness(buildMuscles([]))
    expect(r.suggestion).toContain('Isquios') // aggressive → pesa más que el resto
  })

  it('lo que se está recuperando sale ordenado por horas restantes', () => {
    const now = Date.now()
    const sets = [
      ...Array.from({ length: 5 }, () => set({ exercise: 'Seated Leg Curl', ts: now - 2 * HOUR })),
      ...Array.from({ length: 3 }, () => set({ exercise: 'Standing Calf Raise', ts: now - 2 * HOUR })),
    ]
    const r = buildReadiness(buildMuscles(sets, now))
    const keys = r.recovering.map((x) => x.key)
    expect(keys).toContain('hamstrings')
    expect(keys).toContain('calves')
    // el gemelo se recupera antes que el isquio → sale primero
    expect(keys.indexOf('calves')).toBeLessThan(keys.indexOf('hamstrings'))
    expect(r.score).toBeLessThan(100)
  })
})
