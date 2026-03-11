const express = require('express');
const path = require('path');
const apiRouter = require('./routes/api');

const app = express();
const rootDir = path.join(__dirname, '..');
const frontendDir = path.join(rootDir, 'frontend');

app.use(express.json({ limit: '1mb' }));
app.use('/frontend', express.static(frontendDir));
app.use('/api', apiRouter);

app.get('/livekit-client.js', (_req, res) => {
  res.sendFile(path.join(rootDir, 'livekit-client.js'));
});

app.get('/', (_req, res) => {
  res.sendFile(path.join(frontendDir, 'index.html'));
});

module.exports = app;
