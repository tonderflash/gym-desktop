// Card "Agent" — vista compacta y futurista de lo que el agente (Claude en
// /loop) fue escribiendo sobre la data local. La app NO calcula estos insights;
// lee dos archivos que escribe el loop:
//   · agent_insights.json         → set ACTIVO curado (lo que se ve en el panel)
//   · agent_insights_archive.jsonl → historial completo (se ve en el modal)
// El card muestra solo el insight #1 + la distribución por categoría, para no
// comerse el dashboard; "Revisar" abre el modal con todo, filtrable y con el
// historial. Se refresca al montar y cuando la ventana recupera el foco.
import { useEffect, useMemo, useState } from 'react'
import {
  Bot, TrendingUp, Link2, Globe, Database, RefreshCw, ArrowRight,
  Maximize2, X, History,
  type LucideIcon,
} from 'lucide-react'
import type { AgentCategory, AgentInsight, AgentReport } from '@shared/types'

const CATEGORY_META: Record<AgentCategory, { label: string; icon: LucideIcon; color: string; cvar: string }> = {
  correlation: { label: 'correlación', icon: Link2, color: 'text-accent', cvar: 'var(--color-accent)' },
  trend: { label: 'tendencia', icon: TrendingUp, color: 'text-energy', cvar: 'var(--color-energy)' },
  research: { label: 'research', icon: Globe, color: 'text-mint', cvar: 'var(--color-mint)' },
  data: { label: 'dato', icon: Database, color: 'text-ink-dim', cvar: 'var(--color-ink-faint)' },
}
const CATEGORY_ORDER: AgentCategory[] = ['correlation', 'trend', 'research', 'data']

const TONE_VAR: Record<AgentInsight['tone'], string> = {
  ok: 'var(--color-ok)', warn: 'var(--color-warn)', info: 'var(--color-accent)',
}

function relTime(iso: string | null): string | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  const mins = Math.round((Date.now() - t) / 60000)
  if (mins < 1) return 'ahora'
  if (mins < 60) return `hace ${mins} min`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `hace ${hrs} h`
  const days = Math.round(hrs / 24)
  return days === 1 ? 'ayer' : `hace ${days} d`
}

function hostOf(url: string): string {
  try { return new URL(url).host.replace(/^www\./, '') } catch { return url }
}

/** Chip de categoría en mono, estilo terminal. */
function CategoryTag({ category, size = 'sm' }: { category: AgentCategory; size?: 'sm' | 'xs' }) {
  const m = CATEGORY_META[category]
  const Icon = m.icon
  const px = size === 'xs' ? 'text-[9px] gap-1 px-1.5 py-0.5' : 'text-[10px] gap-1.5 px-2 py-0.5'
  return (
    <span
      className={`inline-flex items-center rounded font-mono font-bold uppercase tracking-wider ${m.color} ${px}`}
      style={{ background: 'color-mix(in srgb, currentColor 12%, transparent)' }}
    >
      <Icon size={size === 'xs' ? 9 : 11} /> {m.label}
    </span>
  )
}

/** Fila completa de un insight (la usa el modal). */
function InsightRow({ ins }: { ins: AgentInsight }) {
  return (
    <div
      className="rounded-lg border border-line/40 bg-panel-2/30 p-3"
      style={{ boxShadow: `inset 2px 0 0 0 ${TONE_VAR[ins.tone]}` }}
    >
      <div className="mb-1 flex items-center gap-2">
        <CategoryTag category={ins.category} />
        <span className="ml-auto font-mono text-[10px] text-ink-faint">
          <span style={{ color: TONE_VAR[ins.tone] }}>◆</span> {ins.priority} · {relTime(ins.createdAt) ?? ''}
        </span>
      </div>
      <p className="text-sm font-semibold leading-snug text-ink">{ins.title}</p>
      {ins.body && <p className="mt-0.5 text-[13px] leading-snug text-ink-dim">{ins.body}</p>}
      {ins.evidence && (
        <p className="mt-1.5 rounded bg-surface/50 px-2 py-1 font-mono text-[10px] leading-snug text-ink-faint">
          {ins.evidence}
        </p>
      )}
      {ins.action && (
        <p className="mt-1.5 flex items-start gap-1 text-[12px] font-medium text-energy">
          <ArrowRight size={12} className="mt-0.5 shrink-0" /> {ins.action}
        </p>
      )}
      {ins.source && (
        <p className="mt-1 flex items-center gap-1 text-[10px] text-ink-faint">
          <Globe size={10} className="shrink-0" /> {hostOf(ins.source)}
        </p>
      )}
    </div>
  )
}

/** Modal "revisar en cualquier momento": todos los insights, filtrables, con
 *  opción de ver el historial completo (JSONL append-only). */
function AgentModal({
  active, onClose,
}: {
  active: AgentInsight[]
  onClose: () => void
}) {
  const [filter, setFilter] = useState<AgentCategory | 'all'>('all')
  const [history, setHistory] = useState(false)
  const [archive, setArchive] = useState<AgentInsight[] | null>(null)

  useEffect(() => {
    void window.api.getAgentArchive().then(setArchive).catch(() => setArchive([]))
  }, [])

  const base = history ? (archive ?? []) : active
  const sorted = useMemo(
    () => [...base].sort((a, b) => b.priority - a.priority || b.createdAt.localeCompare(a.createdAt)),
    [base],
  )
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: sorted.length }
    for (const cat of CATEGORY_ORDER) c[cat] = sorted.filter((i) => i.category === cat).length
    return c
  }, [sorted])
  const list = filter === 'all' ? sorted : sorted.filter((i) => i.category === filter)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[86vh] w-[720px] max-w-[94vw] flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* hairline superior futurista */}
        <div className="h-px w-full bg-gradient-to-r from-transparent via-accent to-transparent opacity-70" />

        <div className="flex items-start justify-between px-5 pt-4">
          <div>
            <h2 className="font-display flex items-center gap-2 text-lg font-extrabold text-ink">
              <Bot size={18} className="text-accent" /> Insights del agente
            </h2>
            <p className="mt-0.5 font-mono text-[11px] text-ink-faint">
              {active.length} activos{archive ? ` · ${archive.length} en historial` : ''}
            </p>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-ink-faint transition hover:bg-panel-2 hover:text-ink">
            <X size={18} />
          </button>
        </div>

        {/* barra de filtros */}
        <div className="flex flex-wrap items-center gap-1.5 px-5 py-3">
          {(['all', ...CATEGORY_ORDER] as const).map((k) => {
            const on = filter === k
            const label = k === 'all' ? 'todos' : CATEGORY_META[k].label
            const color = k === 'all' ? 'var(--color-ink)' : CATEGORY_META[k].cvar
            return (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={`rounded-full px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider transition ${on ? 'text-surface' : 'text-ink-dim hover:text-ink'}`}
                style={on ? { background: color } : { background: 'var(--color-panel-2)' }}
              >
                {label} {counts[k] ?? 0}
              </button>
            )
          })}
          <button
            onClick={() => setHistory((h) => !h)}
            className={`ml-auto flex items-center gap-1 rounded-full px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider transition ${history ? 'bg-accent text-surface' : 'bg-panel-2 text-ink-dim hover:text-ink'}`}
            title="Incluir todos los insights históricos (append-only)"
          >
            <History size={11} /> historial
          </button>
        </div>

        {/* lista scrollable */}
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-5 pb-5">
          {list.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-faint">
              {history && archive === null ? 'cargando historial…' : 'nada en esta categoría todavía.'}
            </p>
          ) : (
            list.map((ins) => <InsightRow key={`${ins.id}-${ins.createdAt}`} ins={ins} />)
          )}
        </div>
      </div>
    </div>
  )
}

export function AgentCard({ reloadKey = 0 }: { reloadKey?: number }) {
  const [report, setReport] = useState<AgentReport | null>(null)
  const [tick, setTick] = useState(0)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let alive = true
    void window.api.getAgentInsights().then((r) => { if (alive) setReport(r) }).catch(() => undefined)
    return () => { alive = false }
  }, [reloadKey, tick])

  const insights = report?.insights ?? []
  const hero = insights[0] ?? null
  const updated = relTime(report?.updatedAt ?? null)
  const counts = CATEGORY_ORDER
    .map((cat) => ({ cat, n: insights.filter((i) => i.category === cat).length }))
    .filter((c) => c.n > 0)

  return (
    <div className="relative overflow-hidden">
      {/* hairline superior con degradado cyan→lima: sello futurista */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent to-energy opacity-60" />

      {/* header */}
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* orbe "vivo" */}
          <span className="relative flex h-2.5 w-2.5 items-center justify-center">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
          </span>
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-ink-dim">agent</span>
          <span className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">· live</span>
        </div>
        <div className="flex items-center gap-2.5">
          {updated && <span className="font-mono text-[10px] text-ink-faint">{updated}</span>}
          {insights.length > 0 && (
            <span className="rounded-full bg-panel-2 px-1.5 py-0.5 font-mono text-[10px] font-bold text-ink-dim">
              {insights.length}
            </span>
          )}
          <button onClick={() => setTick((t) => t + 1)} className="text-ink-faint transition hover:text-ink" title="Recargar">
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {/* línea "trabajando" (plan del próximo ciclo) */}
      {report?.nextAction && (
        <div className="mb-2.5 flex items-center gap-1.5 font-mono text-[10px] text-ink-faint">
          <span className="h-1 w-1 shrink-0 animate-pulse rounded-full bg-accent" />
          <span className="truncate">
            <span className="text-accent">▸ trabajando:</span> {report.nextAction}
          </span>
        </div>
      )}

      {!hero ? (
        <p className="text-sm leading-relaxed text-ink-dim">
          {report?.present
            ? 'El agente aún no ha escrito insights. En su próximo ciclo va a leer tu check-in, tu Hevy y tu VBT y dejar aquí lo que encuentre.'
            : 'El agente todavía no ha corrido. Cuando el loop arranque, va a analizar tu data local y llenar este card con correlaciones, tendencias y research — ordenado por lo más importante.'}
        </p>
      ) : (
        <>
          {/* HERO: solo el insight #1, para no comerse el dashboard */}
          <div
            className="relative overflow-hidden rounded-xl border border-line/50 p-3"
            style={{ background: `linear-gradient(135deg, color-mix(in srgb, ${TONE_VAR[hero.tone]} 8%, var(--color-panel-2)) 0%, var(--color-panel-2) 55%)` }}
          >
            <div
              className="absolute inset-y-0 left-0 w-0.5"
              style={{ background: TONE_VAR[hero.tone], boxShadow: `0 0 10px 0 ${TONE_VAR[hero.tone]}` }}
            />
            <div className="mb-1 flex items-center gap-2 pl-1.5">
              <CategoryTag category={hero.category} />
              <span className="ml-auto font-mono text-[10px] text-ink-faint">
                <span style={{ color: TONE_VAR[hero.tone] }}>◆</span> prio {hero.priority}
              </span>
            </div>
            <p className="pl-1.5 text-sm font-bold leading-snug text-ink">{hero.title}</p>
            <p className="mt-0.5 line-clamp-2 pl-1.5 text-[13px] leading-snug text-ink-dim">{hero.body}</p>
          </div>

          {/* distribución por categoría + acceso al modal */}
          <div className="mt-2.5 flex items-center gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {counts.map(({ cat, n }) => (
                <button key={cat} onClick={() => setOpen(true)} title="Ver todos">
                  <span className="inline-flex items-center gap-1 rounded-full bg-panel-2/70 px-2 py-0.5 font-mono text-[10px] text-ink-dim transition hover:text-ink">
                    <span style={{ color: CATEGORY_META[cat].cvar }}>●</span>
                    {CATEGORY_META[cat].label} {n}
                  </span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setOpen(true)}
              className="ml-auto flex shrink-0 items-center gap-1 rounded-full border border-line px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-mint transition hover:border-accent hover:text-accent"
            >
              <Maximize2 size={11} /> revisar {insights.length}
            </button>
          </div>
        </>
      )}

      {open && <AgentModal active={insights} onClose={() => setOpen(false)} />}
    </div>
  )
}
