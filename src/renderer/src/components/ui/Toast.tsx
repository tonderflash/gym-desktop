import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { X } from 'lucide-react'

export interface ToastItem {
  id: number
  title: string
  body?: string
  tone?: 'ok' | 'warn' | 'danger' | 'info'
  action?: { label: string; onClick: () => void }
  sticky?: boolean
}

interface ToastCtx {
  push: (t: Omit<ToastItem, 'id'>) => void
}

const Ctx = createContext<ToastCtx>({ push: () => {} })

const toneBar: Record<string, string> = {
  ok: 'bg-ok', warn: 'bg-warn', danger: 'bg-danger', info: 'bg-accent',
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])

  const dismiss = useCallback((id: number) => {
    setItems((xs) => xs.filter((x) => x.id !== id))
  }, [])

  const push = useCallback((t: Omit<ToastItem, 'id'>) => {
    const id = Date.now() + Math.random()
    setItems((xs) => [...xs.slice(-3), { ...t, id }])
    if (!t.sticky) setTimeout(() => dismiss(id), 6000)
  }, [dismiss])

  return (
    <Ctx.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
        {items.map((t) => (
          <div key={t.id} className="overflow-hidden rounded-lg border border-line bg-panel-2 shadow-xl">
            <div className="flex">
              <div className={`w-1 shrink-0 ${toneBar[t.tone ?? 'info']}`} />
              <div className="flex-1 px-3 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-ink">{t.title}</p>
                  {!t.sticky && (
                    <button onClick={() => dismiss(t.id)} className="text-ink-faint hover:text-ink">
                      <X size={14} />
                    </button>
                  )}
                </div>
                {t.body && <p className="mt-0.5 text-xs text-ink-dim">{t.body}</p>}
                {t.action && (
                  <button
                    onClick={() => { t.action!.onClick(); dismiss(t.id) }}
                    className="mt-2 rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white hover:opacity-90"
                  >
                    {t.action.label}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

export function useToast(): ToastCtx {
  return useContext(Ctx)
}
