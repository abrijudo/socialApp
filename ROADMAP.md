# Social Club — Roadmap técnico y de producto

Documento de referencia basado en el **código del repositorio** a fecha de análisis (Vite/React, Express, Supabase, Electron). No sustituye a documentación de despliegue ni a decisiones de negocio; sirve para alinear ingeniería y prioridades.

---

## 1. Estado actual (funcionalidades implementadas)

### 1.1 Arquitectura

| Capa | Tecnologías (evidencia en repo) |
|------|---------------------------------|
| **Frontend** | `frontend-v2/`: Vite, React 19, TypeScript, Tailwind 4, Zustand (`useAppStore`), shadcn-style UI, `@fontsource-variable/geist` |
| **Backend** | `server.js` + `backend/`: Express, `zod`, middleware JWT Supabase (`requireAuth`) |
| **Datos** | Supabase: Postgres, Auth, Realtime, Storage; migraciones en `supabase/migrations/` |
| **Desktop** | `frontend-v2/electron/`: `main.mjs` (ventana, permisos media/display capture, `electron-updater`, CSP vía `session.webRequest.onHeadersReceived`) |
| **Monorepo** | `package.json` raíz: arranque API + scripts de test; `frontend-v2` empaquetado con `electron-builder` |

### 1.2 Autenticación y arranque

- Sesión **Supabase** en el cliente (`createSupabaseBrowserClient`, promesa única para evitar múltiples `GoTrueClient`), persistencia, PKCE, listener `onAuthStateChange` (`supabaseAuthListener.ts`).
- **Bootstrap** vía `GET /api/bootstrap` (servidor, permisos, canales, DMs, etc.) y `useAppStore.initializeSession`.
- Flujo **username** (anónimo / perfil) y comprobación `GET /api/auth/username-available`.
- Registro por correo administrado: `POST /api/register` (admin de Supabase).

### 1.3 Chat: canales y DMs

- Mensajes de canal: listado, envío, edición, borrado, reacciones, búsqueda (`/api/messages/search`), paginación / historial (store con caché por `channelId`).
- **DMs**: canales, mensajes, edición y borrado vía rutas `dm` / `dm-messages` (tablas y API dedicadas).
- **Lista virtualizada** con `react-virtuoso` (`VirtualizedMessageList`), filas con separador de no leídos (`UnreadSeparator`, baseline de lectura al entrar).
- **Hilo / reply en UI**: el componente de mensaje soporta `replyTarget` y acciones; el backend expone ruta de mensajes por “thread” bajo un padre (uso acotado — ver deuda).
- Compositor y envío optimista, estados `sending` / `failed`.

### 1.4 Tiempo real (Supabase)

- Suscripciones a cambios de mensajes, DMs, amigos, tipeo, presencia, etc. (hooks: `useChannelMessages`, `useDmMessages`, `useWorkspaceRealtime`, `useGlobalFriendsRealtime`, `useTypingIndicator`, etc.).
- **Realtime** autenticado con JWT centralizado (`getAuthenticatedSupabase`, `setAuth`).

### 1.5 Servidor, permisos e invitaciones

- **Servidores y canales**: creación, renombre, permisos por canal (`/permissions`, checks).
- **Miembros y roles** (owner, admin, mod, member) con actualización de rol.
- **Invitaciones**: creación, unión por código, lectura pública del código.
- **Amigos**: listado, solicitud, aceptar/rechazar.

### 1.6 Contenido de mensajes

- **Markdown** con GFM y saltos de línea (`RichTextRenderer`: `react-markdown`, `remark-gfm`, `remark-breaks`, resaltado con `react-syntax-highlighter`, sin HTML crudo).
- **Vista previa de enlaces**: `GET /api/preview` (proxy) con `link-preview-js` + reglas anti-SSRF básicas; `LinkPreview` en el cliente (tarjeta estilo chat, YouTube con embed acotado).
- **Adjuntos de imagen** en cuerpo y/o **subida a Storage** (`backend/services/storageService.js`, bucket `messages-media`, `POST /api/upload`).

### 1.7 Voz y vídeo (WebRTC vía proveedor)

- **LiveKit**: tokens vía `GET /api/token`, `VoiceRoom` con `@livekit/components-react`, pistas, pantalla, integración con store (`livekitSpeakers`, volúmenes, etc.).
- **Electron**: captura de pantalla/ventana (IPC, `desktopCapturer`, `getDisplayMedia`), barra de título personalizada, actualizador integrado.

### 1.8 UI / UX

- **Temas** `dark` / `blue` / `purple` con persistencia (`uiTheme`, `applyUiThemeToDocument`).
- Layout tipo Discord: rail de servidores, barra de canal, área de chat, DMs, popups de perfil, modales (invitación, creación de canal, etc.).

### 1.9 Seguridad de datos (Supabase RLS)

- Políticas de **lectura acotada** a miembros de servidor/canal, mensajes, DMs, reacciones, invitaciones; perfiles con lectura pública de estilo Discord (`20260423120000_rls_scoped_read_policies.sql` y migraciones previas de features completas, amistades, DMs, realtime).

### 1.10 Calidad y pruebas

- **Vitest** en el frontend (componentes voz, utilidades, etc.).
- **Playwright** E2E (`e2e/chat.spec.ts`): flujo crítico MD con `E2E_USERNAME` y datos sembrados; `playwright.config` documenta API en 3000 y proxy de Vite.

---

## 2. Deuda técnica y arreglos críticos

| Área | Observación (basada en código) | Solución sugerida (breve) |
|------|---------------------------------|---------------------------|
| **Vista previa de enlaces** | Cada render puede repetir `GET /api/preview` para la misma URL; el servicio hace `console.log` en producción. | Caché en memoria (LRU) por URL+TTL o cabecera `Cache-Control` en el cliente; bajar el log a `debug` o condicionar con `NODE_ENV`. |
| **CSP + Electron** | `setupContentSecurityPolicy` distingue Vite (permite `unsafe-eval`) vs empaquetado. | Aceptar aviso en dev; en release validar con CSP estricta y lista `connect-src` mínima (Supabase, API, LiveKit). |
| **Realtime** | `CHANNEL_ERROR` posible en cortes de red o reconexión. | Reintentos/`channel.subscribe` con backoff, métrica opcional; evitar múltiples instancias de cliente (ya mitigado con singleton de Supabase). |
| **E2E** | Depende de usuario real, MD existente; muchos `skip` si faltan datos. | Usuario/seed fijo en CI (SQL o script), fixture de conversación, o contenedor con datos. |
| **Bundle** | `vite build` avisa *chunks* > 1MB (LiveKit, etc.). | `import()` perezoso de módulos de voz, `manualChunks` o revisión de `scheduleVoicePrefetch`. |
| **Hilos (threads)** | Existe ruta de API para hijos bajo un padre; la UI de “hilo” completo no está extendida a todo el producto. | Definir si el hilo es MVP: panel lateral + paginación o desactivar ruta si no se usa. |
| **SSRF (preview)** | Validación de host/privada en el servicio; `link-preview-js` hace `fetch` servidor. | Lista de bloqueo adicional, rate limit por `userId`/IP, timeout ya presente. |
| **TypeScript** | Uso estricto en `src` (búsqueda de `any` ad hoc no reporta patrones generalizados en árbol principal). | Mantener `strict`, revisar `eslint @typescript-eslint/no-explicit-any` en CI. |
| **Reacciones en DM** | Código y comentarios en `MessageItem` indican reacciones solo en canales, no DMs. | Unificar con tabla/endpoint si se desea paridad, o dejarlo documentado como limitación. |
| **Observabilidad** | Pocos logs estructurados en Express salvo errores puntuales. | `pino`/`http` request id, correlación con `userId` en rutas sensibles. |

---

## 3. Próximos pasos (backlog de producto)

Sugerencia de **5** incrementos con mayor encaje respecto a Discord, ordenados de impacto. Complejidad: **Alta** / **Media** / **Baja** (estimación relativa, no fases fijas).

| # | Funcionalidad | Qué aporta | Complejidad |
|---|----------------|------------|-------------|
| 1 | **Adjuntos ricos y Storage** (arrastrar archivos, progreso, tipos, límites) ya apoyado en bucket `messages-media` y upload API | Paridad básica con Discord para compartir archivos, no solo imágenes por URL. | **Media** |
| 2 | **Hilos (threads) de conversación** — UI completa, notificaciones de respuestas, persistencia ya parcial vía API | Mejor organización de conversación larga; competitivo con Discord. | **Alta** |
| 3 | **Notificaciones** (sistema/escritorio en Electron, badges no leídos, preferencias) | Retención y “social club” sin estar mirando el chat. | **Alta** (Electron + permisos multiplataforma) |
| 4 | **Búsqueda global / filtros** (ampliar `messages/search` + UX: saltos, resaltado) | Hallar mensajes en servidores grandes. | **Media** |
| 5 | **Múltiples servidores en UI y descubrimiento** (hoy el store menciona un servidor frecuente en bootstrap) | Escala social y alineación con modelo Discord. | **Media**–**Alta** según invitaciones y RLS. |

Funciones ya **fuertes** en el repo (p. ej. voz LiveKit, pantalla, temas, markdown, RLS) pueden seguir evolucionando con refactor y monitorización, pero no se listan como “próximos 5” para no duplicar trabajo existente.

---

*Última actualización: generado a partir de lectura de código (sin modificaciones de fuentes en el commit asociado a este documento).*
