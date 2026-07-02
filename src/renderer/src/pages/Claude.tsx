import { useState } from 'react'
import { Card, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { PageHeader } from '../components/ui/PageHeader'
import { useToast } from '../components/ui/Toast'
import { Sparkles, FolderOpen, Download, Shield, CalendarClock, Copy } from 'lucide-react'

/**
 * Template del scheduled task de autorregulación nocturna. GENÉRICO a
 * propósito: en inglés, sin datos de nadie — lee las metas que cada usuario
 * configuró en SU app (settings.json → meet) y su propia data local. No
 * hardcodear jamás nombres, fechas ni cargas de un usuario aquí.
 */
const NIGHTLY_TASK_PROMPT = `Nightly training auto-regulation (using my GymBar data via the gym-coach skill):

1. Read my local GymBar data folder: daily_log.csv (check-ins and attendance), cache.json (Hevy workouts with sets, reps and RPE) and settings.json — the "meet" key holds MY goal: event name, date and per-lift e1RM targets in lbs. Use those values; never assume numbers.
2. If I trained today, analyze the session against my program: per-exercise load, reps and RPE. Apply my progression rules (raise load when every working set is at or below the target RPE; hold or add a rep when RPE is in range; reduce or flag a deload after two consecutive regressions on the same lift).
3. Compare my current estimated 1RMs against my configured goal and its date: say whether my current pace reaches each target, and exactly what the next session of each lift should change.
4. If routine updates are needed and I have Hevy access set up (Cowork + Chrome tool), update my Hevy routines: adjust loads/reps and rewrite each exercise note with the new prescription and the trigger for the next change. Re-read the routine after saving and verify every note matches what was prescribed — report it as "notes verified N/N".
5. End with a short report: what changed and why, my pace vs. goal, and any red flag (rising RPE, pain mentioned in notes, missed sessions this week).

Never invent data — if a file is missing or Hevy is unreachable, say so and stop.`

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

  const copyTask = async () => {
    await navigator.clipboard.writeText(NIGHTLY_TASK_PROMPT)
    push({ title: 'Prompt copiado', body: 'Pégalo en una tarea programada de Claude.', tone: 'ok' })
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
        <CardTitle>Tarea programada — autorregulación nocturna</CardTitle>
        <div className="flex items-start gap-3">
          <CalendarClock size={18} className="mt-0.5 shrink-0 text-accent" />
          <p className="text-sm leading-relaxed text-ink-dim">
            El paso siguiente a importar el skill: una tarea que corre cada noche, revisa tu sesión
            del día en Hevy, aplica tus reglas de progresión, compara tu ritmo contra el objetivo
            que configuraste en el Panel y deja tus rutinas al día. El prompt es genérico — lee
            <span className="font-mono text-xs"> settings.json → meet</span> de TU app, así cada
            usuario corre la suya con sus propias metas.
          </p>
        </div>
        <pre className="mt-3 max-h-48 select-text overflow-y-auto whitespace-pre-wrap rounded-xl border border-line/60 bg-surface/60 p-3 text-[11px] leading-relaxed text-ink-dim">
          {NIGHTLY_TASK_PROMPT}
        </pre>
        <div className="mt-3 flex items-center gap-2">
          <Button onClick={() => void copyTask()}>
            <span className="flex items-center gap-1.5">
              <Copy size={15} /> Copiar prompt
            </span>
          </Button>
          <p className="text-xs text-ink-faint">
            Pégalo en claude.ai → Tareas programadas (o <span className="font-mono">/schedule</span> en
            Claude Code) con horario nocturno, después de tu hora de entreno.
          </p>
        </div>
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
