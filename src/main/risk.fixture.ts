/**
 * Historial de asistencia real (fechas lógicas de sesiones de Hevy), congelado
 * como fixture para que el backtest del modelo de riesgo sea reproducible y no
 * dependa del cache vivo de la máquina.
 *
 * Origen: cache.json del usuario, 36 sesiones entre 2026-01-09 y 2026-06-18.
 * La ventana incluye a propósito el layoff de feb–abr: un modelo de riesgo que
 * solo funciona mientras entrenas seguido no sirve de nada.
 */
export const ATTENDANCE_FIXTURE: readonly string[] = [
  '2026-01-09', '2026-01-10', '2026-01-12', '2026-01-14', '2026-01-16', '2026-01-19',
  '2026-01-20', '2026-01-22', '2026-01-26', '2026-01-27', '2026-01-29', '2026-02-10',
  '2026-04-23', '2026-04-24', '2026-04-28', '2026-04-29', '2026-05-01', '2026-05-05',
  '2026-05-06', '2026-05-10', '2026-05-11', '2026-05-13', '2026-05-14', '2026-05-18',
  '2026-05-27', '2026-05-28', '2026-06-01', '2026-06-02', '2026-06-03', '2026-06-09',
  '2026-06-11', '2026-06-12', '2026-06-13', '2026-06-15', '2026-06-17', '2026-06-18',
]

/** settings.restDays del usuario cuando se calibró el modelo (0 = lunes). */
export const FIXTURE_REST_DAYS = [6]
