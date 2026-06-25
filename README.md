# GymBar Desktop

App de escritorio local-first para predecir y entender la adherencia al gym.
Recolecta un check-in diario, resuelve el outcome real contra Hevy, y construye
un dataset etiquetado (`daily_log.csv`, esquema 3.2) listo para entrenar un
modelo. Incluye un skill de Claude (`gym-coach`) para análisis e insights.

**La data nunca sale de tu máquina.** La API key de Hevy se guarda cifrada
(safeStorage / Keychain).

## Desarrollo

```bash
npm install
npm run dev        # hot reload (ventana + main process)
npm run typecheck  # tsc --noEmit
npm run dist:mac   # instalador local sin publicar
```

## Flujo de releases (auto-update tipo Claude Desktop)

1. Crea el repo en GitHub y ajusta `owner/repo` en **dos sitios**:
   `electron-builder.yml` → `publish`, y `src/main/updater.ts` → `GITHUB_REPO`.
2. Sube el código. Para cada release:

```bash
npm version patch          # o minor/major — actualiza package.json y crea tag
git push --follow-tags
```

3. GitHub Actions (`.github/workflows/release.yml`) compila mac + win y publica
   los instaladores en el Release del tag.
4. Las apps instaladas chequean al arrancar y cada 4h:
   - **Firmadas**: descargan en background → toast "Reiniciar y actualizar".
   - **macOS sin firmar**: electron-updater no puede aplicar el update → la app
     degrada a un toast "vX disponible → Abrir descarga" (GitHub Releases).

> **Nota del repo**: electron-updater necesita que los *releases* sean públicos.
> Repo público = todo simple. Si quieres el código privado, mantén un segundo
> repo público solo para releases y apunta `publish` ahí.

### Firma de macOS (para auto-update silencioso)

Requiere Apple Developer Program ($99/año). En los secrets del repo:
`CSC_LINK` (cert .p12 en base64), `CSC_KEY_PASSWORD`, `APPLE_ID`,
`APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`. Descomenta esas líneas en el
workflow. Sin esto los amigos verán el warning de Gatekeeper al instalar
(click derecho → Abrir) y los updates serán con un click extra.

## Arquitectura

```
src/main/      proceso principal (Node): datos, Hevy, riesgo, scheduler, updater
  store.ts       CSV esquema 3.2 (compatible 1:1 con gym-bar Python) + backups
  logic.ts       día lógico (cutoff 4am), rotación, heuristic_v2
  pipeline.ts    fetch → resolución retroactiva → backfill → freeze riesgo/clima
  settings.ts    config + API key cifrada (safeStorage)
  updater.ts     electron-updater + fallback manual sin firma
src/preload/   contextBridge tipado (window.api)
src/renderer/  React + Tailwind: Panel / Check-in / Historial / Claude / Ajustes
src/shared/    tipos, esquema y etiquetas compartidas entre procesos
skills/        skill gym-coach empaquetado (exportable desde la UI)
```

Principios: la UI solo permite acciones válidas (poka-yoke) — skip reasons solo
para días cerrados, warning de recall bias en entradas tardías, `went=1` nunca
se degrada automáticamente.

## Seguridad y privacidad

- **Renderer aislado**: `contextIsolation` + `sandbox` + sin `nodeIntegration`;
  IPC expone funciones fijas tipadas (no canales arbitrarios); CSP estricta.
- **El proceso main no confía en el renderer**: rangos, catálogos de códigos
  (skip reasons, pain, intention) y settings se re-validan server-side.
- **Anti CSV-injection**: texto libre (notas, títulos de Hevy) se sanitiza antes
  de escribir al CSV — sin fórmulas ejecutables al abrirlo en Excel/Numbers.
- **API key de Hevy cifrada** (safeStorage/Keychain), nunca en texto plano ni
  en logs; la UI solo recibe la versión enmascarada.
- **Navegación bloqueada**: la ventana no puede salir de la app; links externos
  solo `https:` y validados (updates → solo github.com).
- **Permisos denegados**: cámara/micrófono/geolocalización rechazados a nivel
  de sesión — la app no los usa.
- **Factores conductuales**: los defaults son neutros (cuerpo/logística). Los
  factores personales que cada usuario añade viven SOLO en su `settings.json`
  local — no se preconfiguran ni viajan en el código.

## Migración desde gym-bar (Python)

En el primer arranque, si existe `~/Library/Application Support/gym-bar/`, la
app importa CSV + cache + factores automáticamente (sin tocar los originales).
También hay botón manual en Ajustes. Cuando adoptes esta app a diario, apaga el
LaunchAgent viejo: `launchctl unload ~/Library/LaunchAgents/com.israelgarcia.gymbar.plist`.
