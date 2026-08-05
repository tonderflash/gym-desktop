import { describe, it, expect, vi } from 'vitest'

// logic.ts → settings.ts → electron. El scorer es puro, así que cortamos la
// cadena en settings y evitamos arrastrar electron al runner de node.
vi.mock('./settings', () => ({
  loadSettings: () => ({ restDays: [6] }),
}))

import { scoreRisk, addDays, daysBetween, weekdayOf, type RiskInputs } from './logic'
import { RISK_CLAMP, TRAINING_ROTATION } from '@shared/schema'
import { ATTENDANCE_FIXTURE, FIXTURE_REST_DAYS } from './risk.fixture'

const ROTATION = TRAINING_ROTATION.length

function score(today: string, history: string[], over: Partial<RiskInputs> = {}) {
  return scoreRisk({
    today,
    history: [...history].sort().reverse().filter((d) => d < today),
    restDay: FIXTURE_REST_DAYS.includes(weekdayOf(today)),
    rotationLength: ROTATION,
    checkin: null,
    ...over,
  })
}

// ─────────────────────────── comportamiento base ───────────────────────────

describe('scoreRisk — contrato', () => {
  it('sin historial devuelve 0.5 y lo declara', () => {
    const { risk, factors } = score('2026-06-10', [])
    expect(risk).toBe(0.5)
    expect(factors).toHaveLength(1)
    expect(factors[0].name).toBe('sin datos')
  })

  it('nunca sale del rango clamp, ni en el peor ni en el mejor caso', () => {
    const worst = score('2026-06-14', ['2026-01-01'], {
      checkin: {
        intention: 'no', energy: 1, sleep_hours: 3,
        factor_sick: true, factor_injury: true,
        factor_alcohol: true, factor_late_night: true,
      },
    })
    const best = score('2026-06-10', ['2026-06-09'], {
      restDay: false,
      checkin: {
        intention: 'yes_now', energy: 5, sleep_hours: 9,
        factor_sick: false, factor_injury: false,
        factor_alcohol: false, factor_late_night: false,
      },
    })
    expect(worst.risk).toBeLessThanOrEqual(RISK_CLAMP.MAX)
    expect(best.risk).toBeGreaterThanOrEqual(RISK_CLAMP.MIN)
    expect(worst.risk).toBeGreaterThan(best.risk)
  })

  it('los contrib del desglose suman el logit que produce el riesgo', () => {
    const { risk, factors } = score('2026-06-16', [...ATTENDANCE_FIXTURE])
    const z = factors.reduce((a, f) => a + f.contrib, 0)
    expect(1 / (1 + Math.exp(-z))).toBeCloseTo(risk, 3)
  })
})

// ─────────── la regresión concreta: v2 estaba invertido en gap corto ───────────

describe('scoreRisk — el gap corto ya no se confunde con abandono', () => {
  // v2: día después de entrenar → 0.13, cuando la tasa real de no-ir era 0.60.
  it('un gap de 1 día no se lee como bajo riesgo', () => {
    const r = score('2026-06-19', ['2026-06-18', '2026-06-17', '2026-06-15'])
    expect(r.risk).toBeGreaterThan(0.4)
  })

  it('dentro de la ventana de recuperación el gap no aporta nada', () => {
    const lapseOf = (today: string) =>
      score(today, ['2026-06-14']).factors.find((f) => f.name === 'abandono')!.contrib
    expect(lapseOf('2026-06-15')).toBe(0) // 1d
    expect(lapseOf('2026-06-18')).toBe(0) // 4d
    expect(lapseOf('2026-06-19')).toBeGreaterThan(0) // 5d → ya es abandono
  })

  it('el riesgo crece de forma monótona una vez pasada la recuperación', () => {
    const risks = ['2026-06-19', '2026-06-22', '2026-06-25', '2026-06-28']
      .map((d) => score(d, ['2026-06-14']).risk)
    for (let i = 1; i < risks.length; i++) {
      expect(risks[i]).toBeGreaterThan(risks[i - 1])
    }
  })

  it('el día de descanso pesa, y v2 lo ignoraba', () => {
    const hist = ['2026-06-17', '2026-06-15', '2026-06-13']
    const rest = score('2026-06-21', hist, { restDay: true })   // domingo
    const work = score('2026-06-21', hist, { restDay: false })
    expect(rest.risk).toBeGreaterThan(work.risk)
  })

  it('más carga semanal cumplida ⇒ más riesgo de parar', () => {
    // misma fecha y mismo gap; cambia solo cuántas sesiones lleva la semana.
    const light = score('2026-06-19', ['2026-06-18'])
    const heavy = score('2026-06-19', ['2026-06-18', '2026-06-17', '2026-06-16', '2026-06-15'])
    expect(heavy.risk).toBeGreaterThan(light.risk)
  })
})

describe('scoreRisk — check-in', () => {
  const base = { energy: null, sleep_hours: null, factor_sick: false, factor_injury: false, factor_alcohol: false, factor_late_night: false }
  const hist = ['2026-06-17', '2026-06-15']

  it('la intención ordena el riesgo de yes_now a no', () => {
    const r = (intention: string) =>
      score('2026-06-19', hist, { checkin: { ...base, intention } }).risk
    expect(r('yes_now')).toBeLessThan(r('probably'))
    expect(r('probably')).toBeLessThan(r('unsure'))
    expect(r('unsure')).toBeLessThan(r('no'))
  })

  it('enfermo/lesión y poco sueño suben el riesgo', () => {
    const plain = score('2026-06-19', hist, { checkin: { ...base, intention: 'probably' } }).risk
    const sick = score('2026-06-19', hist, {
      checkin: { ...base, intention: 'probably', factor_sick: true, sleep_hours: 4 },
    }).risk
    expect(sick).toBeGreaterThan(plain)
  })
})

// ───────────────────── backtest contra el historial real ─────────────────────

/**
 * Reconstruye la serie diaria del fixture y puntúa cada día usando SOLO fechas
 * anteriores. Es el mismo backtest que motivó heuristic_v3, encajado como test
 * para que una regresión de calibración rompa el build en vez de aparecer meses
 * después como "el riesgo está al revés".
 */
function backtest(filter: (gap: number) => boolean = () => true) {
  const trained = new Set<string>(ATTENDANCE_FIXTURE)
  const first = ATTENDANCE_FIXTURE[0]
  const last = ATTENDANCE_FIXTURE[ATTENDANCE_FIXTURE.length - 1]
  const out: { risk: number; skipped: number }[] = []
  for (let d = first; d <= last; d = addDays(d, 1)) {
    const history = ATTENDANCE_FIXTURE.filter((x) => x < d).sort().reverse()
    if (history.length === 0) continue
    if (!filter(daysBetween(d, history[0]))) continue
    out.push({ risk: score(d, history).risk, skipped: trained.has(d) ? 0 : 1 })
  }
  return out
}

/** AUC de Mann-Whitney: P(riesgo(día que faltó) > riesgo(día que fue)). */
function auc(rows: { risk: number; skipped: number }[]) {
  const pos = rows.filter((r) => r.skipped === 1).map((r) => r.risk)
  const neg = rows.filter((r) => r.skipped === 0).map((r) => r.risk)
  let s = 0
  for (const a of pos) for (const b of neg) s += a > b ? 1 : a === b ? 0.5 : 0
  return s / (pos.length * neg.length)
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
const brier = (rows: { risk: number; skipped: number }[]) =>
  mean(rows.map((r) => (r.risk - r.skipped) ** 2))

describe('backtest sobre el historial real', () => {
  it('el riesgo medio es MAYOR los días que faltó (el bug reportado)', () => {
    const rows = backtest()
    const went = mean(rows.filter((r) => r.skipped === 0).map((r) => r.risk))
    const skip = mean(rows.filter((r) => r.skipped === 1).map((r) => r.risk))
    expect(skip).toBeGreaterThan(went)
  })

  it('sigue siendo mayor DENTRO del régimen activo, que es donde v2 se invertía', () => {
    const rows = backtest((gap) => gap <= 6)
    const went = mean(rows.filter((r) => r.skipped === 0).map((r) => r.risk))
    const skip = mean(rows.filter((r) => r.skipped === 1).map((r) => r.risk))
    // v2 daba +0.056 aquí — dentro del ruido de una muestra de 85 días.
    expect(skip - went).toBeGreaterThan(0.08)
  })

  it('discrimina mejor que el azar, global y en régimen activo', () => {
    expect(auc(backtest())).toBeGreaterThan(0.8)        // v2: 0.775
    expect(auc(backtest((g) => g <= 6))).toBeGreaterThan(0.7) // v2: 0.584
  })

  it('está calibrado: el Brier no se degrada', () => {
    expect(brier(backtest())).toBeLessThan(0.15)          // v2: 0.237
    expect(brier(backtest((g) => g <= 6))).toBeLessThan(0.25) // v2: 0.341
  })

  it('acierta la tasa base: el riesgo medio se parece a la tasa real de faltar', () => {
    const rows = backtest()
    const real = mean(rows.map((r) => r.skipped))
    expect(mean(rows.map((r) => r.risk))).toBeCloseTo(real, 1)
  })
})
