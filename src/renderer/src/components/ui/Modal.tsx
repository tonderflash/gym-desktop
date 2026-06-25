import type { ReactNode } from 'react'

export function Modal({
  open, title, children, onClose,
}: {
  open: boolean
  title: string
  children: ReactNode
  onClose: () => void
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-[440px] max-w-[90vw] rounded-2xl border border-line bg-panel p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display mb-4 text-lg font-extrabold text-ink">{title}</h2>
        {children}
      </div>
    </div>
  )
}
