import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Modal en portal a <body>. El portal NO es decorativo: `.dash-stagger > *`
 * anima `transform` con fill-mode `both`, así que cada card del dashboard queda
 * como su propio contexto de apilamiento de por vida. Renderizado en el árbol,
 * el `z-50` del modal solo competía dentro de su card padre y cualquier card
 * posterior en el DOM lo tapaba y le robaba los clics — el modal quedaba
 * inalcanzable y no había forma de cerrarlo salvo reiniciar la app.
 *
 * Escape cierra por la misma razón: si algo vuelve a taparlo, siempre queda
 * salida por teclado.
 */
export function Modal({
  open, title, children, onClose,
}: {
  open: boolean
  title: string
  children: ReactNode
  onClose: () => void
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    // el fondo no debe hacer scroll bajo el modal
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="w-[440px] max-w-[90vw] rounded-2xl border border-line bg-panel p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display mb-4 text-lg font-extrabold text-ink">{title}</h2>
        {children}
      </div>
    </div>,
    document.body,
  )
}
