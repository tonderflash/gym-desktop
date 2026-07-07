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
        `- Cache de workouts Hevy: \`${join(dataDir(), 'cache.json')}\`\n` +
        `\n## Data VBT (análisis de video — velocidad de barra)\n\n` +
        `La data del VBT vive SOLO en el motor GymVision (Django local); no hay\n` +
        `copia en archivos. Consúmela en vivo por su API:\n\n` +
        `- Base: \`http://127.0.0.1:8000/api\`\n` +
        `- \`GET /api/sessions/\` — sesiones con métricas por serie y el enlace a la\n` +
        `  serie de Hevy (\`hevy.rep_match\` = reps detectadas por visión vs\n` +
        `  logueadas; \`hevy.weight_drift\` = peso desactualizado vs Hevy).\n` +
        `- \`GET /api/sessions/<id>/\` — desglose rep a rep (velocidad media/pico,\n` +
        `  pérdida %, zona, ángulos si los hay).\n` +
        `- \`GET /api/vbt/summary/\` — tendencia de velocidad, zonas y PRs (1RM est.).\n` +
        `- \`GET /api/hevy/day/<YYYY-MM-DD>/\` — lo entrenado ese día según Hevy con\n` +
        `  cada serie enlazada (o no) a su video.\n\n` +
        `Si el API no responde, pide al usuario arrancar el motor:\n` +
        `\`cd ~/Developer/gymvision && python manage.py runserver\`\n` +
        `Interpreta velocidades con el marco VBT del programa (intención máxima,\n` +
        `perfil carga-velocidad propio, ~0.24 m/s ≈ 1RM en deadlift).\n`,
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
