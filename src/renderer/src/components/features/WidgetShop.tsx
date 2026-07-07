import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import {
  Trophy, PersonStanding, BarChart3, Medal, Sparkles, Table2, CalendarCheck, Sigma,
  ScanLine, Gauge,
  type LucideIcon,
} from 'lucide-react'

/**
 * Catálogo de la galería. Un "template" = un card del panel que el usuario
 * instala/quita. Para publicar uno nuevo: entrada aquí + key en WIDGET_KEYS
 * (main/settings.ts) + su render en Dashboard.tsx.
 */
export interface WidgetTemplate {
  key: string
  label: string
  desc: string
  icon: LucideIcon
}

export const WIDGET_CATALOG: WidgetTemplate[] = [
  {
    key: 'meet',
    label: 'Objetivo',
    desc: 'Tu meta con fecha (meet, PR test): trayectoria por básico, ritmo necesario vs. tu tendencia y proyección.',
    icon: Trophy,
  },
  {
    key: 'muscles',
    label: 'Mapa muscular',
    desc: 'Cuerpo humano con calor por grupo: series efectivas de los últimos 7 días vs. tu volumen objetivo.',
    icon: PersonStanding,
  },
  {
    key: 'volume',
    label: 'Volumen semanal',
    desc: 'Tonelaje (peso × reps) por semana, 8 semanas, con comparación contra tu promedio.',
    icon: BarChart3,
  },
  {
    key: 'prs',
    label: 'Récords recientes',
    desc: 'PRs de e1RM de los últimos 14 días frente a tus mejores marcas previas.',
    icon: Medal,
  },
  {
    key: 'findings',
    label: 'Insights',
    desc: 'Correlaciones de tu check-in: sueño, energía y día de la semana vs. asistencia real.',
    icon: Sparkles,
  },
  {
    key: 'riskBreakdown',
    label: 'Desglose del riesgo',
    desc: 'La tabla de factores que componen el riesgo de hoy, con su contribución exacta.',
    icon: Table2,
  },
  {
    key: 'consistency',
    label: 'Constancia',
    desc: 'Sesiones por semana contra tu rotación objetivo — ¿cuántas semanas completas llevas?',
    icon: CalendarCheck,
  },
  {
    key: 'total',
    label: 'Total powerlifting',
    desc: 'Tu total actual (squat + bench + deadlift en e1RM) en grande, con el desglose por básico.',
    icon: Sigma,
  },
  {
    key: 'vbtHomolog',
    label: 'Homologación VBT',
    desc: 'Tus videos vs lo logueado en Hevy, en vivo del motor GymVision: series verificadas por visión, pendientes de analizar y pesos desactualizados.',
    icon: ScanLine,
  },
  {
    key: 'vbtProfile',
    label: 'Perfil carga-velocidad',
    desc: 'Tu recta personal del deadlift (velocidad de la rep más rápida por carga): 1RM estimado en el cruce de 0.24 m/s y rango de carga para los triples pesados.',
    icon: Gauge,
  },
]

export function WidgetShop({
  open, enabled, onToggle, onClose,
}: {
  open: boolean
  enabled: (key: string) => boolean
  onToggle: (key: string, value: boolean) => void
  onClose: () => void
}) {
  return (
    <Modal open={open} title="Galería de widgets" onClose={onClose}>
      <p className="mb-3 text-xs text-ink-faint">
        Arma tu panel: instala los templates que te sirvan y quita los que no. Todos se calculan
        de tu propia data local.
      </p>
      <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
        {WIDGET_CATALOG.map((w) => {
          const on = enabled(w.key)
          return (
            <div key={w.key} className="flex items-center gap-3 rounded-xl border border-line/60 bg-panel-2/50 p-3">
              <w.icon size={18} className={on ? 'shrink-0 text-energy' : 'shrink-0 text-ink-faint'} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                  {w.label}
                  {on && <Badge tone="energy">instalado</Badge>}
                </p>
                <p className="mt-0.5 text-xs leading-snug text-ink-faint">{w.desc}</p>
              </div>
              <Button variant={on ? 'subtle' : 'primary'} onClick={() => onToggle(w.key, !on)} className="shrink-0">
                {on ? 'Quitar' : 'Añadir'}
              </Button>
            </div>
          )
        })}
      </div>
      <div className="mt-4 flex justify-end">
        <Button variant="ghost" onClick={onClose}>Cerrar</Button>
      </div>
    </Modal>
  )
}
