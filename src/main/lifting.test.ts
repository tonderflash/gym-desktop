import { describe, it, expect, vi } from 'vitest'

// lifting → logic → settings → electron. Cortamos en settings: aplanar el
// cache y estimar e1RM son puros.
vi.mock('./settings', () => ({ loadSettings: () => ({ restDays: [6] }) }))

import { workingSets, e1rmLbs } from './lifting'
import type { HevyWorkout } from './store'

const workout = (exercises: HevyWorkout['exercises']): HevyWorkout =>
  ({ start_time: '2026-08-13T18:00:00+00:00', title: 'Test', exercises }) as HevyWorkout

describe('workingSets — qué cuenta como serie de trabajo', () => {
  // Hevy guarda el peso corporal como null. Exigir weight_kg > 0 borraba del
  // mapa muscular todas las dominadas, fondos, flexiones, remo invertido y el
  // core entero: el card mostraba 0 series de core con el Ab Wheel logueado.
  it('el trabajo con peso corporal cuenta aunque no traiga carga', () => {
    const sets = workingSets([workout([
      { title: 'Ab Wheel', sets: [{ type: 'normal', weight_kg: null, reps: 10, rpe: 8.5 }] },
      { title: 'Pull Up', sets: [{ type: 'normal', weight_kg: null, reps: 6, rpe: null }] },
    ])])
    expect(sets.map((s) => s.exercise)).toEqual(['Ab Wheel', 'Pull Up'])
    expect(sets[0].weightKg).toBe(0)
    expect(sets[0].reps).toBe(10)
  })

  it('el isométrico cuenta por tiempo, sin reps', () => {
    const sets = workingSets([workout([
      { title: 'Plank', sets: [{ type: 'normal', weight_kg: null, reps: null, duration_seconds: 46 }] },
    ])])
    expect(sets).toHaveLength(1)
    expect(sets[0].durationSec).toBe(46)
    expect(sets[0].reps).toBe(0)
  })

  it('un set sin esfuerzo alguno no cuenta', () => {
    const sets = workingSets([workout([
      { title: 'Fantasma', sets: [{ type: 'normal', weight_kg: null, reps: null, duration_seconds: null }] },
    ])])
    expect(sets).toEqual([])
  })

  it('el warmup sigue fuera', () => {
    const sets = workingSets([workout([
      { title: 'Bench Press (Barbell)', sets: [
        { type: 'warmup', weight_kg: 40, reps: 10 },
        { type: 'normal', weight_kg: 80, reps: 5 },
      ] },
    ])])
    expect(sets).toHaveLength(1)
    expect(sets[0].weightKg).toBe(80)
  })

  it('dejar entrar el peso corporal no contamina el e1RM', () => {
    // el mapa muscular los necesita; la fuerza no puede estimarse sin carga
    expect(e1rmLbs(0, 10, 8)).toBeNull()
    expect(e1rmLbs(0, 0, null)).toBeNull()
    expect(e1rmLbs(100, 3, 9)).toBeGreaterThan(0)
  })
})
