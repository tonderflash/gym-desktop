// Widgets del dashboard que consumen el SERVICIO GymVision en vivo (Django
// local) a través de los canales IPC de la extensión. Decisión de
// arquitectura: la data del VBT NO se duplica en Electron — el servicio es la
// única fuente de verdad y estos widgets son lectores efímeros (fetch al
// montar). Dependencia suave a propósito: hablan el contrato de canales
// (`gymvision:*`) sin importar nada de la carpeta de la extensión, así que si
// la extensión se borra o el motor está apagado, degradan a "motor offline".
import { useEffect, useState } from 'react'
import { Check, AlertTriangle, Clock, RefreshCw } from 'lucide-react'

interface ApiResult<T> {
  ok: boolean
  data?: T
  error?: string
}

async function inv<T>(channel: string, ...args: unknown[]): Promise<ApiResult<T>> {
  try {
    return await window.extensions.invoke<ApiResult<T>>(`gymvision:${channel}`, ...args)
  } catch {
    return { ok: false, error: 'unavailable' } // extensión ausente o main viejo
  }
}

// Tipos mínimos: subconjunto del contrato del API que estos widgets leen.
interface VbtSummaryLite {
  rep_count: number
  best_velocity: number | null
  velocity_loss_pct: number | null
  top_zone: string
}

interface HevyLinkLite {
  set_number: number
  reps: number | null
  weight_drift: boolean
  rep_match: { logged: number | null; detected: number | null; ok: boolean } | null
}

export interface VbtSessionRow {
  id: number
  date: string
  weight_kg: number
  exercise: string
  exercise_slug: string
  summary: VbtSummaryLite
  hevy: HevyLinkLite | null
}

type Status = 'loading' | 'offline' | 'ready'

function useVbtSessions(): { status: Status; sessions: VbtSessionRow[]; reload: () => void } {
  const [status, setStatus] = useState<Status>('loading')
  const [sessions, setSessions] = useState<VbtSessionRow[]>([])
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let alive = true
    void inv<VbtSessionRow[]>('sessions').then((r) => {
      if (!alive) return
      if (!r.ok || !r.data) { setStatus('offline'); return }
      setSessions(r.data)
      setStatus('ready')
    })
    return () => { alive = false }
  }, [tick])

  return { status, sessions, reload: () => setTick((t) => t + 1) }
}

function Offline({ reload }: { reload: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-sm text-ink-dim">
        Motor GymVision offline — arranca <code className="text-[11px]">manage.py runserver</code> para ver tu data VBT.
      </p>
      <button className="text-ink-faint transition hover:text-ink" onClick={reload} title="Reintentar">
        <RefreshCw size={14} />
      </button>
    </div>
  )
}

const kg = (w: number): number => Math.round(w * 2) / 2

// ── Widget 1: homologación video ↔ Hevy ──────────────────────────────────
export function VbtHomologCard() {
  const { status, sessions, reload } = useVbtSessions()
  if (status === 'loading') return <p className="text-sm text-ink-faint">conectando con el motor…</p>
  if (status === 'offline') return <Offline reload={reload} />

  const linked = sessions.filter((s) => s.hevy)
  if (linked.length === 0) {
    return <p className="text-sm text-ink-dim">Aún no hay videos enlazados a series de Hevy. Abre un día en VBT Lab y asigna videos.</p>
  }
  const verified = linked.filter((s) => s.hevy!.rep_match?.ok)
  const mismatch = linked.filter((s) => s.summary.rep_count > 0 && !s.hevy!.rep_match?.ok)
  const pending = linked.filter((s) => s.summary.rep_count === 0)
  const drift = linked.filter((s) => s.hevy!.weight_drift)

  const lastDate = linked.map((s) => s.date).sort().at(-1)!
  const lastDay = linked
    .filter((s) => s.date === lastDate)
    .sort((a, b) => a.hevy!.set_number - b.hevy!.set_number)

  return (
    <div>
      <div className="mb-3 flex items-baseline gap-4 text-xs">
        <span className="font-display text-2xl font-black text-ok">{verified.length}<span className="text-ink-faint">/{linked.length}</span></span>
        <span className="text-ink-dim">verificadas contra Hevy</span>
        {pending.length > 0 && <span className="font-semibold text-warn">{pending.length} sin analizar</span>}
        {drift.length > 0 && <span className="font-semibold text-warn">{drift.length} con peso desactualizado</span>}
      </div>

      <p className="mb-1.5 text-[10px] uppercase tracking-wider text-ink-faint">último día con video · {lastDate}</p>
      <div className="space-y-1">
        {lastDay.map((s) => {
          const m = s.hevy!.rep_match
          const state = s.summary.rep_count === 0 ? 'pending' : m?.ok ? 'ok' : 'mismatch'
          return (
            <div key={s.id} className="flex items-center gap-2 text-xs">
              {state === 'ok' && <Check size={13} className="shrink-0 text-ok" />}
              {state === 'mismatch' && <AlertTriangle size={13} className="shrink-0 text-warn" />}
              {state === 'pending' && <Clock size={13} className="shrink-0 text-ink-faint" />}
              <span className="text-ink">{s.exercise} · set {s.hevy!.set_number} · {kg(s.weight_kg)}kg</span>
              <span className="ml-auto font-mono text-ink-dim">
                {state === 'ok' && `${m!.detected}/${m!.logged} reps`}
                {state === 'mismatch' && `vio ${m?.detected ?? s.summary.rep_count} · logueaste ${m?.logged ?? '?'}`}
                {state === 'pending' && 'pendiente en la PC'}
              </span>
            </div>
          )
        })}
      </div>
      {mismatch.length > 0 && (
        <p className="mt-2 text-[10px] text-ink-faint">
          en las que no cuadran: abre la sesión en VBT Lab y usa “Re-ajustar barra”
        </p>
      )}
    </div>
  )
}

// ── Widget 2: perfil carga-velocidad del deadlift ────────────────────────
// La recta personal v(carga) con la velocidad media de la rep más rápida por
// carga. Donde cruza ~0.24 m/s (velocidad al 1RM real del deadlift en la
// literatura) está el 1RM estimado del día — sin test máximo. El rango
// 0.45–0.55 m/s marca la carga correcta para los triples pesados del jueves.
const MVT = 0.24
const TRIPLE_LO = 0.45
const TRIPLE_HI = 0.55

export function VbtProfileCard() {
  const { status, sessions, reload } = useVbtSessions()
  if (status === 'loading') return <p className="text-sm text-ink-faint">conectando con el motor…</p>
  if (status === 'offline') return <Offline reload={reload} />

  // mejor velocidad (rep más rápida) por carga distinta, solo deadlift analizado
  const byLoad = new Map<number, number>()
  for (const s of sessions) {
    if (s.exercise_slug !== 'deadlift' || s.summary.best_velocity == null) continue
    const load = kg(s.weight_kg)
    byLoad.set(load, Math.max(byLoad.get(load) ?? 0, s.summary.best_velocity))
  }
  const pts = [...byLoad.entries()].map(([load, v]) => ({ load, v })).sort((a, b) => a.load - b.load)

  if (pts.length < 2) {
    return (
      <p className="text-sm text-ink-dim">
        Necesito al menos 2 cargas distintas de deadlift analizadas para trazar tu recta
        ({pts.length === 1 ? `solo tengo ${pts[0].load}kg` : 'aún no hay ninguna'}).
        La sesión rampa del programa te da 5-6 puntos de una vez.
      </p>
    )
  }

  // mínimos cuadrados: v = a + b·carga (b debe salir negativo)
  const n = pts.length
  const mx = pts.reduce((s, p) => s + p.load, 0) / n
  const my = pts.reduce((s, p) => s + p.v, 0) / n
  const b = pts.reduce((s, p) => s + (p.load - mx) * (p.v - my), 0)
    / Math.max(1e-9, pts.reduce((s, p) => s + (p.load - mx) ** 2, 0))
  const a = my - b * mx
  const usable = b < -1e-4
  const e1rm = usable ? (MVT - a) / b : null
  const tripleLoads = usable
    ? ([(TRIPLE_HI - a) / b, (TRIPLE_LO - a) / b] as const) // [más liviano, más pesado]
    : null

  // geometría del gráfico
  const W = 300, H = 130, PAD = { l: 30, r: 12, t: 8, b: 18 }
  const xMax = Math.max(e1rm ?? 0, ...pts.map((p) => p.load)) * 1.08
  const xMin = Math.min(...pts.map((p) => p.load)) * 0.75
  const yMax = Math.max(...pts.map((p) => p.v)) * 1.15
  const yMin = Math.min(MVT - 0.05, ...pts.map((p) => p.v)) * 0.85
  const X = (l: number): number => PAD.l + ((l - xMin) / (xMax - xMin)) * (W - PAD.l - PAD.r)
  const Y = (v: number): number => PAD.t + (1 - (v - yMin) / (yMax - yMin)) * (H - PAD.t - PAD.b)

  return (
    <div>
      <div className="mb-2 flex items-baseline gap-4">
        {e1rm != null && (
          <span className="font-display text-2xl font-black text-ink">
            ~{Math.round(e1rm)}<span className="text-sm font-semibold text-ink-faint">kg 1RM est.</span>
          </span>
        )}
        {tripleLoads && (
          <span className="text-xs text-ink-dim">
            triples pesados: <b className="text-ink">{Math.round(tripleLoads[0])}–{Math.round(tripleLoads[1])}kg</b>
          </span>
        )}
        <span className="ml-auto text-[10px] text-ink-faint">{n} cargas</span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {/* línea de mínima velocidad (1RM) */}
        <line x1={PAD.l} x2={W - PAD.r} y1={Y(MVT)} y2={Y(MVT)}
          stroke="var(--color-warn, #ffb020)" strokeDasharray="4 4" strokeWidth="1" opacity="0.6" />
        <text x={W - PAD.r} y={Y(MVT) - 3} textAnchor="end" fontSize="8" fill="var(--color-warn, #ffb020)">
          {MVT} m/s ≈ 1RM
        </text>

        {/* recta ajustada, recortada al área visible */}
        {usable && (
          <line x1={X(xMin)} y1={Y(a + b * xMin)} x2={X(Math.min(xMax, (yMin - a) / b))}
            y2={Y(Math.max(yMin, a + b * Math.min(xMax, (yMin - a) / b)))}
            stroke="var(--color-accent)" strokeWidth="1.5" opacity="0.85" />
        )}

        {/* cruce = 1RM estimado */}
        {e1rm != null && e1rm <= xMax && (
          <g>
            <circle cx={X(e1rm)} cy={Y(MVT)} r="4" fill="none" stroke="var(--color-energy)" strokeWidth="1.5" />
            <text x={X(e1rm)} y={Y(MVT) + 12} textAnchor="middle" fontSize="8" fill="var(--color-energy)">
              {Math.round(e1rm)}kg
            </text>
          </g>
        )}

        {/* puntos medidos */}
        {pts.map((p) => (
          <g key={p.load}>
            <circle cx={X(p.load)} cy={Y(p.v)} r="3.5" fill="var(--color-energy)" />
            <text x={X(p.load)} y={Y(p.v) - 7} textAnchor="middle" fontSize="8" fill="var(--color-ink-dim, #999)">
              {p.load}kg · {p.v.toFixed(2)}
            </text>
          </g>
        ))}

        {/* eje x mínimo */}
        <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} stroke="currentColor" opacity="0.15" />
        <text x={PAD.l} y={H - 6} fontSize="8" fill="var(--color-ink-faint, #777)">carga (kg)</text>
        <text x={PAD.l - 4} y={PAD.t + 6} textAnchor="end" fontSize="8" fill="var(--color-ink-faint, #777)" transform={`rotate(-90 ${PAD.l - 4} ${PAD.t + 6})`}>
          m/s
        </text>
      </svg>

      {usable ? (
        <p className="mt-1 text-[10px] text-ink-faint">
          velocidad de la rep más rápida por carga · re-test cada 4-6 semanas: si la recta se corre a la derecha, estás más fuerte
        </p>
      ) : (
        <p className="mt-1 text-xs text-warn">
          Tu recta sale invertida: la carga pesada fue MÁS rápida que la ligera. Eso delata una
          carga movida sin intención máxima (higiene de datos del programa) — repite las ligeras
          jalando a tope, o corre la sesión rampa para 5-6 puntos limpios de una vez.
        </p>
      )}
    </div>
  )
}
