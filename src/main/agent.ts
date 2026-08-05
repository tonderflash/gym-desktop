// Lector de agent_insights.json — los insights que el agente (Claude en /loop)
// va escribiendo sobre la data local del usuario. Este módulo SOLO LEE: el loop
// es la única fuente que escribe el archivo. Como el archivo lo produce un
// proceso externo, todo se valida/normaliza aquí (el disco no es frontera de
// confianza) — un JSON corrupto o a medio escribir nunca debe romper el panel.
import { readFileSync, existsSync } from 'fs'
import { paths } from './env'
import type { AgentCategory, AgentInsight, AgentReport } from '@shared/types'

const CATEGORIES: AgentCategory[] = ['correlation', 'trend', 'research', 'data']
const CONFIDENCES = ['low', 'med', 'high'] as const
const TONES = ['ok', 'warn', 'info'] as const
const MAX_INSIGHTS = 40

// Quita caracteres de control (deja \n, permitido en el body multilínea).
const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g
function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.replace(CTRL, '').trim().slice(0, max) : ''
}

function optStr(v: unknown, max: number): string | undefined {
  const s = str(v, max)
  return s ? s : undefined
}

/** Solo http(s); cualquier otra cosa (javascript:, file:, …) se descarta. */
function safeUrl(v: unknown): string | undefined {
  const s = str(v, 500)
  if (!s) return undefined
  try {
    const u = new URL(s)
    return u.protocol === 'http:' || u.protocol === 'https:' ? s : undefined
  } catch {
    return undefined
  }
}

function normInsight(raw: unknown, i: number): AgentInsight | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const title = str(r.title, 140)
  const body = str(r.body, 800)
  if (!title && !body) return null // insight vacío → descartar

  const category = CATEGORIES.includes(r.category as AgentCategory)
    ? (r.category as AgentCategory)
    : 'data'
  const confidence = (CONFIDENCES as readonly string[]).includes(r.confidence as string)
    ? (r.confidence as AgentInsight['confidence'])
    : 'med'
  const tone = (TONES as readonly string[]).includes(r.tone as string)
    ? (r.tone as AgentInsight['tone'])
    : 'info'
  const p = Number(r.priority)
  const priority = Number.isFinite(p) ? Math.max(0, Math.min(100, Math.round(p))) : 50

  return {
    id: str(r.id, 64) || `a${i}`,
    createdAt: str(r.createdAt, 40),
    category,
    title: title || body.slice(0, 60),
    body,
    priority,
    confidence,
    tone,
    evidence: optStr(r.evidence, 500),
    action: optStr(r.action, 300),
    source: safeUrl(r.source),
  }
}

const EMPTY: AgentReport = {
  version: 1,
  updatedAt: null,
  nextAction: null,
  present: false,
  insights: [],
}

export function readAgentReport(): AgentReport {
  if (!existsSync(paths.agent())) return { ...EMPTY }
  try {
    const raw = JSON.parse(readFileSync(paths.agent(), 'utf-8')) as Record<string, unknown>
    const list = Array.isArray(raw.insights) ? raw.insights : []
    const insights = list
      .map((x, i) => normInsight(x, i))
      .filter((x): x is AgentInsight => x !== null)
      // orden estable: prioridad desc, y a igualdad, lo más reciente primero
      .sort((a, b) => b.priority - a.priority || b.createdAt.localeCompare(a.createdAt))
      .slice(0, MAX_INSIGHTS)
    return {
      version: Number.isFinite(Number(raw.version)) ? Number(raw.version) : 1,
      updatedAt: optStr(raw.updatedAt, 40) ?? null,
      nextAction: optStr(raw.nextAction, 300) ?? null,
      present: true,
      insights,
    }
  } catch {
    // archivo corrupto o a medio escribir por el loop → tratar como vacío
    return { ...EMPTY, present: true }
  }
}

/**
 * Historial completo desde el JSONL append-only. Una línea = un insight (o una
 * revisión). Dedup por id quedándose con la versión más reciente; ordenado por
 * fecha desc. Lo usa el modal "revisar en cualquier momento". Tolera líneas
 * corruptas (las salta) — el archivo lo escribe un proceso externo.
 */
export function readAgentArchive(limit = 300): AgentInsight[] {
  if (!existsSync(paths.agentArchive())) return []
  let text = ''
  try {
    text = readFileSync(paths.agentArchive(), 'utf-8')
  } catch {
    return []
  }
  const byId = new Map<string, AgentInsight>()
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      continue // línea a medio escribir o corrupta → saltar
    }
    const ins = normInsight(parsed, i)
    if (!ins) continue
    const prev = byId.get(ins.id)
    // quedarse con la revisión más reciente por id
    if (!prev || ins.createdAt.localeCompare(prev.createdAt) >= 0) byId.set(ins.id, ins)
  }
  return [...byId.values()]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, Math.max(1, Math.min(limit, 1000)))
}
