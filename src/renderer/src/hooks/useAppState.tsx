import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import type { AppState } from '@shared/types'

interface Ctx {
  state: AppState | null
  refreshing: boolean
  refresh: () => Promise<void>
}

const AppStateCtx = createContext<Ctx>({ state: null, refreshing: false, refresh: async () => {} })

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    void window.api.getState().then(setState)
    return window.api.onStateUpdate(setState)
  }, [])

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      setState(await window.api.refresh())
    } finally {
      setRefreshing(false)
    }
  }, [])

  return (
    <AppStateCtx.Provider value={{ state, refreshing, refresh }}>
      {children}
    </AppStateCtx.Provider>
  )
}

export function useAppState(): Ctx {
  return useContext(AppStateCtx)
}
