const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const authenticate = require('../middleware/auth');
const { HttpError, asyncHandler } = require('../errors');
const { objectBody, rejectUnknown, text } = require('../validation');

const router = express.Router();

function email(value, optional = false) {
  const result = text(value, 'email', { max: 254, optional });
  if (result === undefined) {return undefined;}
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) {throw new HttpError(400, 'email must be a valid email address');}
  return result.toLowerCase();
}

router.use(authenticate);

router.get('/me', asyncHandler(async (req, res) => {
  const [rows] = await pool.execute('SELECT id, username, email FROM users WHERE id = ?', [req.user.id]);
  if (!rows[0]) {throw new HttpError(404, 'User not found');}
  res.json(rows[0]);
}));

router.patch('/me', asyncHandler(async (req, res) => {
  const body = objectBody(req.body);
  rejectUnknown(body, ['username', 'email', 'password']);
  if (!Object.keys(body).length) {throw new HttpError(400, 'At least one field is required');}

  const values = {
    username: text(body.username, 'username', { min: 3, max: 50, optional: true }),
    email: email(body.email, true),
    password: body.password === undefined ? undefined : await bcrypt.hash(text(body.password, 'password', { min: 8, max: 128 }), 12)
  };
  const entries = Object.entries(values).filter(([, value]) => value !== undefined);
  await pool.execute(`UPDATE users SET ${entries.map(([field]) => `${field} = ?`).join(', ')} WHERE id = ?`, [...entries.map(([, value]) => value), req.user.id]);
  const [rows] = await pool.execute('SELECT id, username, email FROM users WHERE id = ?', [req.user.id]);
  res.json(rows[0]);
}));

router.delete('/me', asyncHandler(async (req, res) => {
  await pool.execute('DELETE FROM users WHERE id = ?', [req.user.id]);
  res.status(204).end();
}));

module.exports = router;
