# SocialApp Pro — Base profesional (Fase 1)

Aplicación estilo Discord con arquitectura separada `frontend/backend`, perfiles personalizables, canales dinámicos de texto/voz y voz en tiempo real con LiveKit.

## Stack

- **Frontend SPA:** HTML/CSS/JS modular en `frontend/`
- **Backend API:** Express + Zod en `backend/`
- **Realtime y persistencia:** Supabase
- **Media:** LiveKit (voz, webcam, compartir pantalla)

## Requisitos

- Node.js 20+
- Proyecto Supabase
- Proyecto LiveKit Cloud

## Variables de entorno

1. Copia `.env.example` a `.env`.
2. Configura:

```bash
LIVEKIT_URL=wss://tu-proyecto.livekit.cloud
LIVEKIT_API_KEY=APIxxxxxxxxxxxxx
LIVEKIT_API_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

## Supabase: esquema inicial

Ejecuta en SQL Editor el archivo:

- `supabase/schema.sql`

Incluye tablas:

- `servers`
- `profiles`
- `server_members`
- `channels`
- `messages`

## Desarrollo local

```bash
npm install
npm run dev
```

Abrir:

- [http://localhost:3000](http://localhost:3000)

## Funcionalidades Fase 1

- Perfil de usuario editable (nombre visible, avatar, bio, estado).
- Crear/renombrar/archivar canales de texto y voz.
- Renombrar servidor (rol admin).
- Chat por canal en tiempo real (Supabase Realtime).
- Conexión de voz por canal (`roomName = serverId:channelId`).
- Webcam y compartir pantalla dentro del canal de voz activo.

## Avances Fase 2

- Permisos reforzados en backend para acciones de administración (servidor/canales).
- Layout de streams con modo **grilla** y **foco**.
- Tiles de video con acciones de **pin** y **fullscreen**.
- Resaltado visual de hablantes activos en voz.
- Compartir pantalla optimizado con codec automático y adaptación dinámica de bitrate/fps.

## Estructura del proyecto

```txt
backend/
  app.js
  routes/api.js
  services/
    bootstrapService.js
    supabaseAdmin.js
frontend/
  index.html
  styles.css
  app.js
api/token.js
supabase/schema.sql
server.js
```

## QA manual (end-to-end)

1. Abrir app y crear usuario.
2. Verificar creación automática de servidor + canales base.
3. Crear canal de texto y enviar mensajes.
4. Crear canal de voz, conectarse y cambiar entre canales.
5. Editar perfil y comprobar actualización en UI.
6. Renombrar servidor (como admin).
7. Activar webcam y compartir pantalla dentro del canal de voz.
