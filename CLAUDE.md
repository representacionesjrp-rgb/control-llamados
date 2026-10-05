# Control de llamados

App para que Jonathan (dueño, escribe en español, no es programador) controle desde su iPhone las llamadas que hacen sus ejecutivos comerciales desde teléfonos Android. Responder siempre en español y con pasos simples.

## Requisitos del dueño (no cambiar sin preguntarle)

- **Costo cero**: todo en planes gratuitos (Cloudflare Workers + D1, GitHub Actions). No proponer servicios pagados.
- **Instalación con un solo link**: el ejecutivo recibe por WhatsApp el link `/instalar/` y un código de 6 letras.
- **24/7 en la nube**: nada depende de un computador local.
- No se publica en Play Store (Google restringe `READ_CALL_LOG`); la APK se descarga desde el propio servidor.

## En producción

- Panel: https://control-llamados.representacionesjrp.workers.dev
- Link de instalación para ejecutivos: https://control-llamados.representacionesjrp.workers.dev/instalar/
- Cuenta Cloudflare de Jonathan (plan gratis), worker `control-llamados`, base D1 `llamados`.

## Estructura

- `android/`: app nativa Kotlin (sin Compose, interfaz armada en código en `MainActivity.kt`).
  - `CallSyncService`: servicio en primer plano (`specialUse`) con `ContentObserver` sobre `CallLog.Calls`; envía cada llamada ~4 s después de colgar y revisa cada 10 min.
  - `SyncWorker`: respaldo con WorkManager cada 15 min. `BootReceiver` lo reinicia al encender.
  - `Sync.kt`: lee el registro desde la última llamada enviada menos 3 h (el servidor hace upsert, reenviar es seguro). Al vincular (o al actualizar desde una versión vieja) envía una vez los últimos 120 días (`historyDaysSent`).
  - `minSdk = 23` (Android 6.0) para teléfonos antiguos como el ZTE Blade A602; el código que usa APIs nuevas va protegido con `Build.VERSION.SDK_INT`. Íconos PNG en `mipmap-*dpi` para Android < 8. `OldAndroidTls.kt` agrega las raíces de Let's Encrypt (ISRG X1/X2) solo en Android < 7.1.1, que no las trae y no podría conectarse a workers.dev.
  - Firmada con `android/app/llamados.keystore` (en el repo a propósito, para que cada versión se instale encima). No cambiar la clave o los teléfonos tendrán que desinstalar.
  - La dirección del servidor se graba al compilar (`SERVER_URL` o `serverUrl` en `gradle.properties`).
- `worker/`: API en Cloudflare Workers + base D1 (`migrations/`). Sin framework; rutas en `src/index.ts`.
  - D1 gratis: máximo 50 consultas por petición y 100 parámetros por consulta. Por eso las llamadas se insertan con un solo `INSERT ... SELECT FROM json_each(?)`.
  - Secret `ADMIN_PASSWORD`; `SESSION_SECRET` opcional (si falta se deriva de la contraseña).
  - Zona horaria del negocio: `TIMEZONE` = `America/Santiago` (`src/time.ts`).
- `web/`: panel (HTML/JS/CSS sin compilación) servido como assets del worker. `web/instalar/` es la página de descarga; la APK se copia a `web/descargas/` durante la publicación (no se versiona).
- `.github/workflows/publicar.yml`: en cada push a `main` compila la APK y publica worker + panel + APK en Cloudflare. Crea la base D1 y el subdominio workers.dev si no existen. Necesita los secrets del repo `CLOUDFLARE_API_TOKEN` y `ADMIN_PASSWORD`.

## API

- `POST /api/login` `{password}` → token de administrador.
- `GET /api/admin/summary?from=YYYY-MM-DD&to=YYYY-MM-DD`, `GET /api/admin/executives`, `POST /api/admin/executives` `{name}`, `POST /api/admin/executives/:id/pair-code`, `DELETE /api/admin/executives/:id`, `GET /api/admin/executives/:id/calls`, `GET /api/admin/calls?exec=&type=out|noans|in|missed&limit=` (todas, con nombre del ejecutivo y totales; límite por defecto 2000, máximo 50000 para el Excel).
- Las llamadas se guardan sin límite de tiempo; el panel permite elegir cualquier mes de los últimos 12 o un rango de fechas ("Otro período").
- `POST /api/device/pair` `{code, deviceModel}` → token del teléfono. `POST /api/device/calls` `{calls:[{deviceCallId, number, contactName, type, startedAt, durationSec}]}`.
- "No contestada" = llamada saliente con duración 0.

## Trabajar en el proyecto

```bash
cd worker
pnpm install
printf 'ADMIN_PASSWORD=clave-de-prueba\n' > .dev.vars
npx wrangler d1 migrations apply llamados --local
pnpm dev                 # http://127.0.0.1:8787 (panel en /, instalación en /instalar/)
pnpm test                # pruebas de la API, con pnpm dev corriendo
pnpm typecheck
```

La app Android se compila con `cd android && ./gradlew assembleRelease` (requiere Android SDK; si no está disponible, se compila en GitHub Actions al hacer push).

Para publicar basta hacer push a `main`; no hace falta ningún comando local. Cambios de base de datos: agregar un archivo nuevo en `worker/migrations/` (nunca editar uno ya publicado).

Guía para el dueño: `docs/INSTALACION.md`.
