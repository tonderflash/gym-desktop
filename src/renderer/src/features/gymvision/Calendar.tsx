import type { SessionRow } from './api'

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Calendario rodante de 30 días tipo Hevy: marca los días con sesión. Click en
 *  cualquier día → flujo de día (sesiones existentes + series de Hevy para
 *  asignar videos). */
export function Calendar({ sessions, onPickDay }: {
  sessions: SessionRow[]
  onPickDay: (date: string) => void
}) {
  const byDate = new Map<string, SessionRow[]>()
  for (const s of sessions) {
    const arr = byDate.get(s.date) ?? []
    arr.push(s)
    byDate.set(s.date, arr)
  }

  const today = new Date()
  const todayStr = ymd(today)
  const days = Array.from({ length: 30 }, (_, idx) => {
    const d = new Date(today)
    d.setDate(today.getDate() - (29 - idx))
    const ds = ymd(d)
    return {
      date: ds,
      num: d.getDate(),
      mo: d.toLocaleDateString('es', { month: 'short' }).replace('.', ''),
      first: d.getDate() === 1,
      has: byDate.get(ds) ?? [],
      isToday: ds === todayStr,
      idx,
    }
  })

  return (
    <div className="gv-cal">
      <div className="gv-cal-grid">
        {days.map((d) => (
          <button
            key={d.date}
            className={`gv-cal-day${d.has.length ? ' has' : ''}${d.isToday ? ' today' : ''}`}
            style={{ animationDelay: `${d.idx * 14}ms` }}
            onClick={() => onPickDay(d.date)}
            title={d.has.length
              ? `${d.has.length} sesión(es) · ${d.date}`
              : `Nueva entrada · ${d.date}`}
          >
            {d.has.length > 1 && <span className="gv-cbadge">{d.has.length}</span>}
            <span className="gv-cnum">{d.num}</span>
            {(d.first || d.idx === 0) && <span className="gv-cmo">{d.mo}</span>}
          </button>
        ))}
      </div>
      <div className="gv-cal-legend">
        <span><i className="has" />con sesión</span>
        <span><i className="tdy" />hoy</span>
        <span>· toca un día vacío para registrar</span>
      </div>
    </div>
  )
}
