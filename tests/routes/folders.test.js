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

beforeAll(async () => {
  await pool.query('SET FOREIGN_KEY_CHECKS = 0');
  await pool.query('TRUNCATE TABLE users');
  await pool.query('SET FOREIGN_KEY_CHECKS = 1');
  await pool.execute(
    'INSERT INTO users (id, email, username, password) VALUES (?, ?, ?, ?)',
    [mockUser.id, mockUser.email, 'testuser', 'hash']
  );
});

describe('Folders Routes', () => {
  beforeEach(async () => {
    await pool.query('SET FOREIGN_KEY_CHECKS = 0');
    await pool.query('TRUNCATE TABLE folders');
    await pool.query('SET FOREIGN_KEY_CHECKS = 1');
  });

  afterAll(async () => {
    await pool.end();
  });

  it('should create a new folder successfully', async () => {
    const res = await request(app)
      .post('/folders')
      .send({ name: 'Projets Perso' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.name).toBe('Projets Perso');
  });

  it('should return 400 if folder name is missing', async () => {
    const res = await request(app)
      .post('/folders')
      .send({});

    expect(res.status).toBe(400);
  });

  it('should return 400 if unknown fields are sent', async () => {
    const res = await request(app)
      .post('/folders')
      .send({ name: 'Valid', unknownField: 'hack' });

    expect(res.status).toBe(400);
  });

  it('should get all folders for the authenticated user', async () => {
    await pool.execute(
      'INSERT INTO folders (id, name, author) VALUES (?, ?, ?)',
      [10, 'Work', mockUser.id]
    );

    const res = await request(app).get('/folders');

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].name).toBe('Work');
  });

  it('should filter root folders only', async () => {
    const res = await request(app).get('/folders?parent=root');
    expect(res.status).toBe(200);
  });

  it('should get a single folder by id', async () => {
    await pool.execute(
      'INSERT INTO folders (id, name, author) VALUES (?, ?, ?)',
      [15, 'Single', mockUser.id]
    );
    const res = await request(app).get('/folders/15');
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Single');
  });

  it('should update a folder completely via PUT', async () => {
    await pool.execute(
      'INSERT INTO folders (id, name, author) VALUES (?, ?, ?)',
      [20, 'Old Name', mockUser.id]
    );
    const res = await request(app)
      .put('/folders/20')
      .send({ name: 'New Name' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('New Name');
  });

  it('should update a folder partially via PATCH', async () => {
    await pool.execute(
      'INSERT INTO folders (id, name, author) VALUES (?, ?, ?)',
      [25, 'Patch Me', mockUser.id]
    );
    const res = await request(app)
      .patch('/folders/25')
      .send({ name: 'Patched' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Patched');
  });

  it('should return 400 on PUT/PATCH if folder is its own parent', async () => {
    await pool.execute(
      'INSERT INTO folders (id, name, author) VALUES (?, ?, ?)',
      [30, 'Loop', mockUser.id]
    );
    const res = await request(app)
      .patch('/folders/30')
      .send({ parent: 30 });

    expect(res.status).toBe(400);
  });

  it('should delete a folder successfully', async () => {
    await pool.execute(
      'INSERT INTO folders (id, name, author) VALUES (?, ?, ?)',
      [40, 'To Delete', mockUser.id]
    );
    const res = await request(app).delete('/folders/40');
    expect(res.status).toBe(204);
  });

  it('should return 404 when deleting a non-existent folder', async () => {
    const res = await request(app).delete('/folders/99999');
    expect(res.status).toBe(404);
  });
});