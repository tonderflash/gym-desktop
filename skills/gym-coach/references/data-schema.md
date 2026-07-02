# daily_log.csv — esquema 3.2 (diccionario de columnas)

Una fila por día lógico (cutoff 4am: un workout guardado a la 1am pertenece al
día anterior). Códigos en inglés; UI en español.

## Identidad y tiempo
| Columna | Significado |
|---|---|
| `date` | Día lógico ISO (YYYY-MM-DD). Primary key. |
| `schema_version` | Versión del esquema de la fila (3.2 actual). |
| `user_id` | UUID estable del usuario. |
| `tz_offset` | Offset horario en horas al momento del registro. |
| `saved_at` | Primera escritura de la fila (ISO local). |
| `updated_at` | Última edición. |

## Check-in (features, capturadas ~5:30pm ANTES del outcome)
| Columna | Significado |
|---|---|
| `energy` | 1-5 (1=agotado, 5=full). |
| `stress` | 1-5. |
| `pain` | `none/leg/lower_back/shoulder/arm/other`. |
| `sleep_hours` | Horas de sueño anoche (float). |
| `sleep_source` | `manual` o `tracker` (precisión distinta — el modelo puede pesarlas distinto). |
| `intention` | `yes_now/probably/unsure/no` — predicción del usuario. Predictor #1. |
| `factor_*` | 0/1 — factores conductuales de ayer/anoche. La lista es PERSONAL y configurable por usuario (defaults neutros: late_night, poor_sleep, bad_diet, sick, conflict, injury, travel; cada quien añade los suyos). Columnas pueden variar entre usuarios. Vacío = ese factor no existía ese día. Trata los factores personales con discreción: descríbelos en análisis sin juicio. |
| `notes` | Texto libre. NO es feature del modelo. |
| `checkin_delayed` | 1 = el form se llenó cuando el outcome ya era observable → recall bias posible. |
| `checkin_minutes_late` | Minutos después de la hora objetivo. |

## Outcome (target)
| Columna | Significado |
|---|---|
| `went` | 1=entrenó (verificado vs Hevy), 0=no, vacío=día aún abierto. **Monotónico: 1 nunca baja a 0 automáticamente.** |
| `skip_reason` | Solo días went=0 cerrados: `rest_recovery/rest_choice/travel/work/social/weather/fatigue/pain/no_motivation/forgot/other`. |
| `went_resolved_at` | Cuándo se resolvió el outcome. |
| `went_source` | `hevy_fetch` (verificado) o `window_closed` (cerró la ventana sin sesión). |
| `workout_title` | Título del workout en Hevy (si fue). |
| `workout_duration_min` | Duración en minutos. |
| `workout_session_type` | Tipo identificado: Squat/Bench/Deadlift/Volumen/Atlético. |

## Contexto (auto-capturado)
| Columna | Significado |
|---|---|
| `was_rest_day` | 1 = día de descanso planeado del usuario. Las faltas en días de descanso NO son faltas. |
| `wx_rain_prob` | Prob. de lluvia % (open-meteo, congelado 1×/día). |
| `wx_temp_max` | Temp. máxima del día °C. |

## Predicciones congeladas (para backtesting)
| Columna | Significado |
|---|---|
| `predicted_risk` | Riesgo BASE de faltar (0-1), congelado ANTES del check-in. Nunca se recalcula. |
| `predicted_risk_post` | Riesgo recalculado al guardar el check-in (1ra vez). |
| `risk_model_version` | `heuristic_v1/v2` — para comparar modelos entre sí. |

## Otros archivos del data folder

- `cache.json` — workouts crudos de Hevy (últimos ~50) con `exercises[].sets[]`
  completos: `weight_kg`, `reps`, `rpe`, `type` (`warmup` se excluye del
  análisis). Es la fuente para e1RM, tonelaje y volumen por grupo muscular.
- `settings.json` → clave `meet` — el OBJETIVO del usuario (personal,
  configurado en la app): `{ name, date (ISO), weightClass, targets: { squat,
  bench, deadlift } }` con e1RM objetivo en LBS (0 = ese lift no tiene meta).
  Úsalo como referencia de ritmo/progresión; si está vacío, el usuario aún no
  configuró objetivo — no inventes uno.
- `settings.json` → `dashboardWidgets` — solo presentación, ignóralo.

## Trampas conocidas
- Filas creadas por backfill tienen `went` pero features vacías — son válidas
  (días sin check-in), no las descartes del cálculo de adherencia.
- `cache.json` tiene historia de Hevy ANTERIOR al primer check-in: úsala para
  derivar features rolling (gaps, frecuencia) pero esos días no están en el CSV.
- Con n<30, reporta direcciones, no "correlaciones significativas".
