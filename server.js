require('dotenv').config();
const express = require('express');
const path    = require('path');
const handler = require('./api/token');

const app  = express();
const PORT = process.env.PORT || 3000;

// Servir el index.html como fichero estático
app.use(express.static(path.join(__dirname)));


// Endpoint de token (reutiliza la misma función que Vercel)
app.get('/api/token', (req, res) => handler(req, res));

app.listen(PORT, () => {
  console.log(`Servidor arrancado en http://localhost:${PORT}`);
  if (!process.env.LIVEKIT_URL) {
    console.warn('\n⚠  Crea un fichero .env con LIVEKIT_URL, LIVEKIT_API_KEY y LIVEKIT_API_SECRET');
    console.warn('   Guía: https://cloud.livekit.io → tu proyecto → Settings → Keys\n');
  }
});
