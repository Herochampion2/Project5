const express = require('express');
const { hashPassword, verifyPassword, createToken } = require('../auth');
const v = require('../validate');

module.exports = function authRoutes(db, requireAuth) {
  const router = express.Router();

  router.post('/register', (req, res) => {
    const { name, email, password } = req.body;
    v.check([v.text(name, 'name', { max: 80 }), v.email(email), v.text(password, 'password', { min: 8, max: 100 })]);
    const normalized = email.toLowerCase();
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(normalized)) {
      throw new v.HttpError(409, 'Email is already registered');
    }
    const result = db
      .prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)')
      .run(name.trim(), normalized, hashPassword(password));
    const id = Number(result.lastInsertRowid);
    res.status(201).json({ token: createToken(id), user: { id, name: name.trim(), email: normalized } });
  });

  router.post('/login', (req, res) => {
    const { email, password } = req.body;
    v.check([v.email(email), v.text(password, 'password', { max: 100 })]);
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
    if (!user || !verifyPassword(password, user.password_hash)) {
      throw new v.HttpError(401, 'Invalid email or password');
    }
    res.json({ token: createToken(user.id), user: { id: user.id, name: user.name, email: user.email } });
  });

  router.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));

  return router;
};
