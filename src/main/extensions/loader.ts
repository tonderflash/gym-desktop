// Auto-descubrimiento de extensiones del proceso main. Cada extensión vive en
// `src/main/extensions/<nombre>/index.ts` y exporta `register()`, donde registra
// sus handlers IPC (canales con prefijo `ext:<nombre>:...`).
//
// DESACOPLE TOTAL: para desactivar una extensión basta con BORRAR su carpeta —
// el glob deja de encontrarla y no queda ninguna referencia. No hay que editar
// este archivo ni ningún otro.

type ExtModule = { register?: () => void }

export function registerExtensions(): void {
  const modules = import.meta.glob<ExtModule>('./*/index.ts', { eager: true })
  for (const [path, mod] of Object.entries(modules)) {
    try {
      mod.register?.()
    } catch (err) {
      console.error(`[extensions] fallo al registrar ${path}:`, err)
    }
  }
}
