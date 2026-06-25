import type { ReactNode } from 'react'

/** Encabezado de página — Nunito ExtraBold, escala H1 del manual. */
export function PageHeader({
  title, subtitle, action,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <header className="mb-5 flex items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-[26px] font-extrabold leading-tight tracking-tight text-ink">
          {title}
        </h1>
        {subtitle && <p className="mt-0.5 text-sm text-ink-dim">{subtitle}</p>}
      </div>
      {action}
    </header>
  )
}
