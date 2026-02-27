const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const db = require('./database');

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Proxy Ollama so frontend doesn't get CORS blocked
app.post('/api/ai_move', async (req, res) => {
    try {
        const olRes = await fetch('http://10.10.10.191:11435/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body)
        });
        const data = await olRes.json();
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Routes
const authRoutes = require('./routes/auth');
const gamesRoutes = require('./routes/games');
app.use('/api/auth', authRoutes);
app.use('/api/games', gamesRoutes);

// Socket.IO
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

require('./sockets/roomHandler')(io, db);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Go Game server running on port ${PORT}`);
});
