const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../database');

const router = express.Router();
const SECRET = 'go-game-jwt-secret-2024';

router.post('/register', async (req, res) => {
    const { email, password, nickname } = req.body;
    if (!email || !password || !nickname) return res.status(400).json({ error: 'All fields required' });
    try {
        const hash = await bcrypt.hash(password, 10);
        db.run('INSERT INTO users (email, password, nickname) VALUES (?, ?, ?)', [email, hash, nickname], function (err) {
            if (err) return res.status(400).json({ error: 'Email already exists' });
            res.json({ message: 'Registered', id: this.lastID });
        });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
        if (!user) return res.status(401).json({ error: 'User not found' });
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.status(401).json({ error: 'Wrong password' });
        const token = jwt.sign({ id: user.id }, SECRET, { expiresIn: '7d' });
        res.json({ token, user: { id: user.id, email: user.email, nickname: user.nickname } });
    });
});

module.exports = router;
