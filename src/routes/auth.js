const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { jwtSecret, jwtExpiresIn } = require('../config');
const { HttpError, asyncHandler } = require('../errors');
const { objectBody, rejectUnknown, text } = require('../validation');

const router = express.Router();

function email(value) {
  const result = text(value, 'email', { max: 254 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) {throw new HttpError(400, 'email must be a valid email address');}
  return result;
}

router.post('/register', asyncHandler(async (req, res) => {
  const body = objectBody(req.body);
  rejectUnknown(body, ['username', 'email', 'password']);
  const username = text(body.username, 'username', { min: 3, max: 50 });
  const userEmail = email(body.email);
  const password = text(body.password, 'password', { min: 8, max: 128 });
  const hash = await bcrypt.hash(password, 12);

  const [result] = await pool.execute(
    'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
    [username, userEmail, hash]
  );
  res.status(201).location('/users/me').json({ id: result.insertId, username, email: userEmail });
}));

router.post('/login', asyncHandler(async (req, res) => {
  const body = objectBody(req.body);
  rejectUnknown(body, ['email', 'password']);
  const userEmail = email(body.email);
  const password = text(body.password, 'password', { max: 128 });

  const [rows] = await pool.execute('SELECT id, username, email, password FROM users WHERE email = ?', [userEmail]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password))) {throw new HttpError(401, 'Invalid email or password');}

  const token = jwt.sign({}, jwtSecret, { subject: String(user.id), expiresIn: jwtExpiresIn });
  res.json({ token, user: { id: user.id, username: user.username, email: user.email } });
}));

module.exports = router;
