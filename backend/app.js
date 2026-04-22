const fs = require('fs');
const cors = require('cors');
const express = require('express');
const path = require('path');
const apiRouter = require('./routes/api');

const app = express();
app.set('trust proxy', 1);
/** Necesario para la app Electron (`file://` / origen opaco) que llama a la API en Vercel vía `VITE_API_ORIGIN`. */
app.use(cors({ origin: true }))

const rootDir =
  process.env.VERCEL === '1' ? process.cwd() : path.join(__dirname, '..');
const frontendV2Dist = path.join(rootDir, 'frontend-v2', 'dist');
const frontendV2Index = path.join(frontendV2Dist, 'index.html');
const serveFrontendV2 = fs.existsSync(frontendV2Index);

// Middleware específico para POST /api/dm: parsea body manualmente (cuerpo vacío con algunos clientes)
app.use((req, res, next) => {
  if (req.method === 'POST' && req.originalUrl === '/api/dm') {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        req.body = raw ? JSON.parse(raw) : {};
      } catch (_) {
        req.body = {};
      }
      next();
    });
  } else {
    next();
  }
});

app.use(express.json({ limit: '1mb', type: (req) => req.originalUrl !== '/api/dm' }));

/** Health check (p. ej. `wait-on` en `npm run electron:dev`) — responde antes del resto de `/api`. */
app.get('/api/health', (req, res) => {
  res.status(200).send('OK');
});

if (serveFrontendV2) {
  app.use(express.static(frontendV2Dist));
}
app.use('/api', apiRouter);

function sendSpaOr503(res) {
  if (serveFrontendV2) {
    return res.sendFile(frontendV2Index);
  }
  return res
    .status(503)
    .type('text/plain')
    .send(
      'No hay build del frontend. Ejecuta: cd frontend-v2 && npm run build',
    );
}

app.get('/', (_req, res) => {
  sendSpaOr503(res);
});

app.get('/join/:code', (_req, res) => {
  sendSpaOr503(res);
});

app.get('/dashboard', (_req, res) => {
  sendSpaOr503(res);
});

// SPA: recargas y rutas futuras del cliente (tras static y rutas explícitas)
app.get(/.*/, (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  sendSpaOr503(res);
});

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  const status = err.statusCode || 500;
  const message = status < 500 ? err.message : 'Error interno del servidor';
  res.status(status).json({ error: message });
});

module.exports = app;
