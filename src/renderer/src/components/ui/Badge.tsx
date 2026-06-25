import type { ReactNode } from 'react'

// Tags estilo manual: menta sobre oscuro / rellenos suaves, forma pill
const tones: Record<string, string> = {
  ok: 'bg-ok/15 text-ok',
  warn: 'bg-warn/15 text-warn',
  danger: 'bg-danger/15 text-danger',
  neutral: 'bg-panel-2 text-ink-dim',
  accent: 'bg-accent/15 text-accent',
  mint: 'bg-mint/15 text-mint',
  energy: 'bg-energy/15 text-energy',
}

export function Badge({ tone = 'neutral', children }: { tone?: keyof typeof tones; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}>
      {children}
    </span>
  )
}
