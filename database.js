const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, 'go_game.db'));

db.serialize(() => {
    // Users table
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        nickname TEXT NOT NULL,
        rating INTEGER DEFAULT 1000,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Rooms table
    db.run(`CREATE TABLE IF NOT EXISTS rooms (
        room_id TEXT PRIMARY KEY,
        status TEXT DEFAULT 'waiting',
        player_black INTEGER,
        player_white INTEGER,
        board_size INTEGER DEFAULT 19,
        FOREIGN KEY(player_black) REFERENCES users(id),
        FOREIGN KEY(player_white) REFERENCES users(id)
    )`);

    // Games table (replays)
    db.run(`CREATE TABLE IF NOT EXISTS games (
        game_id TEXT PRIMARY KEY,
        room_id TEXT,
        black_player TEXT,
        white_player TEXT,
        board_size INTEGER DEFAULT 19,
        winner TEXT,
        moves TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

module.exports = db;
