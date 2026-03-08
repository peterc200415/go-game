const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const db = require('./database');
const KataGoService = require('./katago/KataGoService');

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    console.log('Restarting server in 3 seconds...');
    setTimeout(() => process.exit(1), 3000);
});

process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection:', reason);
});

const app = express();
const server = http.createServer(app);
const aiPresetPath = path.join(__dirname, 'config', 'katago-presets.json');
const kataGo = new KataGoService({
    enginePath: path.join(__dirname, 'katago', 'engine', 'katago'),
    configPath: path.join(__dirname, 'katago', 'analysis_cpu.cfg'),
    modelPath: path.join(__dirname, 'katago', 'model.bin'),
    presetPath: aiPresetPath
});

app.use(cors());
app.use(express.json());

app.get('/health', async (req, res) => {
    const katagoHealth = await kataGo.getHealth();
    res.json({ status: 'ok', katago: katagoHealth });
});

app.get('/api/ai/presets', (req, res) => {
    try {
        const presets = JSON.parse(fs.readFileSync(aiPresetPath, 'utf-8'));
        res.json(presets);
    } catch (err) {
        res.status(500).json({ error: 'Failed to load AI presets' });
    }
});

app.post('/api/katago/move', async (req, res) => {
    try {
        const move = await kataGo.getMove(req.body);
        res.json(move);
    } catch (err) {
        const status = err.statusCode || 500;
        res.status(status).json({ error: err.message, code: err.code || 'KATAGO_ERROR' });
    }
});

app.post('/api/ai_move', async (req, res) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
        const olRes = await fetch('http://10.10.10.191:11435/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body),
            signal: controller.signal
        });

        const data = await olRes.json();
        if (!olRes.ok) {
            return res.status(olRes.status).json(data);
        }

        res.json(data);
    } catch (err) {
        const status = err.name === 'AbortError' ? 504 : 500;
        res.status(status).json({
            error: err.name === 'AbortError' ? 'Ollama request timed out' : err.message
        });
    } finally {
        clearTimeout(timeoutId);
    }
});

const authRoutes = require('./routes/auth');
const gamesRoutes = require('./routes/games');
app.use('/api/auth', authRoutes);
app.use('/api/games', gamesRoutes);

const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    maxHttpBufferSize: 1e6,
    transports: ['websocket', 'polling'],
    perMessageDeflate: false
});

require('./sockets/roomHandler')(io, db);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Go Game server running on port ${PORT}`);
    kataGo.ensureStarted().then(() => {
        console.log('KataGo engine warmed up');
    }).catch((err) => {
        console.warn('KataGo warmup failed:', err.message);
    });
});

async function shutdown(signal) {
    console.log(`Received ${signal}, shutting down...`);
    try {
        await kataGo.shutdown();
    } finally {
        server.close(() => process.exit(0));
        setTimeout(() => process.exit(1), 3000).unref();
    }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
