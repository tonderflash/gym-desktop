import { useEffect, useState } from 'react'
import { Card, CardTitle } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { PageHeader } from '../components/ui/PageHeader'
import { labelFor, INTENTION_OPTS, SKIP_REASON_OPTS } from '@shared/labels'

export function History() {
  const [rows, setRows] = useState<Record<string, string>[]>([])

  useEffect(() => {
    void window.api.getHistory().then(setRows)
  }, [])

  return (
    <div className="p-6 pt-3">
      <PageHeader title="Historial" subtitle={`${rows.length} días en el dataset`} />
      <Card>
        <CardTitle>Registro diario</CardTitle>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                <th className="py-2 pr-3">Fecha</th>
                <th className="py-2 pr-3">Fue</th>
                <th className="py-2 pr-3">Sesión</th>
                <th className="py-2 pr-3">Intención</th>
                <th className="py-2 pr-3">Energía</th>
                <th className="py-2 pr-3">Sueño</th>
                <th className="py-2 pr-3">Riesgo</th>
                <th className="py-2">Razón skip</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const went = r.went?.trim()
                return (
                  <tr key={r.date} className="border-b border-line/40 last:border-0">
                    <td className="py-2 pr-3 font-mono text-xs text-ink-dim">{r.date}</td>
                    <td className="py-2 pr-3">
                      {went === '1' ? <Badge tone="ok">sí</Badge>
                        : went === '0' ? <Badge tone="danger">no</Badge>
                        : <Badge tone="neutral">abierto</Badge>}
                    </td>
                    <td className="max-w-[180px] truncate py-2 pr-3 text-xs text-ink-dim">
                      {r.workout_session_type || r.workout_title || (r.was_rest_day === '1' ? 'descanso' : '—')}
                    </td>
                    <td className="py-2 pr-3 text-xs text-ink-dim">{labelFor(INTENTION_OPTS, r.intention?.trim())}</td>
                    <td className="py-2 pr-3 text-xs text-ink-dim">{r.energy?.trim() ? `${r.energy}/5` : '—'}</td>
                    <td className="py-2 pr-3 text-xs text-ink-dim">{r.sleep_hours?.trim() ? `${r.sleep_hours}h` : '—'}</td>
                    <td className="py-2 pr-3 font-mono text-xs text-ink-dim">
                      {r.predicted_risk?.trim() ? `${Math.round(parseFloat(r.predicted_risk) * 100)}%` : '—'}
                    </td>
                    <td className="py-2 text-xs text-ink-dim">{labelFor(SKIP_REASON_OPTS, r.skip_reason?.trim() || null)}</td>
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr><td colSpan={8} className="py-6 text-center text-sm text-ink-faint">Sin datos aún</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
