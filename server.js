const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Shareable room link
app.get('/room/:roomId', (req, res) => {
  const roomId = req.params.roomId.toUpperCase();
  res.redirect(`/?room=${roomId}`);
});

// In-memory storage
const rooms = new Map();
const lobbyUsers = new Map(); // socketId -> { name, langCode, flag, langName, topic, socketId }

function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

async function translateText(text, sourceLang, targetLang) {
  if (sourceLang === targetLang) return text;
  try {
    const response = await axios.post(
      'https://api.langbly.com/translate',
      { q: text, source: sourceLang, target: targetLang, format: 'text' },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + process.env.LANGBLY_API_KEY
        }
      }
    );
    return response.data.data.translations[0].translatedText;
  } catch (err) {
    console.error('Translation error:', err.message);
    return text;
  }
}

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  // ── LOBBY ──────────────────────────────────────────────
  socket.on('lobby-join', ({ name, langCode, flag, langName, topic }) => {
    const user = { socketId: socket.id, name, langCode, flag, langName, topic: topic || 'Open to anything', joinedAt: Date.now() };
    lobbyUsers.set(socket.id, user);
    // Send current lobby to this user
    socket.emit('lobby-state', Array.from(lobbyUsers.values()));
    // Broadcast new user to everyone else
    socket.broadcast.emit('lobby-user-joined', user);
  });

  socket.on('lobby-leave', () => {
    if (lobbyUsers.has(socket.id)) {
      lobbyUsers.delete(socket.id);
      io.emit('lobby-user-left', socket.id);
    }
  });

  // Invite someone from lobby to a room
  socket.on('lobby-invite', ({ targetSocketId }) => {
    const sender = lobbyUsers.get(socket.id);
    if (!sender) return;
    const roomId = generateRoomId();
    // Tell both users to join this room
    io.to(targetSocketId).emit('lobby-invited', { roomId, fromName: sender.name, fromFlag: sender.flag });
    socket.emit('lobby-invited', { roomId, fromName: sender.name, fromFlag: sender.flag });
  });

  // ── ROOMS ──────────────────────────────────────────────
  socket.on('join-room', ({ roomId, userName, langCode, flag }) => {
    // Remove from lobby if present
    if (lobbyUsers.has(socket.id)) {
      lobbyUsers.delete(socket.id);
      io.emit('lobby-user-left', socket.id);
    }

    let resolvedRoomId = roomId ? roomId.toUpperCase() : generateRoomId();
    if (!rooms.has(resolvedRoomId)) {
      rooms.set(resolvedRoomId, { roomId: resolvedRoomId, users: [], messages: [] });
    }

    const room = rooms.get(resolvedRoomId);
    const user = { socketId: socket.id, userName, langCode, flag };
    room.users.push(user);
    socket.join(resolvedRoomId);

    socket.emit('room-joined', {
      roomId: resolvedRoomId,
      users: room.users,
      recentMessages: room.messages.slice(-20)
    });

    socket.to(resolvedRoomId).emit('user-joined', { userName, flag, userCount: room.users.length });
    io.to(resolvedRoomId).emit('room-users', room.users);
  });

  socket.on('send-message', async ({ roomId, text, sourceLang }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const sender = room.users.find(u => u.socketId === socket.id);
    if (!sender) return;

    const messageRecord = {
      id: Date.now(),
      senderName: sender.userName,
      senderFlag: sender.flag,
      originalText: text,
      sourceLang,
      timestamp: new Date().toISOString()
    };
    room.messages.push(messageRecord);

    for (const user of room.users) {
      const translatedText = await translateText(text, sourceLang, user.langCode);
      io.to(user.socketId).emit('message-received', {
        id: messageRecord.id,
        senderName: sender.userName,
        senderFlag: sender.flag,
        translatedText,
        originalText: text,
        sourceLang,
        isOwn: user.socketId === socket.id,
        timestamp: messageRecord.timestamp
      });
    }
  });

  socket.on('typing', ({ roomId, userName }) => {
    socket.to(roomId).emit('user-typing', { userName });
  });

  // ── DISCONNECT ─────────────────────────────────────────
  socket.on('disconnect', () => {
    // Remove from lobby
    if (lobbyUsers.has(socket.id)) {
      lobbyUsers.delete(socket.id);
      io.emit('lobby-user-left', socket.id);
    }
    // Remove from rooms
    for (const [roomId, room] of rooms.entries()) {
      const idx = room.users.findIndex(u => u.socketId === socket.id);
      if (idx !== -1) {
        const [user] = room.users.splice(idx, 1);
        if (room.users.length === 0) {
          rooms.delete(roomId);
        } else {
          io.to(roomId).emit('user-left', { userName: user.userName, flag: user.flag, userCount: room.users.length });
          io.to(roomId).emit('room-users', room.users);
        }
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`BabelBridge running on port ${PORT}`));
