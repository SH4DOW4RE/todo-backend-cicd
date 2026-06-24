const request = require('supertest');
const app = require('../../src/app');
const pool = require('../../src/db');
const bcrypt = require('bcryptjs');

describe('Auth Routes', () => {
  beforeEach(async () => {
    await pool.query('SET FOREIGN_KEY_CHECKS = 0');
    await pool.query('TRUNCATE TABLE users');
    await pool.query('SET FOREIGN_KEY_CHECKS = 1');
  });

  afterAll(async () => {
    await pool.end();
  });

  it('should register a new user successfully', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({
        username: 'newuser',
        email: 'new@example.com',
        password: 'Password123!'
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.email).toBe('new@example.com');
    expect(res.body.username).toBe('newuser');  
  });

  it('should return 400 on register with invalid json format', async () => {
    const res = await request(app)
      .post('/auth/register')
      .set('Content-Type', 'application/json')
      .send('not-a-json-object');

    expect(res.status).toBe(400);
  });

  it('should return 400 if string inputs are invalid types', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({
        username: 12345, // Doit être une chaîne
        email: 'test@test.com',
        password: 'Password123!'
      });

    expect(res.status).toBe(400);
  });

  it('should login an existing user and return a JWT token', async () => {
    const hashedPassword = await bcrypt.hash('Password123!', 10);
    await pool.execute(
      'INSERT INTO users (email, username, password) VALUES (?, ?, ?)',
      ['login@example.com', 'loginuser', hashedPassword]
    );

    const res = await request(app)
      .post('/auth/login')
      .send({
        email: 'login@example.com',
        password: 'Password123!'
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user.email).toBe('login@example.com');
  });

  it('should return 401 on login with invalid credentials', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({
        email: 'unknown@example.com',
        password: 'wrongpassword'
      });

    expect(res.status).toBe(401);
  });
});