// Schema 3.2 — idéntico al daily_log.csv del gym-bar Python.
// El CSV es el contrato del dataset: códigos en inglés, UI en español.
export const SCHEMA_VERSION = '3.2'
export const RISK_MODEL_NAME = 'heuristic_v3'

export const LOGICAL_DAY_CUTOFF_HOUR = 4
/**
 * @deprecated Asunción rota: marcaba el día como cerrado a las 22:00, pero
 * Israel entrena 22:00–01:00. dayIsClosed() ahora depende solo de logicalToday()
 * y computeDelay() depende solo de Hevy. Se conserva la constante para no
 * romper exports externos. NO la uses en lógica nueva.
 */
export const GYM_WINDOW_END_HOUR = 22
export const DEFAULT_REMINDER = { hour: 17, minute: 30 }

export const FIXED_PRE = [
  'date', 'energy', 'stress', 'pain', 'sleep_hours', 'sleep_source', 'intention',
] as const

export const FIXED_POST = [
  'notes', 'went', 'skip_reason',
  'went_resolved_at', 'went_source',
  'workout_title', 'workout_duration_min', 'workout_session_type',
  'was_rest_day', 'wx_rain_prob', 'wx_temp_max',
  'checkin_delayed', 'checkin_minutes_late',
  'predicted_risk', 'predicted_risk_post', 'risk_model_version',
  'schema_version', 'user_id', 'tz_offset', 'saved_at', 'updated_at',
] as const

// Defaults NEUTRALES a propósito: solo cuerpo y logística, nada de consumo de
// sustancias ni hábitos personales. Cada usuario añade los suyos en Ajustes —
// esa lista vive solo en su máquina (settings.json), nunca en el código.
export const DEFAULT_FACTORS = [
  { key: 'late_night', label: 'Trasnoche / dormí tarde' },
  { key: 'poor_sleep', label: 'Sueño de mala calidad' },
  { key: 'bad_diet', label: 'Mala alimentación' },
  { key: 'sick', label: 'Enfermo / síntomas' },
  { key: 'conflict', label: 'Conflicto / estrés agudo' },
  { key: 'injury', label: 'Lesión / dolor nuevo' },
  { key: 'travel', label: 'Viaje / fuera de rutina' },
]

export const DEFAULT_REST_DAYS = [2, 6] // miércoles y domingo

export const TRAINING_ROTATION = ['Squat', 'Bench', 'Deadlift', 'Volumen', 'Atlético']

export const SESSION_KEYWORDS: Record<string, string[]> = {
  Squat: ['squat', 'lower fuerza'],
  Bench: ['bench', 'upper fuerza'],
  Deadlift: ['deadlift', 'lower potencia', 'pull'],
  Volumen: ['volumen', 'upper volumen'],
  'Atlético': ['atlético', 'atletico', 'gpp', 'sábado'],
}

export const DOW_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

/**
 * Pesos de heuristic_v3 — riesgo de NO entrenar hoy, en LOG-ODDS.
 *
 * v2 sumaba contribuciones directamente en probabilidad y su término dominante
 * era el gap (peso 0.65, rampa monótona creciente desde el día 0). Eso hacía
 * que el modelo estuviera invertido dentro del régimen activo: el día después
 * de entrenar predecía 0.13 cuando la tasa real de NO ir era 0.60, y a 2–3 días
 * de gap predecía alto justo en los días que Israel sí entrena. El gap corto no
 * es señal de abandono: es la rotación funcionando.
 *
 * v3 reasigna el peso a lo que los datos sí soportan (161 días de historial,
 * ajuste logístico + selección de features por walk-forward):
 *   - REST_DAY: el día de descanso configurado es el predictor más fuerte
 *     (0.92 de tasa real de no-ir vs 0.57 el resto). v2 lo ignoraba por completo.
 *   - WEEK_LOAD: sesiones ya hechas esta semana / largo de la rotación. Cuota
 *     cumplida ⇒ más probable descansar. v2 le daba 0.08 y solo si gap ≥ 2.
 *   - LAPSE: rampa que arranca recién a los LAPSE_FREE_DAYS días. Solo entonces
 *     el gap deja de ser recuperación y pasa a ser abandono real.
 *
 * Un cuarto candidato (`momentum`, entrenó ayer) no mejoró el Brier
 * walk-forward y se descartó — no todo lo que suena razonable aporta señal.
 *
 * Constantes calibradas sobre el historial del usuario; `risk_model_version` en
 * el CSV mantiene atribuibles las filas escritas por versiones anteriores.
 */
export const RISK_WEIGHTS = {
  /** Intercepto: log-odds de no entrenar un día laboral con la semana en 0. */
  BASE: -0.05,
  /** Día de descanso configurado (settings.restDays). */
  REST_DAY: 1.25,
  /** Carga semanal ya cumplida, normalizada por el largo de la rotación. */
  WEEK_LOAD: 1.6,
  /** Abandono real, una vez pasada la ventana de recuperación. */
  LAPSE: 3.05,
} as const

/** Días de gap que se consideran recuperación normal antes de contar abandono. */
export const LAPSE_FREE_DAYS = 4
/** Días sobre LAPSE_FREE_DAYS en los que la rampa de abandono llega a 1. */
export const LAPSE_SPAN = 10

/**
 * Ajustes del check-in, también en log-odds. NO están ajustados con datos: al
 * momento de escribir esto solo hay ~10 días con check-in, muy poco para
 * estimar nada. Son priors con el orden y el signo que los datos disponibles sí
 * confirman (yes_now ⇒ fue, no ⇒ no fue). Revisar cuando haya ≥60 check-ins.
 */
export const RISK_CHECKIN_WEIGHTS = {
  INTENTION: { yes_now: -1.2, probably: -0.4, unsure: 0.6, no: 2.0 } as Record<string, number>,
  ENERGY_LOW: 0.4,
  ENERGY_HIGH: -0.3,
  SLEEP_SHORT: 0.35,
  SLEEP_LONG: -0.15,
  SICK_OR_INJURY: 0.6,
  ALCOHOL_OR_LATE: 0.25,
} as const

/** Riesgo mínimo/máximo reportado — nunca 0 ni 1 absolutos. */
export const RISK_CLAMP = { MIN: 0.04, MAX: 0.96 } as const
