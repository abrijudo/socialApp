const express = require('express');
const path = require('path');
const apiRouter = require('./routes/api');

const app = express();
const rootDir = path.join(__dirname, '..');
const frontendDir = path.join(rootDir, 'frontend');

// Middleware específico para POST /api/dm: parsea body manualmente (fix Electron/Express body vacío)
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
app.use('/frontend', express.static(frontendDir));
app.use('/api', apiRouter);

app.get('/livekit-client.js', (_req, res) => {
  res.sendFile(path.join(rootDir, 'livekit-client.js'));
});

app.get('/', (_req, res) => {
  res.sendFile(path.join(frontendDir, 'index.html'));
});
app.get('/join/:code', (_req, res) => {
  res.sendFile(path.join(frontendDir, 'index.html'));
});

module.exports = app;
