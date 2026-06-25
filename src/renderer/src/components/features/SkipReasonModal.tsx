import { useEffect, useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Field, Select } from '../ui/Field'
import { SKIP_REASON_OPTS } from '@shared/labels'
import { useToast } from '../ui/Toast'
import { Check, X } from 'lucide-react'
import type { EligibleSkipDay } from '@shared/types'

type Outcome = 'went' | 'skip'

export function SkipReasonModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [days, setDays] = useState<EligibleSkipDay[]>([])
  const [date, setDate] = useState('')
  const [outcome, setOutcome] = useState<Outcome>('skip')
  const [reason, setReason] = useState('fatigue')
  const [saving, setSaving] = useState(false)
  const { push } = useToast()

  useEffect(() => {
    if (!open) return
    setOutcome('skip')
    void window.api.getEligibleSkipDays().then((d) => {
      setDays(d)
      if (d.length) {
        setDate(d[0].date)
        if (d[0].current) setReason(d[0].current)
      }
    })
  }, [open])

  const save = async () => {
    setSaving(true)
    try {
      if (outcome === 'went') {
        const r = await window.api.resolveWent(date)
        if (r.ok) {
          push({ title: 'Día resuelto', body: `${date}: marcado como entrenado`, tone: 'ok' })
          onClose()
        } else {
          push({ title: 'Día no elegible', body: 'Ese día ya no está pendiente.', tone: 'danger' })
        }
        return
      }
      const r = await window.api.saveSkipReason(date, reason)
      if (r.ok) {
        push({ title: 'Razón guardada', body: `${date}: ${reason}`, tone: 'ok' })
        onClose()
      } else {
        push({ title: 'Día no elegible', body: 'Solo días cerrados sin sesión aceptan razón.', tone: 'danger' })
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} title="Resolver día pendiente" onClose={onClose}>
      {days.length === 0 ? (
        <p className="text-sm text-ink-dim">
          No hay días pendientes. Aquí aparecen días cerrados (ventana ≥22:00) sin
          sesión en Hevy y sin resolver.
        </p>
      ) : (
        <div className="space-y-4">
          <Field label="Día">
            <Select
              options={days.map((d) => [d.date, d.label] as [string, string])}
              value={date}
              onChange={(e) => {
                setDate(e.target.value)
                const cur = days.find((d) => d.date === e.target.value)?.current
                if (cur) setReason(cur)
              }}
            />
          </Field>

          <div>
            <p className="mb-2 text-sm font-medium text-ink-dim">¿Qué pasó ese día?</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setOutcome('went')}
                className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                  outcome === 'went'
                    ? 'border-ok bg-ok/15 text-ok'
                    : 'border-line bg-panel-2 text-ink-dim hover:text-ink'
                }`}
              >
                <Check size={15} /> Sí entrené
              </button>
              <button
                onClick={() => setOutcome('skip')}
                className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                  outcome === 'skip'
                    ? 'border-danger bg-danger/15 text-danger'
                    : 'border-line bg-panel-2 text-ink-dim hover:text-ink'
                }`}
              >
                <X size={15} /> No fui
              </button>
            </div>
          </div>

          {outcome === 'went' ? (
            <p className="text-xs text-ink-faint">
              Marca el día como entrenado (went=1, fuente manual). Úsalo cuando
              entrenaste pero no quedó registrado en Hevy.
            </p>
          ) : (
            <Field
              label="Razón"
              hint="Descanso: 'necesidad física' = sore/fatiga real · 'elección' = cuerpo OK pero decidiste. Si dudas, marca elección — la honestidad vale más."
            >
              <Select options={SKIP_REASON_OPTS} value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? 'Guardando…' : outcome === 'went' ? 'Marcar entrenado' : 'Guardar razón'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
