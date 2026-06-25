import { useEffect, useState } from 'react'
import { Card, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { PageHeader } from '../components/ui/PageHeader'
import { Field, TextInput } from '../components/ui/Field'
import { useToast } from '../components/ui/Toast'
import { useAppState } from '../hooks/useAppState'
import { DOW_NAMES } from '@shared/schema'
import { Trash2, Plus } from 'lucide-react'
import type { SettingsView, FactorDef } from '@shared/types'

export function Settings() {
  const { push } = useToast()
  const { refresh } = useAppState()
  const [s, setS] = useState<SettingsView | null>(null)
  const [key, setKey] = useState('')
  const [testing, setTesting] = useState(false)
  const [newFactorKey, setNewFactorKey] = useState('')
  const [newFactorLabel, setNewFactorLabel] = useState('')
  const [importing, setImporting] = useState(false)

  useEffect(() => {
    void window.api.getSettings().then(setS)
  }, [])

  if (!s) return <div className="p-6 text-sm text-ink-faint">Cargando…</div>

  const saveKey = async () => {
    if (!key.trim()) return
    setTesting(true)
    try {
      const t = await window.api.testHevyKey(key.trim())
      if (!t.ok) {
        push({ title: 'Key inválida', body: t.error, tone: 'danger' })
        return
      }
      const updated = await window.api.saveSettings({ hevyKey: key.trim() })
      setS(updated)
      setKey('')
      push({ title: 'Hevy conectado', body: 'Key verificada y guardada cifrada.', tone: 'ok' })
      void refresh()
    } finally {
      setTesting(false)
    }
  }

  const toggleRestDay = async (wd: number) => {
    const next = s.restDays.includes(wd)
      ? s.restDays.filter((d) => d !== wd)
      : [...s.restDays, wd].sort()
    setS(await window.api.saveSettings({ restDays: next }))
  }

  const saveFactors = async (factors: FactorDef[]) => {
    setS(await window.api.saveSettings({ factors }))
  }

  const addFactor = async () => {
    const k = newFactorKey.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_')
    const label = newFactorLabel.trim()
    if (!k || !label) return
    if (s.factors.some((f) => f.key === k)) {
      push({ title: 'Factor duplicado', body: `Ya existe factor con key "${k}"`, tone: 'warn' })
      return
    }
    await saveFactors([...s.factors, { key: k, label }])
    setNewFactorKey('')
    setNewFactorLabel('')
  }

  const doImport = async () => {
    setImporting(true)
    try {
      const r = await window.api.importLegacy()
      if (r.ok) {
        push({ title: 'Data importada', body: `${r.imported} filas desde gym-bar`, tone: 'ok' })
        void refresh()
      } else {
        push({ title: 'No se importó', body: r.error, tone: 'warn' })
      }
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6 pt-3">
      <PageHeader title="Ajustes" subtitle="Conexiones, descansos y factores personales" />
      <Card>
        <CardTitle>Hevy</CardTitle>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-ink-dim">Estado:</span>
            {s.hevyKeyMasked
              ? <Badge tone="ok">conectado · {s.hevyKeyMasked}</Badge>
              : <Badge tone="warn">sin configurar</Badge>}
          </div>
          <Field label="API key" hint="Hevy app → Settings → Developer → API key. Se guarda cifrada en tu máquina.">
            <div className="flex gap-2">
              <TextInput
                type="password"
                placeholder="pega tu api key"
                value={key}
                onChange={(e) => setKey(e.target.value)}
              />
              <Button onClick={() => void saveKey()} disabled={testing || !key.trim()}>
                {testing ? 'Verificando…' : 'Conectar'}
              </Button>
            </div>
          </Field>
        </div>
      </Card>

      <Card>
        <CardTitle>Días de descanso planeado</CardTitle>
        <div className="flex gap-2">
          {DOW_NAMES.map((name, wd) => (
            <button
              key={wd}
              onClick={() => void toggleRestDay(wd)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                s.restDays.includes(wd)
                  ? 'bg-accent/20 text-accent'
                  : 'bg-panel-2 text-ink-faint hover:text-ink'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <CardTitle>Factores conductuales del check-in</CardTitle>
        <div className="space-y-2">
          {s.factors.map((f) => (
            <div key={f.key} className="flex items-center justify-between rounded-lg bg-panel-2 px-3 py-2">
              <div>
                <span className="text-sm text-ink">{f.label}</span>
                <span className="ml-2 font-mono text-xs text-ink-faint">factor_{f.key}</span>
              </div>
              <button
                onClick={() => void saveFactors(s.factors.filter((x) => x.key !== f.key))}
                className="text-ink-faint hover:text-danger"
                title="Quitar (la columna histórica se conserva en el CSV)"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <div className="flex gap-2 pt-1">
            <TextInput placeholder="key (ej. cafeina)" value={newFactorKey} onChange={(e) => setNewFactorKey(e.target.value)} className="w-40" />
            <TextInput placeholder="Etiqueta visible" value={newFactorLabel} onChange={(e) => setNewFactorLabel(e.target.value)} />
            <Button variant="subtle" onClick={() => void addFactor()}>
              <Plus size={15} />
            </Button>
          </div>
          <p className="text-xs text-ink-faint">
            Quitar un factor solo lo oculta del form — sus datos históricos quedan en el CSV.
          </p>
          <p className="text-xs text-ink-faint">
            Esta lista es personal y vive solo en tu máquina. La app trae defaults neutros
            (cuerpo y logística); lo que añadas — sustancias, hábitos, lo que sea — nunca
            sale de tu computadora ni viene preconfigurado para nadie más.
          </p>
        </div>
      </Card>

      <Card>
        <CardTitle>Clima (opcional)</CardTitle>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Latitud">
            <TextInput
              defaultValue={s.weatherLat ?? ''}
              onBlur={(e) => {
                const v = e.target.value.trim()
                void window.api.saveSettings({ weatherLat: v ? Number(v) : null }).then(setS)
              }}
            />
          </Field>
          <Field label="Longitud">
            <TextInput
              defaultValue={s.weatherLon ?? ''}
              onBlur={(e) => {
                const v = e.target.value.trim()
                void window.api.saveSettings({ weatherLon: v ? Number(v) : null }).then(setS)
              }}
            />
          </Field>
        </div>
        <p className="mt-2 text-xs text-ink-faint">
          Si se configura, el clima del día se congela una vez al día como feature (open-meteo, sin key).
        </p>
      </Card>

      <Card>
        <CardTitle>Datos</CardTitle>
        <div className="space-y-2 text-sm text-ink-dim">
          <p className="font-mono text-xs">{s.dataDir}</p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => void window.api.openDataFolder()}>Abrir carpeta</Button>
            {s.legacyAvailable && (
              <Button variant="subtle" onClick={() => void doImport()} disabled={importing}>
                {importing ? 'Importando…' : 'Importar data de gym-bar (Python)'}
              </Button>
            )}
          </div>
          <p className="text-xs text-ink-faint">user_id: {s.userId}</p>
        </div>
      </Card>
    </div>
  )
}
