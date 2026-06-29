import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static('.'));
app.use(express.json());

// --- Room management ---
const rooms = new Map();

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = '';
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
  } while (rooms.has(code));
  return code;
}

function getRoom(code) {
  let room = rooms.get(code);
  if (!room) {
    room = { code, strokes: [], clients: new Map() };
    rooms.set(code, room);
  }
  return room;
}

// --- HTTP endpoint for creating a room ---
app.post('/api/create', (req, res) => {
  const code = generateRoomCode();
  const room = getRoom(code);
  room.created = Date.now();
  res.json({ room: code });
});

// --- WebSocket ---
wss.on('connection', (ws) => {
  let currentRoom = null;
  let userName = null;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch { return; }

    if (msg.type === 'create') {
      const code = generateRoomCode();
      const room = getRoom(code);
      userName = msg.name || 'Anonymous';
      currentRoom = room;
      room.clients.set(ws, userName);

      ws.send(JSON.stringify({ type: 'room_created', room: code }));
      ws.send(JSON.stringify({ type: 'room_joined', strokes: room.strokes, users: [...room.clients.values()] }));

      broadcast(room, { type: 'user_joined', name: userName }, ws);
      broadcast(room, { type: 'users', users: [...room.clients.values()] });
      return;
    }

    if (msg.type === 'join') {
      const code = msg.room?.toUpperCase();
      if (!code || !rooms.has(code)) {
        ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
        return;
      }
      const room = rooms.get(code);
      userName = msg.name || 'Anonymous';
      currentRoom = room;
      room.clients.set(ws, userName);

      ws.send(JSON.stringify({ type: 'room_joined', strokes: room.strokes, users: [...room.clients.values()] }));

      broadcast(room, { type: 'user_joined', name: userName }, ws);
      broadcast(room, { type: 'users', users: [...room.clients.values()] });
      return;
    }

    if (msg.type === 'stroke' && currentRoom) {
      if (msg.stroke.complete) {
        currentRoom.strokes.push(msg.stroke);
      }
      broadcast(currentRoom, { type: 'stroke', stroke: msg.stroke }, ws);
      return;
    }

    if (msg.type === 'clear' && currentRoom) {
      currentRoom.strokes = [];
      broadcast(currentRoom, { type: 'clear' });
      return;
    }
  });

  ws.on('close', () => {
    if (currentRoom) {
      currentRoom.clients.delete(ws);
      broadcast(currentRoom, { type: 'user_left', name: userName });
      if (currentRoom.clients.size > 0) {
        broadcast(currentRoom, { type: 'users', users: [...currentRoom.clients.values()] });
      }
    }
  });
});

function broadcast(room, msg, exclude) {
  const data = JSON.stringify(msg);
  for (const [client] of room.clients) {
    if (client !== exclude && client.readyState === 1) {
      client.send(data);
    }
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
