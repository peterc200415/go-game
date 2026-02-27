const { randomUUID } = require('crypto');

const activeRooms = {};

module.exports = (io, db) => {
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
            socket.join(roomId);
            if (!activeRooms[roomId]) {
                activeRooms[roomId] = {
                    players: [], spectators: [], moves: [],
                    status: 'waiting', boardSize: boardSize || 19
                };
            }
            const room = activeRooms[roomId];
            if (room.players.length < 2 && !room.players.find(p => p.id === user.id)) {
                const color = room.players.length === 0 ? 'black' : 'white';
                room.players.push({ ...user, color, socketId: socket.id });
            }
            if (room.players.length === 2 && room.status === 'waiting') {
                room.status = 'playing';
                io.to(roomId).emit('game_start', { players: room.players, boardSize: room.boardSize });
            }
            io.to(roomId).emit('room_update', room);
            broadcastRoomList();
        });

        socket.on('watch_room', ({ roomId }) => {
            socket.join(roomId);
            const room = activeRooms[roomId];
            if (!room) { socket.emit('watch_error', 'Room not found'); return; }
            if (!room.spectators) room.spectators = [];
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
                db.run('INSERT INTO games (game_id, room_id, winner, moves, board_size) VALUES (?, ?, ?, ?, ?)',
                    [gameId, roomId, winner, JSON.stringify(room.moves), room.boardSize],
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
                if (room.players.length === 0 && (!room.spectators || room.spectators.length === 0))
                    delete activeRooms[roomId];
                broadcastRoomList();
            }
        });

        socket.on('disconnect', () => {
            for (const roomId in activeRooms) {
                const room = activeRooms[roomId];
                const idx = room.players.findIndex(p => p.socketId === socket.id);
                if (idx !== -1) {
                    room.players.splice(idx, 1);
                    io.to(roomId).emit('player_disconnected', socket.id);
                    io.to(roomId).emit('room_update', room);
                }
                if (room.spectators) room.spectators = room.spectators.filter(id => id !== socket.id);
                if (room.players.length === 0 && (!room.spectators || room.spectators.length === 0))
                    delete activeRooms[roomId];
            }
            broadcastRoomList();
        });
    });
};
