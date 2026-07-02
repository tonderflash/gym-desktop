import { useEffect, useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Field, TextInput } from '../ui/Field'
import type { MeetSettings } from '@shared/types'

/** Editor del widget de objetivo: nombre, fecha y metas de e1RM (lbs). */
export function MeetEditor({
  open, initial, onClose, onSaved,
}: {
  open: boolean
  initial: MeetSettings
  onClose: () => void
  onSaved: (m: MeetSettings) => void
}) {
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [weightClass, setWeightClass] = useState('')
  const [squat, setSquat] = useState('')
  const [bench, setBench] = useState('')
  const [deadlift, setDeadlift] = useState('')
  const [saving, setSaving] = useState(false)

  // repoblar cada vez que se abre (initial puede haber cambiado)
  useEffect(() => {
    if (!open) return
    setName(initial.name)
    setDate(initial.date)
    setWeightClass(initial.weightClass ?? '')
    setSquat(initial.targets.squat ? String(initial.targets.squat) : '')
    setBench(initial.targets.bench ? String(initial.targets.bench) : '')
    setDeadlift(initial.targets.deadlift ? String(initial.targets.deadlift) : '')
  }, [open, initial])

  const num = (s: string): number => {
    const v = parseInt(s, 10)
    return Number.isFinite(v) && v > 0 ? v : 0
  }

  const canSave = date.trim() !== '' && (num(squat) > 0 || num(bench) > 0 || num(deadlift) > 0)

  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      const view = await window.api.saveSettings({
        meet: {
          name: name.trim(),
          date: date.trim(),
          weightClass: weightClass.trim() || null,
          targets: { squat: num(squat), bench: num(bench), deadlift: num(deadlift) },
        },
      })
      onSaved(view.meet)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} title="Tu objetivo" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Nombre" hint="el evento o la meta: un meet, un PR test, etc.">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Copa Santo Domingo" maxLength={60} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fecha">
            <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Categoría (opcional)">
            <TextInput value={weightClass} onChange={(e) => setWeightClass(e.target.value)} placeholder="66 kg" maxLength={30} />
          </Field>
        </div>
        <div>
          <p className="mb-1.5 text-sm font-medium text-ink-dim">Metas de e1RM (lbs) — deja vacío el que no aplique</p>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Squat">
              <TextInput type="number" min={0} max={2000} value={squat} onChange={(e) => setSquat(e.target.value)} placeholder="—" />
            </Field>
            <Field label="Bench">
              <TextInput type="number" min={0} max={2000} value={bench} onChange={(e) => setBench(e.target.value)} placeholder="—" />
            </Field>
            <Field label="Deadlift">
              <TextInput type="number" min={0} max={2000} value={deadlift} onChange={(e) => setDeadlift(e.target.value)} placeholder="—" />
            </Field>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => void save()} disabled={!canSave || saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
