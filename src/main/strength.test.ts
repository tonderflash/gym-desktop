import { describe, it, expect, vi } from 'vitest'

vi.mock('./settings', () => ({ loadSettings: () => ({ restDays: [6] }) }))

import { buildStrength } from './strength'
import { e1rmLbs } from './lifting'
import { logicalToday, addDays } from './logic'
import type { DatedSet } from './lifting'

function set(over: Partial<DatedSet> & { exercise: string }): DatedSet {
  return {
    date: logicalToday(),
    ts: Date.now(),
    weightKg: 100,
    reps: 3,
    rpe: 9,
    type: 'normal',
    ...over,
  }
}

describe('e1rmLbs — reps efectivas, no Epley inflado', () => {
  it('un set a RPE 10 vale más que el mismo peso y reps a RPE 7', () => {
    expect(e1rmLbs(100, 3, 10)!).toBeLessThan(e1rmLbs(100, 3, 7)!)
  })

  it('sets de más de 8 reps no estiman fuerza', () => {
    expect(e1rmLbs(60, 12, 8)).toBeNull()
  })

  it('un single es su propio peso', () => {
    expect(e1rmLbs(100, 1, 10)).toBeCloseTo(220.46, 1)
  })
})

describe('buildStrength', () => {
  it('un triple pesado y reciente da confianza alta', () => {
    const l = buildStrength([set({ exercise: 'Deadlift (Barbell)' })]).lifts[0]
    expect(l.confidence).toBe('high')
    expect(l.isBig3).toBe(true)
  })

  it('un set viejo baja la confianza aunque sea pesado', () => {
    const old = set({ exercise: 'Deadlift (Barbell)', date: addDays(logicalToday(), -60) })
    expect(buildStrength([old]).lifts[0].confidence).toBe('low')
  })

  it('las cargas de trabajo salen del e1RM y van redondeadas a 5 lbs', () => {
    const l = buildStrength([set({ exercise: 'Deadlift (Barbell)' })]).lifts[0]
    expect(l.work.map((w) => w.pct)).toEqual([90, 80, 70])
    for (const w of l.work) {
      expect(w.lbs % 5).toBe(0)
      expect(w.lbs).toBeLessThan(l.e1rmLbs)
    }
  })

  it('los básicos van primero aunque otro ejercicio pese más', () => {
    const lifts = buildStrength([
      set({ exercise: 'Leg Press (Machine)', weightKg: 300 }),
      set({ exercise: 'Bench Press (Barbell)', weightKg: 80 }),
    ]).lifts
    expect(lifts[0].exercise).toBe('Bench Press (Barbell)')
  })

  it('el total de básicos solo existe con los tres', () => {
    const two = buildStrength([
      set({ exercise: 'Bench Press (Barbell)' }),
      set({ exercise: 'Squat (Barbell)' }),
    ])
    expect(two.totalBig3Lbs).toBeNull()

    const three = buildStrength([
      set({ exercise: 'Bench Press (Barbell)' }),
      set({ exercise: 'Squat (Barbell)' }),
      set({ exercise: 'Deadlift (Barbell)' }),
    ])
    expect(three.totalBig3Lbs).toBe(three.lifts.reduce((a, l) => a + l.e1rmLbs, 0))
  })

  it('guarda la mejor marca histórica aunque la reciente sea menor', () => {
    const l = buildStrength([
      set({ exercise: 'Squat (Barbell)', weightKg: 120, date: addDays(logicalToday(), -80) }),
      set({ exercise: 'Squat (Barbell)', weightKg: 90 }),
    ]).lifts[0]
    expect(l.bestLbs).toBeGreaterThan(l.e1rmLbs)
  })

  it('sin tendencia suficiente no proyecta techo', () => {
    const l = buildStrength([set({ exercise: 'Squat (Barbell)' })]).lifts[0]
    expect(l.trendPerWeek).toBeNull()
    expect(l.potentialLbs).toBeNull()
  })
})
