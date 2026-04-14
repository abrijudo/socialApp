# SocialApp Pro

Backend Express con API para mensajer�a/servidores/voz y despliegue como SPA servida desde `frontend-v2/dist`.

## Stack

- Node.js + Express
- Supabase (auth, DB, storage)
- LiveKit (voz/video)
- Playwright (E2E)

## Estructura actual

```txt
backend/
  app.js
  middleware/
  routes/
  services/
frontend-v2/         # SPA (Vite/React)
supabase/
  schema.sql
  migrations/
scripts/
  test-api.js
  run-all-tests.mjs
server.js
playwright.config.js
```

## Variables de entorno

Copia `.env.example` a `.env` y completa:

```bash
LIVEKIT_URL=wss://tu-proyecto.livekit.cloud
LIVEKIT_API_KEY=APIxxxxxxxxxxxxx
LIVEKIT_API_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

## Base de datos

- Base inicial: `supabase/schema.sql`
- Evoluci�n incremental: `supabase/migrations/*.sql`

## Desarrollo local

```bash
npm install
npm run dev
```

App/API en [http://localhost:3000](http://localhost:3000).

## Tests

```bash
npm run test       # API
npm run test:e2e   # Playwright
npm run test:all   # API + E2E
```

## Build frontend

Si quieres servir la SPA real, debe existir build en `frontend-v2/dist`.

```bash
cd frontend-v2
npm install
npm run build
```

Sin build, el servidor devuelve `503` en rutas web.
