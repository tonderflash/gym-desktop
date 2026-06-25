// UI español ↔ códigos ingleses del dataset (portado de form.py)
export const PAIN_OPTS: [string, string][] = [
  ['none', 'Ninguno'],
  ['leg', 'Pierna'],
  ['lower_back', 'Espalda baja'],
  ['shoulder', 'Hombro'],
  ['arm', 'Brazo'],
  ['other', 'Otro'],
]

export const INTENTION_OPTS: [string, string][] = [
  ['yes_now', 'Sí, voy ahora'],
  ['probably', 'Probablemente'],
  ['unsure', 'Aún no sé'],
  ['no', 'No'],
]

export const SLEEP_SOURCE_OPTS: [string, string][] = [
  ['manual', 'Manual'],
  ['tracker', 'Tracker'],
]

export const SKIP_REASON_OPTS: [string, string][] = [
  ['rest_recovery', 'Descanso por necesidad física (sore/fatigado)'],
  ['rest_choice', 'Descanso por elección (carga acumulada)'],
  ['travel', 'Viaje / evento'],
  ['work', 'Trabajo / deadline'],
  ['social', 'Social / familiar'],
  ['weather', 'Mal clima'],
  ['fatigue', 'Cansancio / sin energía'],
  ['pain', 'Dolor / lesión'],
  ['no_motivation', 'Sin motivación'],
  ['forgot', 'Olvido'],
  ['other', 'Otro'],
]

export function labelFor(opts: [string, string][], code: string | null | undefined): string {
  if (!code) return '—'
  const hit = opts.find(([c]) => c === code)
  return hit ? hit[1] : code
}
