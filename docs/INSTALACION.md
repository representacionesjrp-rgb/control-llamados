# Instalación

Todo corre en Cloudflare con el plan gratuito. Se configura una sola vez; después cada cambio se publica solo.

## 1. Cuenta de Cloudflare y clave de acceso (una vez)

1. Crear una cuenta gratis en [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up). No pide tarjeta.
2. Ir a [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens) → **Create Token** → plantilla **Edit Cloudflare Workers** → **Use template**.
3. En **Permissions** tocar **+ Add more** y agregar: **Account · D1 · Edit**.
4. **Continue to summary → Create Token** y copiar el texto que aparece (se muestra una sola vez).

## 2. Guardar dos claves en GitHub (una vez)

En el repositorio: **Settings → Secrets and variables → Actions → New repository secret**:

- `CLOUDFLARE_API_TOKEN`: el texto copiado en el paso anterior.
- `ADMIN_PASSWORD`: la contraseña con la que vas a entrar al panel.

Luego **Actions → Publicar → Run workflow**. Al terminar, el resumen muestra la dirección del panel y el link de instalación.

## 3. Panel en el iPhone

1. Abrir la dirección del panel en **Safari** e ingresar con la contraseña.
2. Botón compartir → **Agregar a pantalla de inicio**. Queda el ícono "Llamados".
3. En **Ejecutivos** agregar a cada ejecutivo y tocar **Enviar por WhatsApp**: le llega el link de instalación y su código.

## 4. Lo que hace el ejecutivo

1. Abre el link en su teléfono Android y toca **Descargar app**.
2. Abre el archivo. Si Android pregunta, permite instalar desde esa fuente. Si aparece Play Protect: **Más detalles → Instalar de todas formas**.
3. Abre **Control de llamados**, escribe su código y toca **Vincular**.
4. Acepta los permisos (registro de llamadas, notificaciones y segundo plano).

En teléfonos Xiaomi, Huawei, Oppo o Realme conviene además activar el **Inicio automático** de la app en Ajustes.

Para actualizar la app basta instalarla de nuevo desde el mismo link; el teléfono sigue vinculado.

## Cambiar de teléfono

En el panel, **Ejecutivos → Cambiar teléfono** genera un código nuevo. El teléfono anterior deja de enviar datos.

## Límites del plan gratuito

100.000 consultas al día y 5 GB de base de datos. Con 10 ejecutivos se usan unas 3.000 consultas al día, y un año de llamadas ocupa menos de 100 MB.

## Por qué no está en Play Store

Google solo permite leer el registro de llamadas a apps cuya función principal es ser marcador, así que la app se instala desde el link.

## Qué no se registra

- Llamadas de WhatsApp, Teams u otras apps: Android no las guarda en el registro de llamadas.
- Llamadas hechas desde otro teléfono.

## Aviso

Usar en teléfonos de la empresa e informar por escrito a los ejecutivos que el registro de llamadas de ese equipo se envía al panel.
