// Schema 3.2 — idéntico al daily_log.csv del gym-bar Python.
// El CSV es el contrato del dataset: códigos en inglés, UI en español.
export const SCHEMA_VERSION = '3.2'
export const RISK_MODEL_NAME = 'heuristic_v2'

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
