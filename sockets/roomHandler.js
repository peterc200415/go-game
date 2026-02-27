const { randomUUID } = require('crypto');

const activeRooms = {};

const CONFIG = {
    MAX_CONNECTIONS_PER_IP: 5,
    MAX_ROOMS: 100,
    ROOM_TIMEOUT_MS: 10 * 60 * 1000,
    MAX_PLAYERS_PER_ROOM: 2,
    MAX_SPECTATORS_PER_ROOM: 10
};

const ipConnections = new Map();
const roomTimeouts = new Map();

function clearRoomTimeout(roomId) {
    if (roomTimeouts.has(roomId)) {
        clearTimeout(roomTimeouts.get(roomId));
        roomTimeouts.delete(roomId);
    }
}

function setRoomTimeout(roomId, callback) {
    clearRoomTimeout(roomId);
    const timeout = setTimeout(callback, CONFIG.ROOM_TIMEOUT_MS);
    roomTimeouts.set(roomId, timeout);
}

function cleanupEmptyRooms() {
    const now = Date.now();
    for (const [roomId, room] of Object.entries(activeRooms)) {
        if (room.status === 'waiting' && room.players.length === 0) {
            if (!room.spectators || room.spectators.length === 0) {
                delete activeRooms[roomId];
                clearRoomTimeout(roomId);
            }
        }
    }
}

setInterval(cleanupEmptyRooms, CONFIG.ROOM_TIMEOUT_MS / 2);

function getClientIp(socket) {
    return socket.handshake.headers['x-forwarded-for'] || 
           socket.handshake.headers['x-real-ip'] || 
           socket.conn.remoteAddress;
}

module.exports = (io, db) => {
    io.use((socket, next) => {
        const ip = getClientIp(socket);
        const currentCount = ipConnections.get(ip) || 0;
        
        if (currentCount >= CONFIG.MAX_CONNECTIONS_PER_IP) {
            console.log(`Connection rejected: ${ip} exceeded limit (${currentCount})`);
            return next(new Error('Too many connections from this IP'));
        }
        
        ipConnections.set(ip, currentCount + 1);
        socket.clientIp = ip;
        console.log(`Client connected: ${socket.id} from ${ip} (total: ${currentCount + 1})`);
        next();
    });

    function getRoomList() {
        return Object.entries(activeRooms).map(([id, room]) => ({
            id,
            playerCount: room.players.length,
            spectatorCount: room.spectators ? room.spectators.length : 0,
            status: room.status,
            boardSize: room.boardSize,
            players: room.players.map(p => ({ nickname: p.nickname, color: p.color }))
        }));
    }

    function broadcastRoomList() {
        io.emit('room_list', getRoomList());
    }

    io.on('connection', (socket) => {
        console.log('Client connected:', socket.id);
        socket.emit('room_list', getRoomList());

        socket.on('get_rooms', () => socket.emit('room_list', getRoomList()));

        socket.on('join_room', ({ roomId, user, boardSize }) => {
            const roomCount = Object.keys(activeRooms).length;
            if (roomCount >= CONFIG.MAX_ROOMS) {
                socket.emit('room_error', 'Maximum rooms reached');
                return;
            }
            
            if (roomId && roomId.length > 20) {
                socket.emit('room_error', 'Invalid room ID');
                return;
            }

            socket.join(roomId);
            if (!activeRooms[roomId]) {
                activeRooms[roomId] = {
                    players: [], spectators: [], moves: [],
                    status: 'waiting', boardSize: boardSize || 19,
                    createdAt: Date.now()
                };
            }
            const room = activeRooms[roomId];
            
            if (room.players.length >= CONFIG.MAX_PLAYERS_PER_ROOM) {
                socket.emit('room_error', 'Room is full');
                return;
            }
            
            if (!room.players.find(p => p.id === user.id)) {
                const color = room.players.length === 0 ? 'black' : 'white';
                room.players.push({ ...user, color, socketId: socket.id });
            }
            
            if (room.players.length === 2 && room.status === 'waiting') {
                room.status = 'playing';
                clearRoomTimeout(roomId);
                io.to(roomId).emit('game_start', { players: room.players, boardSize: room.boardSize });
            }
            
            if (room.status === 'waiting') {
                setRoomTimeout(roomId, () => {
                    const r = activeRooms[roomId];
                    if (r && r.status === 'waiting' && r.players.length < 2) {
                        if (r.players.length === 0 && (!r.spectators || r.spectators.length === 0)) {
                            delete activeRooms[roomId];
                            broadcastRoomList();
                        }
                    }
                });
            }
            
            io.to(roomId).emit('room_update', room);
            broadcastRoomList();
        });

        socket.on('watch_room', ({ roomId }) => {
            socket.join(roomId);
            const room = activeRooms[roomId];
            if (!room) { socket.emit('watch_error', 'Room not found'); return; }
            if (!room.spectators) room.spectators = [];
            
            if (room.spectators.length >= CONFIG.MAX_SPECTATORS_PER_ROOM) {
                socket.emit('watch_error', 'Spectator limit reached');
                return;
            }
            
            if (!room.spectators.includes(socket.id)) room.spectators.push(socket.id);
            socket.emit('watch_start', {
                players: room.players, moves: room.moves,
                status: room.status, boardSize: room.boardSize
            });
            broadcastRoomList();
        });

        socket.on('make_move', ({ roomId, move }) => {
            socket.to(roomId).emit('move_made', move);
            if (activeRooms[roomId]) activeRooms[roomId].moves.push(move);
        });

        socket.on('game_end', ({ roomId, winner }) => {
            const room = activeRooms[roomId];
            if (room && room.status === 'playing') {
                room.status = 'done';
                const gameId = randomUUID();
                db.run('INSERT INTO games (game_id, room_id, winner, moves, board_size, black_player, white_player) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [gameId, roomId, winner, JSON.stringify(room.moves), room.boardSize, 
                     room.players[0]?.nickname || 'unknown', room.players[1]?.nickname || 'unknown'],
                    (err) => {
                        if (err) console.error('Failed to save game', err);
                        io.to(roomId).emit('game_saved', { gameId });
                    }
                );
            }
        });

        socket.on('leave_room', (roomId) => {
            socket.leave(roomId);
            const room = activeRooms[roomId];
            if (room) {
                room.players = room.players.filter(p => p.socketId !== socket.id);
                if (room.spectators) room.spectators = room.spectators.filter(id => id !== socket.id);
                io.to(roomId).emit('room_update', room);
                
                if (room.players.length === 0 && (!room.spectators || room.spectators.length === 0)) {
                    delete activeRooms[roomId];
                    clearRoomTimeout(roomId);
                }
                broadcastRoomList();
            }
        });

        socket.on('disconnect', () => {
            const ip = socket.clientIp;
            if (ipConnections.has(ip)) {
                ipConnections.set(ip, Math.max(0, ipConnections.get(ip) - 1));
            }
            
            for (const roomId in activeRooms) {
                const room = activeRooms[roomId];
                const idx = room.players.findIndex(p => p.socketId === socket.id);
                if (idx !== -1) {
                    room.players.splice(idx, 1);
                    io.to(roomId).emit('player_disconnected', socket.id);
                    io.to(roomId).emit('room_update', room);
                }
                if (room.spectators) room.spectators = room.spectators.filter(id => id !== socket.id);
                if (room.players.length === 0 && (!room.spectators || room.spectators.length === 0)) {
                    delete activeRooms[roomId];
                    clearRoomTimeout(roomId);
                }
            }
            broadcastRoomList();
        });
    });
};
