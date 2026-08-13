import { useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { BodyMap, zoneColor, ZONE_LABEL } from './BodyMap'
import { Flame, TrendingUp, Minus, SlidersHorizontal } from 'lucide-react'
import type { MuscleInsight, MusclePriority } from '@shared/types'

const PRIORITY_META: Record<MusclePriority, { label: string; short: string; icon: typeof Flame; tone: string }> = {
  aggressive: { label: 'Hipertrofia agresiva', short: 'Agresivo', icon: Flame, tone: 'text-energy' },
  grow: { label: 'Crecer', short: 'Crecer', icon: TrendingUp, tone: 'text-mint' },
  maintain: { label: 'Mantener', short: 'Mantener', icon: Minus, tone: 'text-ink-faint' },
}

/**
 * Barra de volumen contra los tres landmarks del músculo. No hay marca de
 * "objetivo personal": ese número sería una interpolación inventada encima del
 * marco. Lo único que se dibuja es lo que el marco define — MEV (piso, debajo
 * solo sostienes), MAV (a dónde apuntas) y MRV (techo recuperable) — y dónde
 * caes tú. La escala llega al MRV, así que la posición ES la lectura.
 */
function VolumeBar({ m }: { m: MuscleInsight }) {
  const scale = Math.max(m.mrv, m.sets7d, 1)
  const pctOf = (v: number): number => Math.min(100, (v / scale) * 100)

  return (
    <div className="relative mt-0.5 h-2 rounded-full bg-panel-2">
      {/* zona de crecimiento (MEV → MAV) y, más tenue, el margen hasta el MRV */}
      <div
        className="absolute inset-y-0 bg-accent/10"
        style={{ left: `${pctOf(m.mav)}%`, width: `${pctOf(m.mrv) - pctOf(m.mav)}%` }}
      />
      <div
        className="absolute inset-y-0 bg-accent/22"
        style={{ left: `${pctOf(m.mev)}%`, width: `${pctOf(m.mav) - pctOf(m.mev)}%` }}
      />
      <div
        className="bar-grow h-full rounded-full"
        style={{ width: `${pctOf(m.sets7d)}%`, background: zoneColor(m) }}
      />
      {/* MEV: debajo de aquí el volumen sostiene, no construye */}
      <span
        className="absolute -top-0.5 h-3 w-px bg-ink/75"
        style={{ left: `${pctOf(m.mev)}%` }}
        title={`MEV ${m.mev} — piso: debajo mantienes, no creces`}
      />
      {/* MAV: a dónde apuntar */}
      <span
        className="absolute -top-1 h-4 w-[2px] rounded bg-ink/75"
        style={{ left: `${pctOf(m.mav)}%` }}
        title={`MAV ${m.mav} — a dónde apuntas`}
      />
      {/* MRV: techo de lo recuperable */}
      <span
        className="absolute -top-0.5 h-3 w-px bg-danger/60"
        style={{ left: `${pctOf(m.mrv)}%` }}
        title={`MRV ${m.mrv} — techo recuperable`}
      />
    </div>
  )
}

/** Leyenda: una fila por músculo con su volumen, umbrales y prioridad. */
export function MuscleLegend({ muscles }: { muscles: MuscleInsight[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-1.5">
      {muscles.map((m) => {
        const meta = PRIORITY_META[m.priority]
        const Icon = meta.icon
        return (
          <div key={m.key} title={`${m.label}: ${m.sets7d} series · ${ZONE_LABEL[m.zone]} · MEV ${m.mev} / MAV ${m.mav} / MRV ${m.mrv} · apuntas al ${m.targetSets} (${meta.label})`}>
            <div className="flex justify-between text-[11px]">
              <span className="flex items-center gap-1 text-ink-dim">
                {m.priority !== 'maintain' && <Icon size={10} className={meta.tone} />}
                {m.label}
              </span>
              <span className="font-mono text-ink-faint">
                {m.sets7d} <span className="text-ink-faint/60">/ {m.mev}–{m.mav}</span>
                {m.lastDaysAgo !== null && m.lastDaysAgo > 0 ? ` · ${m.lastDaysAgo}d` : ''}
              </span>
            </div>
            <VolumeBar m={m} />
          </div>
        )
      })}
    </div>
  )
}

/** Editor de prioridades: qué músculos quieres hipertrofiar y cuáles sostener. */
export function MusclePriorityEditor({
  open, muscles, onClose,
}: {
  open: boolean
  muscles: MuscleInsight[]
  onClose: () => void
}) {
  const [draft, setDraft] = useState<Record<string, MusclePriority>>({})
  const [saving, setSaving] = useState(false)

  // el draft arranca vacío y se llena solo con lo que tocas; lo no tocado
  // conserva lo guardado (el patch se mergea en main)
  const valueOf = (m: MuscleInsight): MusclePriority => draft[m.key] ?? m.priority

  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      await window.api.saveSettings({ musclePriorities: draft })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const aggressive = muscles.filter((m) => valueOf(m) === 'aggressive').length

  return (
    <Modal open={open} title="¿Qué quieres hipertrofiar?" onClose={onClose}>
      <p className="mb-3 text-xs leading-snug text-ink-faint">
        Mantener apunta al MEV (el piso). Crecer y agresivo apuntan al MAV — agresivo no inventa un número
        más alto, pesa más en el readiness y manda en qué se sugiere entrenar primero.
        Hipertrofiar todo a la vez no funciona: elige pocos y aliméntalos.
      </p>
      <div className="max-h-[50vh] space-y-1 overflow-y-auto pr-1">
        {muscles.map((m) => {
          const v = valueOf(m)
          return (
            <div key={m.key} className="flex items-center gap-2 rounded-xl bg-panel-2/50 px-3 py-1.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">{m.label}</p>
                <p className="font-mono text-[10px] text-ink-faint">
                  MEV {m.mev} · MAV {m.mav} · MRV {m.mrv}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                {(['maintain', 'grow', 'aggressive'] as MusclePriority[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => setDraft((d) => ({ ...d, [m.key]: p }))}
                    className={`rounded-full px-2.5 py-1 text-[10px] font-semibold transition ${
                      v === p ? 'bg-energy text-panel' : 'bg-panel text-ink-faint hover:text-ink'
                    }`}
                  >
                    {PRIORITY_META[p].short}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
      {aggressive > 3 && (
        <p className="mt-3 text-[11px] text-warn">
          {aggressive} músculos en agresivo — con esa carga la recuperación no da; 2 o 3 rinde más.
        </p>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar'}
        </Button>
      </div>
    </Modal>
  )
}

/**
 * Card completo del mapa muscular: figura + leyenda con umbrales + editor.
 * Guardar prioridades no necesita refetch: el main rebroadcastea el estado con
 * los objetivos ya recalculados.
 */
export function MuscleCard({ muscles }: { muscles: MuscleInsight[] }) {
  const [editOpen, setEditOpen] = useState(false)
  const priority = muscles.filter((m) => m.priority !== 'maintain')
  const growing = priority.filter((m) => m.zone === 'growth' || m.zone === 'optimal')

  return (
    <>
      <div className="grid grid-cols-[auto_1fr] items-center gap-8">
        <BodyMap muscles={muscles} />
        <MuscleLegend muscles={muscles} />
      </div>
      <div className="mt-3 flex items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="text-[10px] leading-relaxed text-ink-faint">
            series efectivas de 7 días · <span className="text-ink-dim">MEV</span> = piso (debajo sostienes, no
            construyes) · <span className="text-ink-dim">MAV</span> = a dónde apuntas ·{' '}
            <span className="text-danger">MRV</span> = techo recuperable. Los tres son landmarks del marco de
            volumen, no medidas tuyas: son una guía de dosis, no un medidor de crecimiento.
          </p>
          {priority.length > 0 && (
            <p className="text-[11px] text-ink-dim">
              Priorizados: {priority.map((m) => m.label).join(', ')} — {growing.length} de {priority.length} en
              zona de crecimiento esta semana.
            </p>
          )}
        </div>
        <Button variant="ghost" className="shrink-0" onClick={() => setEditOpen(true)}>
          <span className="flex items-center gap-1.5">
            <SlidersHorizontal size={14} /> Prioridades
          </span>
        </Button>
      </div>
      <MusclePriorityEditor
        open={editOpen}
        muscles={muscles}
        onClose={() => setEditOpen(false)}
      />
    </>
  )
}
