import { useState } from 'react'
import { Card, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { PageHeader } from '../components/ui/PageHeader'
import { useToast } from '../components/ui/Toast'
import { Sparkles, FolderOpen, Download, Shield } from 'lucide-react'

export function Claude() {
  const { push } = useToast()
  const [exporting, setExporting] = useState(false)

  const doExport = async () => {
    setExporting(true)
    try {
      const r = await window.api.exportSkill()
      if (r.ok) push({ title: 'Skill exportado', body: r.path, tone: 'ok' })
      else if (r.error) push({ title: 'Error exportando', body: r.error, tone: 'danger' })
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6 pt-3">
      <PageHeader title="Claude" subtitle="Tu coach de adherencia sobre tu data local" />
      <Card>
        <CardTitle>Integración con Claude</CardTitle>
        <p className="text-sm leading-relaxed text-ink-dim">
          GymBar incluye un skill (<span className="font-mono text-xs">gym-coach</span>) que le
          enseña a Claude a leer tu dataset local, interpretar el esquema, analizar tus patrones
          de adherencia y — en Cowork — operar Hevy con la herramienta de Chrome para mantener
          tus rutinas al día y darte insights que solo un LLM puede darte.
        </p>
        <div className="mt-4 flex gap-2">
          <Button onClick={() => void doExport()} disabled={exporting}>
            <span className="flex items-center gap-1.5">
              <Download size={15} />
              {exporting ? 'Exportando…' : 'Exportar skill (.zip)'}
            </span>
          </Button>
          <Button variant="ghost" onClick={() => void window.api.openDataFolder()}>
            <span className="flex items-center gap-1.5">
              <FolderOpen size={15} />
              Abrir carpeta de datos
            </span>
          </Button>
        </div>
      </Card>

      <Card>
        <CardTitle>Cómo importarlo</CardTitle>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-ink-dim">
          <li>Exporta el skill con el botón de arriba (genera <span className="font-mono text-xs">gym-coach.zip</span>).</li>
          <li>
            En <span className="font-medium text-ink">Claude Desktop</span>: Configuración →
            Capacidades → Skills → importar el zip.
          </li>
          <li>
            En <span className="font-medium text-ink">Cowork</span>: añade el skill a tu sesión.
            Claude podrá leer tu CSV local y, con la herramienta de Chrome, hacer fetch de tu
            cuenta de Hevy para actualizar rutinas.
          </li>
          <li>
            Pídele cosas como: <span className="italic">«analiza mis últimas 4 semanas de
            adherencia»</span> o <span className="italic">«ajusta mi rutina según mi progresión»</span>.
          </li>
        </ol>
      </Card>

      <Card>
        <CardTitle>Privacidad</CardTitle>
        <div className="flex items-start gap-3">
          <Shield size={18} className="mt-0.5 shrink-0 text-ok" />
          <p className="text-sm leading-relaxed text-ink-dim">
            Tu data vive solo en tu máquina — el CSV, el cache de Hevy y tu configuración nunca
            salen de la carpeta local de la app. El skill exportado contiene instrucciones y la
            ruta de tus archivos, no tus datos. Cuando Claude lo usa, lee directo de tu disco.
            El zip incluye la ruta de TU carpeta (con tu nombre de usuario) — no lo compartas;
            cada persona exporta el suyo desde su app.
          </p>
        </div>
      </Card>

      <Card>
        <CardTitle>Qué puede hacer Claude con tu data</CardTitle>
        <ul className="space-y-1.5 text-sm text-ink-dim">
          {[
            'Detectar patrones: qué factores (sueño, alcohol, estrés) predicen tus faltas',
            'Backtesting del modelo: comparar predicted_risk vs. lo que realmente pasó',
            'Revisión semanal: adherencia, rachas, gaps y recomendaciones accionables',
            'Actualizar tus rutinas de Hevy según tu progresión real (Cowork + Chrome)',
            'Sugerir ajustes de carga respetando doble progresión y RPE',
          ].map((x) => (
            <li key={x} className="flex items-start gap-2">
              <Sparkles size={13} className="mt-1 shrink-0 text-accent" />
              {x}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
