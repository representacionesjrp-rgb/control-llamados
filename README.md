# Control de llamados

Permite revisar desde el iPhone, casi en tiempo real, las llamadas que hacen los ejecutivos comerciales desde sus teléfonos Android: cuántas llamadas hicieron hoy, cuántas les contestaron, cuántas no, los minutos hablados, las recibidas y las perdidas.

Funciona 24/7 en Cloudflare (plan gratuito), sin depender de ningún computador.

## Cómo funciona

```
Teléfono Android del ejecutivo          Cloudflare (gratis)                iPhone del jefe
┌──────────────────────────┐   HTTPS   ┌──────────────────────┐   HTTPS   ┌──────────────────┐
│ App "Control de llamados"│ ────────▶ │ API + base de datos  │ ◀──────── │ Panel web (app   │
│ envía cada llamada al    │           │ D1, panel web y      │           │ en pantalla de   │
│ terminarla               │           │ página /instalar/    │           │ inicio)          │
└──────────────────────────┘           └──────────────────────┘           └──────────────────┘
```

- **`android/`**: app nativa (Kotlin). Se vincula una sola vez con un código de 6 letras y queda funcionando en segundo plano: envía cada llamada unos segundos después de colgar, revisa cada 10 minutos y, como respaldo, cada 15 minutos aunque el sistema cierre la app. Arranca sola al reiniciar el teléfono.
- **`worker/`**: servidor en Cloudflare Workers con base de datos D1.
- **`web/`**: panel para el iPhone, y la página `/instalar/` desde donde los ejecutivos descargan la app.
- **`.github/workflows/publicar.yml`**: con cada cambio compila la app Android y publica todo en Cloudflare.

## Qué muestra el panel

- Totales del período: llamadas realizadas, contestadas, no contestadas y tiempo hablado.
- Por ejecutivo: realizadas, contestadas, no contestadas, minutos, recibidas, perdidas, números distintos, hora de la última llamada y cuándo envió datos su teléfono por última vez.
- Detalle por ejecutivo: llamadas por hora, duración promedio, tasa de contacto y lista de llamadas.
- Períodos: Hoy, Ayer, 7 días y Este mes (hora de Chile).

Una llamada saliente cuenta como "no contestada" cuando su duración es 0 segundos, que es como Android la registra.

## Puesta en marcha

Ver [docs/INSTALACION.md](docs/INSTALACION.md).

## Desarrollo

```bash
cd worker
pnpm install
printf 'ADMIN_PASSWORD=clave-de-prueba\n' > .dev.vars
npx wrangler d1 migrations apply llamados --local
pnpm dev          # http://127.0.0.1:8787
pnpm test         # con pnpm dev corriendo
```
