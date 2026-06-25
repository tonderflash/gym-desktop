import type { FeatureDescriptor } from './types'

// Auto-descubre features opcionales: cada una vive en
// `src/renderer/src/features/<nombre>/feature.tsx` y exporta `feature`.
//
// DESACOPLE TOTAL: borrar la carpeta de una feature la elimina por completo
// (nav + página). El glob deja de encontrarla; no hay que tocar este archivo,
// ni App.tsx ni el Sidebar.
const modules = import.meta.glob<{ feature?: FeatureDescriptor }>(
  './*/feature.tsx',
  { eager: true },
)

export const features: FeatureDescriptor[] = Object.values(modules)
  .map((m) => m.feature)
  .filter((f): f is FeatureDescriptor => !!f && typeof f.id === 'string')
  .sort((a, b) => a.label.localeCompare(b.label))
