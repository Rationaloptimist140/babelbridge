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

// Shareable room link — redirect /room/ROOMCODE to /?room=ROOMCODE
app.get('/room/:roomId', (req, res) => {
  const roomId = req.params.roomId.toUpperCase();
  res.redirect(`/?room=${roomId}`);
});

// In-memory room storage
const rooms = new Map();

// Generate a random 6-character room ID
function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Translate text using Langbly API
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
    return text; // fallback to original
  }
}

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  // JOIN ROOM
  socket.on('join-room', ({ roomId, userName, langCode, flag }) => {
    let resolvedRoomId = roomId ? roomId.toUpperCase() : generateRoomId();

    if (!rooms.has(resolvedRoomId)) {
      rooms.set(resolvedRoomId, { roomId: resolvedRoomId, users: [], messages: [] });
    }

    const room = rooms.get(resolvedRoomId);
    const user = { socketId: socket.id, userName, langCode, flag };
    room.users.push(user);
    socket.join(resolvedRoomId);

    // Send room info back to joining user
    socket.emit('room-joined', {
      roomId: resolvedRoomId,
      users: room.users,
      recentMessages: room.messages.slice(-20)
    });

    // Notify others
    socket.to(resolvedRoomId).emit('user-joined', {
      userName,
      flag,
      userCount: room.users.length
    });

    // Send updated user list to everyone
    io.to(resolvedRoomId).emit('room-users', room.users);
  });

  // SEND MESSAGE
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

    // Translate and send to each user
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

  // TYPING
  socket.on('typing', ({ roomId, userName }) => {
    socket.to(roomId).emit('user-typing', { userName });
  });

  // DISCONNECT
  socket.on('disconnect', () => {
    for (const [roomId, room] of rooms.entries()) {
      const idx = room.users.findIndex(u => u.socketId === socket.id);
      if (idx !== -1) {
        const [user] = room.users.splice(idx, 1);
        if (room.users.length === 0) {
          rooms.delete(roomId);
        } else {
          io.to(roomId).emit('user-left', {
            userName: user.userName,
            flag: user.flag,
            userCount: room.users.length
          });
          io.to(roomId).emit('room-users', room.users);
        }
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`BabelBridge running on port ${PORT}`));
