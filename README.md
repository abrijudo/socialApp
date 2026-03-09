# Mini Discord — LiveKit + Supabase

Voz, pantalla compartida y chat en tiempo real para grupos pequeños.  
Usa **LiveKit** como SFU (mejor calidad, escala, sin problemas de NAT) y **Supabase** para el chat persistente.

---

## 1. Crear cuenta en LiveKit Cloud (gratis)

1. Ve a [https://cloud.livekit.io](https://cloud.livekit.io) y regístrate.
2. Crea un proyecto nuevo (tipo *Cloud*).
3. En **Settings → Keys**, copia tu `API Key`, `API Secret` y la URL (`wss://...`).

---

## 2. Configurar variables de entorno

Copia `.env.example` a `.env` y rellena los valores:

```
LIVEKIT_URL=wss://tu-proyecto.livekit.cloud
LIVEKIT_API_KEY=APIxxxxxxxxxxxxx
LIVEKIT_API_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## 3. Arrancar en local

```bash
npm install
npm start
```

Abre [http://localhost:3000](http://localhost:3000) en el navegador.

---

## 4. Desplegar en Vercel

1. Sube el proyecto a GitHub.
2. En [vercel.com](https://vercel.com) importa el repo (Framework: **Other**, directorio raíz vacío).
3. Antes de hacer deploy, añade las variables de entorno en **Settings → Environment Variables**:
   - `LIVEKIT_URL`
   - `LIVEKIT_API_KEY`
   - `LIVEKIT_API_SECRET`
4. Dale a Deploy.

La función `api/token.js` se despliega automáticamente como serverless function.

---

## Estructura

```
index.html         ← toda la app (HTML + CSS + JS)
server.js          ← servidor local (Express + token endpoint)
api/token.js       ← Vercel serverless function (token JWT para LiveKit)
package.json       ← dependencias
.env.example       ← plantilla de variables de entorno
vercel.json        ← configuración de rutas
```
