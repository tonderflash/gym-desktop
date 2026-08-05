# Agent loop — cómo el agente alimenta el card "Agent"

El card **Agent** del dashboard es una vista de solo-lectura de un archivo que
un agente (Claude en `/loop`) va escribiendo. La app **solo lee**
`agent_insights.json`; este documento es el contrato que el loop debe seguir en
cada ciclo. El agente siempre tiene algo que hacer: si no hay data nueva, busca
tendencias o research externo.

## Dónde vive todo (local, privado)

Carpeta de datos (macOS): `~/Library/Application Support/GymBar/`

| Archivo | Qué es |
|---|---|
| `daily_log.csv` | Check-in diario + outcome real (`went`). Esquema en `skills/gym-coach/references/data-schema.md`. |
| `cache.json` | Workouts de Hevy con `exercises[].sets[]` (weight_kg, reps, rpe). Fuente de e1RM/volumen. |
| `settings.json` | Clave `meet` = objetivo del usuario. **Nunca leas `hevyKeyEncrypted`/`hevyKeyPlain`.** |
| `agent_insights.json` | **Set ACTIVO curado** que escribe el loop. El card lo lee y ordena por `priority`. Se reescribe cada ciclo, tope ~40. |
| `agent_insights_archive.jsonl` | **Historial completo append-only.** Un insight (o revisión) por línea. NUNCA se reescribe: solo se le agregan líneas. El modal "revisar" lo lee. |
| GymVision API (`http://127.0.0.1:8000/api`) | VBT en vivo (velocidad, cargas de deadlift). Opcional: si está offline, sáltalo. |

## Esquema de `agent_insights.json`

```json
{
  "version": 1,
  "updatedAt": "ISO con offset",
  "nextAction": "una frase: qué vas a investigar en el próximo ciclo",
  "insights": [
    {
      "id": "kebab-estable",         // estable: si refinas el mismo hallazgo, reusa el id
      "createdAt": "ISO",
      "category": "correlation|trend|research|data",
      "title": "afirmación corta y concreta",
      "body": "el hallazgo, anclado a números y fechas reales",
      "priority": 0-100,              // el card ordena desc; sube lo accionable/urgente
      "confidence": "low|med|high",   // low si n<30 o señal ruidosa
      "tone": "ok|warn|info",
      "evidence": "los números/fechas que lo sostienen",
      "action": "siguiente paso accionable (opcional)",
      "source": "https://… (SOLO en research)"
    }
  ]
}
```

## Loop de operación (un ciclo)

1. **Lee el estado**: `agent_insights.json` actual + los archivos de data. Mira
   `fetched_at`/fechas para saber si hay algo nuevo desde el último ciclo.
2. **Elige UNA acción** según este criterio (en orden de preferencia):
   - **`data` / `correlation`** si hay un check-in o workout nuevo sin analizar,
     o una correlación que aún no exploraste (sueño↔asistencia, RPE↔carga,
     día-de-semana↔went, dolor↔lift).
   - **`trend`** si no hay data nueva pero una serie se movió (e1RM por lift,
     tonelaje semanal, ritmo vs meta, deriva de RPE).
   - **`research`** si la data está estable: busca en internet algo accionable
     para SU situación concreta (su lift estancado, su lesión, su fase). Cita la
     fuente en `source`.
3. **Escribe UN insight** (o refina uno existente reusando su `id`). Regla de
   oro: cada afirmación anclada a números/fechas reales del usuario. Nunca
   inventes data; si un archivo falta o el motor VBT está offline, dilo y salta.
4. **Reordena** el set activo: recalcula `priority` de todos (lo accionable y
   urgente arriba; lo positivo/informativo abajo). Dedupe por `id`. Cap ~40 en
   el ACTIVO: si sobran, saca del activo los de menor prioridad y más viejos —
   **pero nunca los borres del archivo** (siguen en el JSONL).
5. **Escribe los dos archivos:**
   - **Archivo (append-only):** por cada insight nuevo o refinado este ciclo,
     agrega UNA línea JSON al final de `agent_insights_archive.jsonl`. Nunca lo
     reescribas ni reordenes — solo append. Así se mantienen TODOS sin inflar el
     activo.
   - **Activo (curado):** reescribe `agent_insights.json` completo y de forma
     atómica (write a `.tmp` + rename) con el set curado (≤40), su `updatedAt` y
     el `nextAction` (qué harás el próximo ciclo).
   Regla de oro del ritmo: si es un latido sin data nueva y el activo tiene <4h,
   **no inventes un insight solo por escribir** — refina/re-puntúa o no toques
   nada. El valor está en la señal, no en el volumen.

## Guardrails

- **No inventes.** Con `n<30` reporta direcciones, no "correlaciones
  significativas". Cita fechas concretas.
- **Factores personales con discreción** (ej. `factor_weed`): descríbelos sin
  juicio; si un factor es constante, dilo (no se puede correlacionar).
- **El deadlift es el lift de mayor retorno**; ante la duda, priorízalo.
- **La Copa es opcional** (se decide en septiembre): enmarca las metas como
  termómetro, no como presión.
- **Nunca** toques ni muestres la API key de Hevy.
- El card degrada solo: un JSON corrupto o vacío no rompe el panel.
