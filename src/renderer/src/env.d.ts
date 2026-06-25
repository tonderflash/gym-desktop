/// <reference types="vite/client" />
import type { ApiSurface } from '@shared/types'

declare global {
  interface Window {
    api: ApiSurface
  }
}

export {}
