import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

// El fetch global del proceso main es el de Node/undici, que NO consulta el
// almacén de certificados ni el proxy del sistema en Windows. Eso rompió el
// fetch de entrenamientos para usuarios de Windows detrás de antivirus con
// inspección TLS (Kaspersky, ESET, Zscaler...) — ver hevy.ts. La regla: todo
// request HTTP(S) en el proceso main pasa por `net.fetch` de Electron (usa
// el stack de Chromium), nunca el `fetch` global. Este test evita que
// vuelva a colarse un `fetch(` suelto.
const MAIN_DIR = join(__dirname) // src/main

function tsFilesRecursive(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...tsFilesRecursive(full))
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) out.push(full)
  }
  return out
}

describe('proceso main: sin fetch() global', () => {
  it('todas las llamadas HTTP usan net.fetch, no el fetch de Node', () => {
    const offenders: string[] = []
    for (const file of tsFilesRecursive(MAIN_DIR)) {
      const src = readFileSync(file, 'utf-8')
      // bare `fetch(` no precedido por un carácter de identificador o un punto
      // (así no marca `net.fetch(` ni `someFetch(`)
      const re = /(?<![.\w])fetch\(/g
      if (re.test(src)) offenders.push(file)
    }
    expect(offenders).toEqual([])
  })
})
