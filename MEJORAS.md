# Mejoras implementadas

## Seguridad
- **Auth JWT**: La API verifica el token de Supabase en todas las rutas protegidas.
- **Credenciales**: Supabase URL y Anon Key desde `/api/config`.
- **Token LiveKit**: Solo se emite si el usuario está autenticado.

## Nuevas funcionalidades
- **Invitaciones**: Crear enlace en Ajustes → Crear enlace. Unirse con `/join/CODIGO`.
- **Mensajes directos (DM)**: Botón "Mensaje directo" en tarjeta de usuario. Lista de DMs en sidebar.
- **Hilos**: Botón ↩ para responder. `parentMessageId` en mensajes.
- **Reacciones**: Botón 😀 para añadir reacción. Emojis: 👍 ❤️ 😂 😮 😢 🙏.
- **Indicador de escritura**: En tiempo real vía Supabase Realtime.
- **Modo claro/oscuro**, **notificaciones**, **sonido**, **markdown**, **menciones**.

## Optimizaciones
- Polling: 2.5s visible, 5s en segundo plano.
- `requestAnimationFrame` para render de mensajes.
- `content-visibility: auto` en lista de mensajes.
- Debounce 400ms para envío de typing.

## Migración
Ejecuta en Supabase SQL Editor el contenido de:
`supabase/migrations/20250312_full_features.sql`

## Variables de entorno
```
SUPABASE_ANON_KEY=tu_anon_key
```
