import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { AnimatedNumber } from '../ui/AnimatedNumber'

// Mapeo de niveles a la paleta del manual: bajo = cyan (identidad, calma),
// medio = ámbar, alto = coral. El número en Nunito Black — momento de marca.
const ringColor: Record<string, string> = {
  low: 'var(--color-accent)', med: 'var(--color-warn)', high: 'var(--color-danger)',
}

const levelLabel: Record<string, string> = {
  low: 'Bajo', med: 'Medio', high: 'Alto',
}

/**
 * Riesgo de faltar HOY. El modelo predice sobre historia anterior a hoy, así
 * que su número deja de describir la realidad en cuanto entrenas: seguir
 * mostrando "90% de faltar" al lado de "entrenaste hoy" es una contradicción.
 * Con `done` el anillo pasa a resuelto y el pronóstico se degrada a nota
 * histórica — sigue visible, pero en pasado, que es lo único que ya es cierto.
 */
export function RiskGauge({
  pct, level, done = false,
}: {
  pct: number
  level: 'low' | 'med' | 'high'
  done?: boolean
}) {
  const r = 56
  const c = 2 * Math.PI * r
  const filled = done ? c : (pct / 100) * c
  const stroke = done ? 'var(--color-ok)' : ringColor[level]
  // el anillo arranca en 0 y se dibuja hasta el valor (mismo replay que los números)
  const [drawn, setDrawn] = useState(0)
  useEffect(() => {
    const id = requestAnimationFrame(() => setDrawn(filled))
    return () => cancelAnimationFrame(id)
  }, [filled])

  return (
    <div className="flex items-center gap-5">
      <div className="relative h-36 w-36">
        <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90">
          <circle cx="64" cy="64" r={r} fill="none" stroke="var(--color-panel-2)" strokeWidth="10" />
          <circle
            cx="64" cy="64" r={r} fill="none"
            stroke={stroke} strokeWidth="10" strokeLinecap="round"
            strokeDasharray={`${drawn} ${c - drawn}`}
            style={{ transition: 'stroke-dasharray .9s cubic-bezier(.2,.7,.3,1)' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {done ? (
            <>
              <Check size={38} strokeWidth={3} style={{ color: 'var(--color-ok)' }} />
              <span className="mt-1 text-[11px] text-ink-dim">hecho</span>
            </>
          ) : (
            <>
              <span className="font-display text-[34px] font-black leading-none text-ink">
                <AnimatedNumber value={pct} suffix="%" />
              </span>
              <span className="mt-1 text-[11px] text-ink-dim">de faltar</span>
            </>
          )}
        </div>
      </div>
      <div>
        <p className="text-sm text-ink-dim">
          {done ? 'Ya entrenaste hoy' : 'Riesgo de no entrenar hoy'}
        </p>
        <p
          className="font-display mt-1 text-2xl font-extrabold"
          style={{ color: done ? 'var(--color-ok)' : ringColor[level] }}
        >
          {done ? 'Resuelto' : levelLabel[level]}
        </p>
        <p className="mt-1 max-w-[200px] text-xs text-ink-faint">
          {done
            ? `El pronóstico de hoy era ${pct}% de faltar. Se resolvió a tu favor.`
            : 'Heurística v2 — se recalibra cuando haces el check-in.'}
        </p>
      </div>
    </div>
  )
}
