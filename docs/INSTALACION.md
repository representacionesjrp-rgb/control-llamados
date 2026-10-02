# Instalación

## 1. Servidor en Railway

1. En Railway: **New Project → Deploy from GitHub repo →** elegir este repositorio. Railway usa el `Dockerfile` automáticamente.
2. En el servicio, **Settings → Volumes → Add volume** y montarlo en `/data` (ahí queda la base de datos; sin volumen se pierde en cada despliegue).
3. En **Variables** agregar:
   - `ADMIN_PASSWORD`: la contraseña con la que vas a entrar al panel.
   - `SESSION_SECRET`: un texto largo al azar (40 caracteres o más).
   - `TIMEZONE`: `America/Santiago` (opcional, es el valor por defecto).
4. En **Settings → Networking → Generate Domain**. Queda algo como `https://control-llamados.up.railway.app`.

## 2. Grabar la dirección del servidor en la app Android

En GitHub: **Settings → Secrets and variables → Actions → Variables → New repository variable**, nombre `SERVER_URL`, valor la dirección del paso anterior. Luego **Actions → App Android → Run workflow**.

Así el ejecutivo solo escribe su código. (Si no se configura, la app le pide también la dirección del servidor.)

## 3. Panel en el iPhone

1. Abrir la dirección del servidor en **Safari** e ingresar con `ADMIN_PASSWORD`.
2. Botón compartir → **Agregar a pantalla de inicio**. Queda el ícono "Llamados".
3. En **Ejecutivos** agregar a cada ejecutivo. Cada uno recibe un código de 6 letras.

## 4. App en el teléfono de cada ejecutivo

1. Descargar `control-llamados.apk` desde **Releases → android-latest** del repositorio y enviarlo al ejecutivo (WhatsApp, correo o cable).
2. En el teléfono, abrir el archivo. Android pedirá permitir "instalar apps de origen desconocido" para WhatsApp/Archivos/Chrome: aceptar.
   Si aparece Play Protect, elegir **Más detalles → Instalar de todas formas** (pasa con toda app que no viene de Play Store).
3. Abrir **Control de llamados**, escribir el código y tocar **Vincular este teléfono**.
4. Aceptar los permisos: **Registro de llamadas**, **Notificaciones** y **Permitir en segundo plano** (sin batería optimizada).
5. Listo. Aparece una notificación discreta "Control de llamados" que indica que está activo.

En teléfonos Xiaomi, Huawei, Oppo o Realme conviene además activar el **Inicio automático** de la app en Ajustes, porque esas marcas cierran apps en segundo plano con más fuerza.

Para actualizar la app basta instalar la APK nueva encima; el teléfono sigue vinculado.

## Cambiar de teléfono

En el panel, **Ejecutivos → Cambiar teléfono** genera un código nuevo. El teléfono anterior deja de enviar datos y se vincula el nuevo con ese código.

## Por qué no está en Play Store

Google solo permite leer el registro de llamadas a apps cuya función principal es ser marcador o similar, así que esta app se instala directo con la APK. Ver la [política de Google](https://support.google.com/googleplay/android-developer/answer/10208820).

## Qué no se registra

- Llamadas de WhatsApp, Teams u otras apps: Android no las guarda en el registro de llamadas.
- Llamadas hechas desde otro teléfono o desde un chip que no esté en ese equipo.

## Aviso

Usar en teléfonos de la empresa e informar por escrito a los ejecutivos que el registro de llamadas de ese equipo se envía al panel.
