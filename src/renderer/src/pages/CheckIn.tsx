import { useEffect, useState } from 'react'
import { Card, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { Field, TextInput, Select, SliderField } from '../components/ui/Field'
import { PageHeader } from '../components/ui/PageHeader'
import { useAppState } from '../hooks/useAppState'
import { useToast } from '../components/ui/Toast'
import { PAIN_OPTS, INTENTION_OPTS, SLEEP_SOURCE_OPTS } from '@shared/labels'
import type { CheckinPayload, FactorDef } from '@shared/types'
import type { Page } from '../App'

export function CheckIn({ onNavigate }: { onNavigate: (p: Page) => void }) {
  const { state } = useAppState()
  const { push } = useToast()

  const [factors, setFactors] = useState<FactorDef[]>([])
  const [energy, setEnergy] = useState(3)
  const [stress, setStress] = useState(3)
  const [pain, setPain] = useState('none')
  const [sleep, setSleep] = useState('7.0')
  const [sleepSource, setSleepSource] = useState('manual')
  const [intention, setIntention] = useState('probably')
  const [notes, setNotes] = useState('')
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)
  const [delayWarn, setDelayWarn] = useState<string | null>(null)

  // Prefill desde la fila de hoy (re-edición)
  useEffect(() => {
    void window.api.getSettings().then((s) => setFactors(s.factors))
  }, [])

  useEffect(() => {
    const row = state?.todayRow
    if (!row || !row.energy?.trim()) return
    setEnergy(parseInt(row.energy, 10) || 3)
    setStress(parseInt(row.stress, 10) || 3)
    setPain(row.pain?.trim() || 'none')
    setSleep(row.sleep_hours?.trim() || '7.0')
    setSleepSource(row.sleep_source?.trim() || 'manual')
    setIntention(row.intention?.trim() || 'probably')
    setNotes(row.notes ?? '')
    const ck: Record<string, boolean> = {}
    for (const [k, v] of Object.entries(row)) {
      if (k.startsWith('factor_')) ck[k] = v.trim() === '1'
    }
    setChecked(ck)
  }, [state?.todayRow])

  if (!state) return <div className="p-6 text-sm text-ink-faint">Cargando…</div>

  const isReEdit = state.checkin.status === 'done'

  const buildPayload = (confirmDelayed: boolean): CheckinPayload => {
    const f: Record<string, 0 | 1> = {}
    for (const fd of factors) f[`factor_${fd.key}`] = checked[`factor_${fd.key}`] ? 1 : 0
    const sleepNum = parseFloat(sleep.replace(',', '.'))
    return {
      energy, stress, pain,
      sleep_hours: Number.isFinite(sleepNum) ? sleepNum : null,
      sleep_source: sleepSource,
      intention,
      notes: notes.trim(),
      factors: f,
      confirmDelayed,
    }
  }

  const save = async (confirmDelayed = false) => {
    setSaving(true)
    try {
      const r = await window.api.saveCheckin(buildPayload(confirmDelayed))
      if (r.needsDelayConfirm) {
        setDelayWarn(r.delayReason ?? '')
        return
      }
      if (!r.ok) {
        push({ title: 'Datos inválidos', body: r.errors?.join(' · '), tone: 'danger' })
        return
      }
      push({ title: isReEdit ? 'Check-in actualizado' : 'Check-in guardado', tone: 'ok' })
      onNavigate('dashboard')
    } finally {
      setSaving(false)
      setDelayWarn(null)
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-4 p-6 pt-3">
      <PageHeader
        title="Check-in del día"
        subtitle="15 segundos — datos para el modelo de adherencia"
      />
      <Card>
        <CardTitle>Contexto del día</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="accent">
            {state.nextSession ? `Toca: ${state.nextSession}` : state.today}
          </Badge>
          {isReEdit && <Badge tone="warn">editando entrada existente</Badge>}
          {state.checkin.status === 'late' && <Badge tone="danger">día cerrado — se marcará delayed</Badge>}
        </div>
      </Card>

      <Card>
        <CardTitle>Cómo estás hoy</CardTitle>
        <div className="space-y-5">
          <SliderField label="Energía ahora" value={energy} onChange={setEnergy} />
          <SliderField label="Estrés del día" value={stress} onChange={setStress} />

          <div className="grid grid-cols-2 gap-4">
            <Field label="Dolor / fatiga">
              <Select options={PAIN_OPTS} value={pain} onChange={(e) => setPain(e.target.value)} />
            </Field>
            <Field label="¿Vas a ir hoy?">
              <Select options={INTENTION_OPTS} value={intention} onChange={(e) => setIntention(e.target.value)} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Dormí anoche (horas)">
              <TextInput value={sleep} onChange={(e) => setSleep(e.target.value)} inputMode="decimal" />
            </Field>
            <Field label="Fuente del sueño">
              <Select options={SLEEP_SOURCE_OPTS} value={sleepSource} onChange={(e) => setSleepSource(e.target.value)} />
            </Field>
          </div>

          {factors.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium text-ink-dim">Factores ayer/anoche (lo que aplique)</p>
              <div className="grid grid-cols-2 gap-2">
                {factors.map((f) => {
                  const col = `factor_${f.key}`
                  return (
                    <label key={f.key} className="flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-ink-dim hover:text-ink">
                      <input
                        type="checkbox"
                        checked={checked[col] ?? false}
                        onChange={(e) => setChecked((c) => ({ ...c, [col]: e.target.checked }))}
                        className="accent-(--color-accent)"
                      />
                      {f.label}
                    </label>
                  )
                })}
              </div>
            </div>
          )}

          <Field label="Notas (opcional, no entran al modelo)">
            <TextInput value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onNavigate('dashboard')}>Cancelar</Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? 'Guardando…' : isReEdit ? 'Actualizar' : 'Guardar'}
            </Button>
          </div>
        </div>
      </Card>

      <Modal
        open={delayWarn !== null}
        title="Entrada tardía — recall bias posible"
        onClose={() => setDelayWarn(null)}
      >
        <p className="text-sm text-ink-dim">{delayWarn}.</p>
        <p className="mt-2 text-sm text-ink-dim">
          El outcome del día ya es observable, así que tus respuestas pueden estar
          contaminadas con hindsight. Responde como SI fueran las{' '}
          {String(17).padStart(2, '0')}:30 — qué habrías dicho en ese momento.
          La fila se marca <span className="font-mono text-xs">delayed=1</span> para que
          el modelo pueda filtrarla o pesarla menos.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDelayWarn(null)}>Mejor cancelo</Button>
          <Button onClick={() => void save(true)}>Entendí, continuar</Button>
        </div>
      </Modal>
    </div>
  )
}
