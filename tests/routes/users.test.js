const request = require('supertest');
const app = require('../../src/app');
const pool = require('../../src/db');

const mockUser = { id: 1, email: 'test@example.com' };
jest.mock('../../src/middleware/auth', () => {
  return (req, res, next) => {
    req.user = mockUser;
    next();
  };
});

describe('Users Routes', () => {
  beforeEach(async () => {
    await pool.query('SET FOREIGN_KEY_CHECKS = 0');
    await pool.query('TRUNCATE TABLE users');
    await pool.query('SET FOREIGN_KEY_CHECKS = 1');
    await pool.execute(
      'INSERT INTO users (id, email, username, password) VALUES (?, ?, ?, ?)',
      [mockUser.id, mockUser.email, 'testuser', 'hashpassword123']
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  it('should get current user profile successfully', async () => {
    const res = await request(app).get('/users/me');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('username', 'testuser');
    expect(res.body).toHaveProperty('email', 'test@example.com');
  });

  it('should return 404 if current user does not exist in db', async () => {
    // Désactivation des clés étrangères pour vider proprement la table liée
    await pool.query('SET FOREIGN_KEY_CHECKS = 0');
    await pool.query('TRUNCATE TABLE users');
    await pool.query('SET FOREIGN_KEY_CHECKS = 1');

    const res = await request(app).get('/users/me');
    expect(res.status).toBe(404);
  });

  it('should update user profile partial fields successfully', async () => {
    const res = await request(app)
      .patch('/users/me')
      .send({ username: 'newusername', email: 'updated@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.username).toBe('newusername');
    expect(res.body.email).toBe('updated@example.com');
  });

  it('should update user password successfully', async () => {
    const res = await request(app)
      .patch('/users/me')
      .send({ password: 'newSecurePassword123' });

    expect(res.status).toBe(200);
  });

  it('should return 400 on patch if body is empty', async () => {
    const res = await request(app).patch('/users/me').send({});
    expect(res.status).toBe(400);
  });

  it('should return 400 if email is invalid format', async () => {
    const res = await request(app)
      .patch('/users/me')
      .send({ email: 'invalid-email-format' });

    expect(res.status).toBe(400);
  });

  it('should delete user profile successfully', async () => {
    const res = await request(app).delete('/users/me');
    expect(res.status).toBe(204);
  });
});