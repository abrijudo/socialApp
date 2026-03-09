# Discord Clone — Vercel + Supabase

## Despliegue

### 1. Supabase — activar Realtime
Ve a **supabase.com → tu proyecto → Realtime** y asegúrate de que está habilitado (viene activo por defecto).

No necesitas crear ninguna tabla. La app usa solo **Broadcast** y **Presence** de Supabase Realtime, que no requieren base de datos.

### 2. Subir a GitHub
```bash
git init
git add .
git commit -m "first commit"
git remote add origin https://github.com/TU_USUARIO/socialApp.git
git push -u origin main
```

### 3. Desplegar en Vercel
- Ve a vercel.com → Import project → selecciona el repo
- Framework: **Other**
- Root directory: dejar vacío
- Dale a Deploy

Listo. Vercel te da una URL pública con HTTPS automático.

## Estructura
```
index.html   ← toda la app (HTML + CSS + JS)
vercel.json  ← configuración de rutas
```
