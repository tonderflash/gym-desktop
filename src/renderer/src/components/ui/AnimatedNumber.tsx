import { useEffect, useRef, useState } from 'react'

/**
 * Número que "suma puntos": al montar cuenta de 0 → valor, y cuando el valor
 * cambia (refresh de estado) anima del valor anterior al nuevo mostrando un
 * chip flotante con el delta. El Dashboard remonta sus cards al enfocar la
 * ventana, así que abrir la app siempre replay-ea el count-up.
 */
export function AnimatedNumber({
  value,
  decimals = 0,
  duration = 900,
  className = '',
  prefix = '',
  suffix = '',
  showDelta = false,
}: {
  value: number
  decimals?: number
  duration?: number
  className?: string
  prefix?: string
  suffix?: string
  showDelta?: boolean
}) {
  const [disp, setDisp] = useState(0)
  const [delta, setDelta] = useState<number | null>(null)
  const fromRef = useRef(0)
  const prevValue = useRef<number | null>(null)
  const rafRef = useRef(0)

  useEffect(() => {
    if (showDelta && prevValue.current !== null && value !== prevValue.current) {
      setDelta(value - prevValue.current)
      const id = setTimeout(() => setDelta(null), 2000)
      prevValue.current = value
      return () => clearTimeout(id)
    }
    prevValue.current = value
    return undefined
  }, [value, showDelta])

  useEffect(() => {
    const from = fromRef.current
    const t0 = performance.now()
    cancelAnimationFrame(rafRef.current)
    const step = (t: number): void => {
      const p = Math.min(1, (t - t0) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      const v = from + (value - from) * eased
      fromRef.current = v
      setDisp(v)
      if (p < 1) rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafRef.current)
  }, [value, duration])

  return (
    <span className={`relative inline-block ${className}`}>
      {prefix}
      {disp.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      {suffix}
      {delta !== null && delta !== 0 && (
        <span
          className={`delta-pop absolute -top-4 right-0 font-display text-xs font-extrabold ${delta > 0 ? 'text-energy' : 'text-danger'}`}
        >
          {delta > 0 ? '+' : ''}
          {delta.toLocaleString('en-US', { maximumFractionDigits: decimals })}
        </span>
      )}
    </span>
  )
}
