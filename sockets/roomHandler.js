const { randomUUID } = require('crypto');

const activeRooms = {};

const CONFIG = {
    MAX_CONNECTIONS_PER_IP: 5,
    MAX_ROOMS: 100,
    ROOM_TIMEOUT_MS: 10 * 60 * 1000,
    MAX_PLAYERS_PER_ROOM: 2,
    MAX_SPECTATORS_PER_ROOM: 10
};

const DIRS = [[0, 1], [0, -1], [1, 0], [-1, 0]];
const ipConnections = new Map();
const roomTimeouts = new Map();

function createBoard(size = 19) {
    return Array.from({ length: size }, () => Array(size).fill(''));
}

function cloneBoard(board) {
    return board.map(row => [...row]);
}

function inBounds(row, col, size) {
    return row >= 0 && row < size && col >= 0 && col < size;
}

function opponentColor(color) {
    return color === 'B' ? 'W' : 'B';
}

function displayToColor(color) {
    return color === 'black' ? 'B' : 'W';
}

function boardHash(board) {
    return board.map(row => row.map(cell => cell || '.').join('')).join('|');
}

function getGroup(board, row, col) {
    const size = board.length;
    const color = board[row]?.[col];
    if (!color) return { stones: new Set(), liberties: new Set() };

    const stones = new Set();
    const liberties = new Set();
    const stack = [[row, col]];

    while (stack.length > 0) {
        const [currentRow, currentCol] = stack.pop();
        const key = `${currentRow},${currentCol}`;
        if (stones.has(key)) continue;
        stones.add(key);

        for (const [deltaRow, deltaCol] of DIRS) {
            const nextRow = currentRow + deltaRow;
            const nextCol = currentCol + deltaCol;
            if (!inBounds(nextRow, nextCol, size)) continue;
            const nextKey = `${nextRow},${nextCol}`;
            if (board[nextRow][nextCol] === '') {
                liberties.add(nextKey);
            } else if (board[nextRow][nextCol] === color && !stones.has(nextKey)) {
                stack.push([nextRow, nextCol]);
            }
        }
    }

    return { stones, liberties };
}

function removeGroup(board, group) {
    let count = 0;
    const removed = [];
    for (const key of group.stones) {
        const [row, col] = key.split(',').map(Number);
        board[row][col] = '';
        removed.push([row, col]);
        count += 1;
    }
    return { count, removed };
}

function placeStone(board, row, col, color, koHash = null) {
    const size = board.length;
    if (!inBounds(row, col, size) || board[row][col] !== '') return null;

    const nextBoard = cloneBoard(board);
    nextBoard[row][col] = color;
    const opponent = opponentColor(color);
    let captured = 0;
    let capturedStones = [];

    for (const [deltaRow, deltaCol] of DIRS) {
        const nextRow = row + deltaRow;
        const nextCol = col + deltaCol;
        if (!inBounds(nextRow, nextCol, size) || nextBoard[nextRow][nextCol] !== opponent) continue;
        const group = getGroup(nextBoard, nextRow, nextCol);
        if (group.liberties.size === 0) {
            const removed = removeGroup(nextBoard, group);
            captured += removed.count;
            capturedStones = capturedStones.concat(removed.removed);
        }
    }

    const selfGroup = getGroup(nextBoard, row, col);
    if (selfGroup.liberties.size === 0) return null;

    const nextHash = boardHash(nextBoard);
    if (koHash && nextHash === koHash) return null;

    let nextKoHash = null;
    if (captured === 1) {
        const placedGroup = getGroup(nextBoard, row, col);
        if (placedGroup.stones.size === 1 && placedGroup.liberties.size === 1) {
            nextKoHash = boardHash(board);
        }
    }

    return {
        board: nextBoard,
        captured,
        capturedStones,
        koHash: nextKoHash,
        lastMove: [row, col]
    };
}

function createRoom(boardSize = 19) {
    return {
        players: [],
        spectators: [],
        moves: [],
        status: 'waiting',
        boardSize,
        board: createBoard(boardSize),
        turn: 'black',
        koHash: null,
        consecutivePasses: 0,
        capturedByBlack: 0,
        capturedByWhite: 0,
        createdAt: Date.now()
    };
}

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
            players: room.players.map(player => ({ nickname: player.nickname, color: player.color }))
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

            if (!roomId || roomId.length > 20) {
                socket.emit('room_error', 'Invalid room ID');
                return;
            }

            socket.join(roomId);
            if (!activeRooms[roomId]) {
                activeRooms[roomId] = createRoom(boardSize || 19);
            }
            const room = activeRooms[roomId];

            if (room.players.length >= CONFIG.MAX_PLAYERS_PER_ROOM) {
                socket.emit('room_error', 'Room is full');
                return;
            }

            if (!room.players.find(player => player.id === user.id)) {
                const color = room.players.length === 0 ? 'black' : 'white';
                room.players.push({ ...user, color, socketId: socket.id });
            }

            if (room.players.length === 2 && room.status === 'waiting') {
                room.status = 'playing';
                room.turn = 'black';
                room.board = createBoard(room.boardSize);
                room.koHash = null;
                room.consecutivePasses = 0;
                clearRoomTimeout(roomId);
                io.to(roomId).emit('game_start', { players: room.players, boardSize: room.boardSize });
            }

            if (room.status === 'waiting') {
                setRoomTimeout(roomId, () => {
                    const currentRoom = activeRooms[roomId];
                    if (currentRoom && currentRoom.status === 'waiting' && currentRoom.players.length < 2) {
                        if (currentRoom.players.length === 0 && (!currentRoom.spectators || currentRoom.spectators.length === 0)) {
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
            if (!room) {
                socket.emit('watch_error', 'Room not found');
                return;
            }
            if (!room.spectators) room.spectators = [];

            if (room.spectators.length >= CONFIG.MAX_SPECTATORS_PER_ROOM) {
                socket.emit('watch_error', 'Spectator limit reached');
                return;
            }

            if (!room.spectators.includes(socket.id)) room.spectators.push(socket.id);
            socket.emit('watch_start', {
                players: room.players,
                moves: room.moves,
                status: room.status,
                boardSize: room.boardSize
            });
            broadcastRoomList();
        });

        socket.on('make_move', ({ roomId, move }) => {
            const room = activeRooms[roomId];
            if (!room || room.status !== 'playing') {
                socket.emit('room_error', 'Room is not active');
                return;
            }

            const player = room.players.find(entry => entry.socketId === socket.id);
            if (!player) {
                socket.emit('room_error', 'Only players can make moves');
                return;
            }

            if (!move || typeof move !== 'object') {
                socket.emit('room_error', 'Invalid move payload');
                return;
            }

            if (move.color !== player.color) {
                socket.emit('room_error', 'Invalid player color');
                return;
            }

            if (room.turn !== player.color) {
                socket.emit('room_error', 'Not your turn');
                return;
            }

            if (move.type === 'pass') {
                room.moves.push({ type: 'pass', color: player.color });
                room.turn = room.turn === 'black' ? 'white' : 'black';
                room.consecutivePasses += 1;
                socket.to(roomId).emit('move_made', { type: 'pass', color: player.color });
                return;
            }

            if (move.type !== 'stone' || !Number.isInteger(move.row) || !Number.isInteger(move.col)) {
                socket.emit('room_error', 'Invalid move');
                return;
            }

            const result = placeStone(room.board, move.row, move.col, displayToColor(player.color), room.koHash);
            if (!result) {
                socket.emit('room_error', 'Illegal move');
                return;
            }

            room.board = result.board;
            room.koHash = result.koHash;
            room.turn = room.turn === 'black' ? 'white' : 'black';
            room.consecutivePasses = 0;
            if (player.color === 'black') room.capturedByBlack += result.captured;
            else room.capturedByWhite += result.captured;

            const storedMove = {
                row: move.row,
                col: move.col,
                color: player.color,
                type: 'stone',
                captured: result.captured,
                capturedStones: result.capturedStones
            };
            room.moves.push(storedMove);
            socket.to(roomId).emit('move_made', storedMove);
        });

        socket.on('game_end', ({ roomId, winner }) => {
            const room = activeRooms[roomId];
            if (room && room.status === 'playing') {
                room.status = 'done';
                const gameId = randomUUID();
                db.run(
                    'INSERT INTO games (game_id, room_id, winner, moves, board_size, black_player, white_player) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [
                        gameId,
                        roomId,
                        winner,
                        JSON.stringify(room.moves),
                        room.boardSize,
                        room.players[0]?.nickname || 'unknown',
                        room.players[1]?.nickname || 'unknown'
                    ],
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
                room.players = room.players.filter(player => player.socketId !== socket.id);
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
                const playerIndex = room.players.findIndex(player => player.socketId === socket.id);
                if (playerIndex !== -1) {
                    room.players.splice(playerIndex, 1);
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
