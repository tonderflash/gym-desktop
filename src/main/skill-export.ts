// Exporta el skill gym-coach como .zip listo para importar en Claude
// Desktop / Cowork. El skill guía a Claude a leer la data local y operar Hevy.
import { dialog, shell, app } from 'electron'
import { existsSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import AdmZip from 'adm-zip'
import { skillSourceDir, dataDir } from './env'

function addDirToZip(zip: AdmZip, dir: string, zipPrefix: string): void {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      addDirToZip(zip, full, `${zipPrefix}${name}/`)
    } else {
      zip.addLocalFile(full, zipPrefix)
    }
  }
}

export async function exportSkill(): Promise<{ ok: boolean; path?: string; error?: string }> {
  const src = join(skillSourceDir(), 'gym-coach')
  if (!existsSync(src)) return { ok: false, error: 'Skill empaquetado no encontrado' }

  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Exportar skill para Claude',
    defaultPath: join(app.getPath('downloads'), 'gym-coach.zip'),
    filters: [{ name: 'Zip', extensions: ['zip'] }],
  })
  if (canceled || !filePath) return { ok: false }

  try {
    const zip = new AdmZip()
    addDirToZip(zip, src, 'gym-coach/')
    // Incluir la ruta real de la data del usuario para que el skill la encuentre
    zip.addFile(
      'gym-coach/references/local-paths.md',
      Buffer.from(
        `# Rutas locales de este usuario\n\n` +
        `- Carpeta de datos de GymBar: \`${dataDir()}\`\n` +
        `- Dataset diario: \`${join(dataDir(), 'daily_log.csv')}\`\n` +
        `- Cache de workouts Hevy: \`${join(dataDir(), 'cache.json')}\`\n`,
        'utf-8',
      ),
    )
    zip.writeZip(filePath)
    shell.showItemInFolder(filePath)
    return { ok: true, path: filePath }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error exportando' }
  }
}
