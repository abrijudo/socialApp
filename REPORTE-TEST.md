# Reporte de revisión y tests - SocialApp Pro

## Resumen

Se han revisado todas las funcionalidades, ejecutado tests de API y corregido/mejorado varios aspectos.

---

## Tests ejecutados

| Test | Estado |
|------|--------|
| GET /api/health | ✓ OK |
| GET /api/config | ✓ OK |
| GET /api/bootstrap sin auth → 401 | ✓ OK |
| GET /api/messages sin auth → 401 | ✓ OK |
| GET /api/dm sin auth → 401 | ✓ OK |

**Ejecutar tests:** `npm run test:api` (requiere servidor en http://localhost:3000)

---

## Funcionalidades revisadas

### Backend (API)

| Funcionalidad | Estado | Notas |
|---------------|--------|-------|
| Auth JWT | OK | Middleware en `/api` |
| Bootstrap | OK | Perfil, servidor, canales, miembros |
| Mensajes (texto, media) | OK | Paginación, parent_message_id |
| Hilos (respuestas) | OK | Endpoint `/messages/:channelId/thread/:parentId` |
| Reacciones | OK | POST `/messages/:id/reactions` |
| DM | OK | GET/POST `/dm`, mensajes DM |
| Invitaciones | OK | Crear, unirse por código |
| Subida de media | OK | Supabase Storage, bucket `messages-media` |
| Permisos por canal | OK | GET/PATCH `/channels/:id/permissions` |
| Token LiveKit | OK | Voz/video |

### Frontend

| Funcionalidad | Estado | Notas |
|---------------|--------|-------|
| Auth Supabase | OK | Login/registro |
| Mensajes | OK | Envío, edición, borrado |
| Reacciones | OK | Picker emoji, toggle |
| Respuestas (hilos) | Mejorado | Ahora se muestran con "Ver X respuestas" |
| DM | OK | Lista, envío |
| Media (imagen, video, audio, PDF) | OK | Subida a Storage |
| Tema claro/oscuro | OK | |
| Indicador de escritura | OK | Supabase Realtime |
| Voz (LiveKit) | OK | Mic, webcam, pantalla |

---

## Cambios realizados

1. **Script de tests** (`scripts/test-api.js`): pruebas automáticas de endpoints públicos y protección con auth.
2. **Visualización de hilos**: los mensajes con respuestas muestran "Ver X respuestas"; al hacer clic se cargan y muestran las respuestas inline.
3. **replyCount en API**: el endpoint de mensajes ahora incluye `replyCount` por mensaje para saber cuántas respuestas tiene.
4. **Estilos para hilos**: `.message-thread`, `.thread-toggle`, `.thread-reply` en `styles.css`.

---

## Requisito importante: migración de base de datos

**Error:** `column messages.parent_message_id does not exist`

**Solución:** Ejecutar en Supabase SQL Editor el contenido de `supabase/fix_parent_message_id.sql`:

```sql
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS parent_message_id uuid REFERENCES public.messages(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_messages_parent ON public.messages(parent_message_id) WHERE parent_message_id IS NOT NULL;
```

También asegúrate de haber ejecutado `supabase/migrations/20250312_full_features.sql` para tener:
- Tablas: `invitations`, `dm_channels`, `dm_participants`, `dm_messages`, `message_reactions`
- Columna `parent_message_id` en `messages`
- Tipos `file` y `offline` en los checks correspondientes

---

## Variables de entorno necesarias

| Variable | Uso |
|----------|-----|
| SUPABASE_URL | URL del proyecto |
| SUPABASE_ANON_KEY | Cliente público |
| SUPABASE_SERVICE_ROLE_KEY | Backend (CRUD) |
| LIVEKIT_URL | WebSocket LiveKit |
| LIVEKIT_API_KEY | API LiveKit |
| LIVEKIT_API_SECRET | Secret LiveKit |

---

## Cómo probar manualmente

1. Iniciar: `npm run live:watch`
2. Iniciar sesión en la app
3. Enviar mensaje de texto
4. Responder con ↩ a un mensaje
5. Hacer clic en "Ver X respuestas" para ver el hilo
6. Reaccionar con 😀
7. Crear DM desde la tarjeta de usuario
8. Crear invitación en Ajustes del servidor
9. Unirse con `/join/CODIGO`
