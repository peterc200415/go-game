const express = require('express');
const db = require('../database');
const router = express.Router();

// Get game history
router.get('/history', (req, res) => {
    db.all('SELECT * FROM games ORDER BY created_at DESC LIMIT 50', [], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        const games = rows.map(r => ({
            ...r,
            moves: JSON.parse(r.moves || '[]')
        }));
        res.json(games);
    });
});

// Get single game
router.get('/:id', (req, res) => {
    db.get('SELECT * FROM games WHERE game_id = ?', [req.params.id], (err, row) => {
        if (err || !row) return res.status(404).json({ error: 'Game not found' });
        res.json({
            ...row,
            moves: JSON.parse(row.moves || '[]')
        });
    });
});

module.exports = router;
