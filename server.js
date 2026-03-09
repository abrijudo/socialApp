const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Límites
const MAX_USERNAME_LEN = 20;
const MAX_MESSAGE_LEN  = 1000;

app.use(express.static(path.join(__dirname, 'public')));

// Usuarios conectados (solo en memoria)
// socket.id -> { name: string }
const users = new Map();
// Usuarios que están en el canal de voz
const voiceUsers = new Set();

function broadcastUserList() {
  const list = Array.from(users.entries()).map(([id, user]) => ({
    id,
    name: user.name,
  }));
  io.emit('user-list', list);
}

io.on('connection', (socket) => {
  console.log('Usuario conectado:', socket.id);

  // Enviar lista actual de voz al cliente nada más conectarse
  const currentVoice = Array.from(voiceUsers).map(id => ({
    id,
    name: users.get(id)?.name || 'Invitado',
  }));
  if (currentVoice.length) {
    socket.emit('current-voice-users', currentVoice);
  }

  socket.on('set-username', (name) => {
    if (typeof name !== 'string') return;
    const cleanName = name.trim().slice(0, MAX_USERNAME_LEN) || 'Invitado';
    users.set(socket.id, { name: cleanName });
    broadcastUserList();
  });

  socket.on('chat message', (msg) => {
    if (typeof msg !== 'string') return;
    const text = msg.trim().slice(0, MAX_MESSAGE_LEN);
    if (!text) return;
    // Incluir el nombre del autor para que el cliente pueda mostrarlo
    const author = users.get(socket.id)?.name || 'Invitado';
    io.emit('chat message', { author, text });
  });

  socket.on('join-voice', () => {
    // Evitar doble join
    if (voiceUsers.has(socket.id)) return;
    voiceUsers.add(socket.id);

    const others = Array.from(voiceUsers)
      .filter((id) => id !== socket.id)
      .map((id) => ({ id, name: users.get(id)?.name || 'Invitado' }));

    socket.emit('voice-users', others);
    socket.broadcast.emit('voice-user-joined', {
      id: socket.id,
      name: users.get(socket.id)?.name || 'Invitado',
    });
  });

  socket.on('leave-voice', () => {
    if (!voiceUsers.has(socket.id)) return;
    voiceUsers.delete(socket.id);
    socket.broadcast.emit('voice-user-left', socket.id);
  });

  // Señalización WebRTC — solo se reenvía si el destinatario existe
  socket.on('webrtc-offer', ({ to, sdp }) => {
    if (!io.sockets.sockets.has(to)) return;
    io.to(to).emit('webrtc-offer', { from: socket.id, sdp });
  });

  socket.on('webrtc-answer', ({ to, sdp }) => {
    if (!io.sockets.sockets.has(to)) return;
    io.to(to).emit('webrtc-answer', { from: socket.id, sdp });
  });

  socket.on('webrtc-ice-candidate', ({ to, candidate }) => {
    if (!io.sockets.sockets.has(to)) return;
    io.to(to).emit('webrtc-ice-candidate', { from: socket.id, candidate });
  });

  socket.on('disconnect', () => {
    if (voiceUsers.has(socket.id)) {
      voiceUsers.delete(socket.id);
      socket.broadcast.emit('voice-user-left', socket.id);
    }
    users.delete(socket.id);
    broadcastUserList();
    console.log('Usuario desconectado:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
