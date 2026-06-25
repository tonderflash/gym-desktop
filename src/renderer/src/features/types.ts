import type { ComponentType } from 'react'
import type { LucideIcon } from 'lucide-react'

/** Descriptor que cada feature exporta como `feature` desde su `feature.tsx`. */
export interface FeatureDescriptor {
  /** id único = id de página para la navegación (p.ej. 'gymvision'). */
  id: string
  label: string
  icon: LucideIcon
  Component: ComponentType
}

/** Puente genérico expuesto por el preload (infra permanente de extensiones). */
export interface ExtensionsBridge {
  invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T>
  on(channel: string, cb: (payload: unknown) => void): () => void
}

declare global {
  interface Window {
    extensions: ExtensionsBridge
  }
}
