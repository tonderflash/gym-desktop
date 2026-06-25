import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'ghost' | 'danger' | 'subtle'

// primary en LIMA con texto verde oscuro (manual: lima = energía/botones);
// ghost en cyan (manual: cyan = identidad/links). Forma pill — decisión propia.
const styles: Record<Variant, string> = {
  primary: 'bg-energy text-panel font-bold hover:brightness-105 active:brightness-95 disabled:opacity-40',
  ghost: 'border border-line text-mint hover:text-accent hover:border-accent disabled:opacity-40',
  danger: 'bg-danger text-surface font-bold hover:brightness-105 disabled:opacity-40',
  subtle: 'bg-panel-2 text-ink-dim hover:text-ink disabled:opacity-40',
}

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`rounded-full px-4 py-2 text-sm font-medium transition-all disabled:cursor-not-allowed ${styles[variant]} ${className}`}
      {...props}
    />
  )
}
