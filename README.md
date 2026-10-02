# Control de llamados

Permite revisar desde el iPhone, casi en tiempo real, las llamadas que hacen los ejecutivos comerciales desde sus teléfonos Android: cuántas llamadas hicieron hoy, cuántas les contestaron, cuántas no, los minutos hablados, las recibidas y las perdidas.

## Cómo funciona

```
Teléfono Android del ejecutivo          Servidor (Railway)                 iPhone del jefe
┌──────────────────────────┐   HTTPS   ┌──────────────────────┐   HTTPS   ┌──────────────────┐
│ App "Control de llamados"│ ────────▶ │ API + base de datos  │ ◀──────── │ Panel web (app   │
│ lee el registro de       │           │ (SQLite en volumen)  │           │ en pantalla de   │
│ llamadas y lo envía al   │           │ sirve también el     │           │ inicio, se       │
│ terminar cada llamada    │           │ panel web            │           │ actualiza c/30 s)│
└──────────────────────────┘           └──────────────────────┘           └──────────────────┘
```

- **`android/`**: app nativa (Kotlin). Se vincula una sola vez con un código de 6 letras. Queda funcionando en segundo plano: envía cada llamada unos segundos después de colgar, revisa cada 10 minutos y, como respaldo, cada 15 minutos aunque el sistema cierre la app. Arranca sola al reiniciar el teléfono.
- **`server/`**: servicio Node/Express con base SQLite. Guarda las llamadas y sirve el panel.
- **`server/public/`**: panel web pensado para iPhone. Se agrega a la pantalla de inicio desde Safari y queda como una app (sin App Store).

## Qué muestra el panel

- Totales del período: llamadas realizadas, contestadas, no contestadas y tiempo hablado.
- Por ejecutivo: realizadas, contestadas, no contestadas, minutos, recibidas, perdidas, números distintos, hora de la última llamada y cuándo envió datos su teléfono por última vez.
- Detalle por ejecutivo: llamadas por hora, duración promedio, tasa de contacto y la lista de llamadas con número o nombre del contacto.
- Períodos: Hoy, Ayer, 7 días y Este mes (hora de Chile).

Una llamada saliente cuenta como "no contestada" cuando su duración es 0 segundos, que es como Android la registra.

## Puesta en marcha

Ver [docs/INSTALACION.md](docs/INSTALACION.md).

## Desarrollo

```bash
cd server
cp .env.example .env
pnpm install
pnpm dev        # http://localhost:4200
pnpm test
```

La APK se compila en GitHub Actions (`.github/workflows/android.yml`) y queda publicada en Releases como `android-latest`.
