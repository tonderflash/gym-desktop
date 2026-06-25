// Mapeo de niveles a la paleta del manual: bajo = cyan (identidad, calma),
// medio = ámbar, alto = coral. El número en Nunito Black — momento de marca.
const ringColor: Record<string, string> = {
  low: 'var(--color-accent)', med: 'var(--color-warn)', high: 'var(--color-danger)',
}

const levelLabel: Record<string, string> = {
  low: 'Bajo', med: 'Medio', high: 'Alto',
}

export function RiskGauge({ pct, level }: { pct: number; level: 'low' | 'med' | 'high' }) {
  const r = 56
  const c = 2 * Math.PI * r
  const filled = (pct / 100) * c

  return (
    <div className="flex items-center gap-5">
      <div className="relative h-36 w-36">
        <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90">
          <circle cx="64" cy="64" r={r} fill="none" stroke="var(--color-panel-2)" strokeWidth="10" />
          <circle
            cx="64" cy="64" r={r} fill="none"
            stroke={ringColor[level]} strokeWidth="10" strokeLinecap="round"
            strokeDasharray={`${filled} ${c - filled}`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-[34px] font-black leading-none text-ink">{pct}%</span>
          <span className="mt-1 text-[11px] text-ink-dim">de faltar</span>
        </div>
      </div>
      <div>
        <p className="text-sm text-ink-dim">Riesgo de no entrenar hoy</p>
        <p className="font-display mt-1 text-2xl font-extrabold" style={{ color: ringColor[level] }}>
          {levelLabel[level]}
        </p>
        <p className="mt-1 max-w-[200px] text-xs text-ink-faint">
          Heurística v2 — se recalibra cuando haces el check-in.
        </p>
      </div>
    </div>
  )
}
