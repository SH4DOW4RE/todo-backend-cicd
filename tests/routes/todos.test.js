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

// REMPLACE 'pending' par ton vrai statut si nécessaire
const VALID_STATUS = 'pending'; 

describe('POST /todos', () => {
  it('should create a new todo successfully', async () => {
    const res = await request(app)
      .post('/todos')
      .send({
        title: 'Acheter du pain',
        content: 'Au levain de préférence',
        status: VALID_STATUS
      });

    if (res.status !== 201) console.log('Erreur POST:', res.body);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.title).toBe('Acheter du pain');
    expect(res.body.archived).toBe(false);
  });

  it('should return 400 if title is missing', async () => {
    const res = await request(app)
      .post('/todos')
      .send({
        content: 'Pas de titre',
        status: VALID_STATUS
      });

    expect(res.status).toBe(400);
  });
});

describe('GET /todos', () => {
  it('should get all todos for the authenticated user', async () => {
    // Nettoyage local forcé avant l'insertion
    await pool.query('SET FOREIGN_KEY_CHECKS = 0');
    await pool.query('TRUNCATE TABLE todos');
    await pool.query('SET FOREIGN_KEY_CHECKS = 1');

    await pool.execute(
      'INSERT INTO todos (id, author, title, content, archived, status) VALUES (?, ?, ?, ?, ?, ?)',
      [99, mockUser.id, 'Tâche test', 'Détails', false, VALID_STATUS]
    );

    const res = await request(app).get('/todos');
    
    if (res.status !== 200) console.log('Erreur GET:', res.body);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    
    const todo99 = res.body.data.find(todo => todo.id === 99);
    expect(todo99).toBeDefined();
    expect(todo99.title).toBe('Tâche test');
  });
});


describe('GET /todos/:id', () => {
  it('should return 404 if the todo does not exist', async () => {
    const res = await request(app).get('/todos/99999');

    expect(res.status).toBe(404);
    // On cible le message là où il se trouve vraiment chez toi
    expect(res.body).toHaveProperty('error.message', 'Todo not found');
  });

  it('should return 400 if the ID is not a positive integer', async () => {
    const res = await request(app).get('/todos/invalid-id');

    expect(res.status).toBe(400);
  });
});

describe('GET /todos/search', () => {
  beforeEach(async () => {
    // Nettoyage avant les tests de recherche pour isoler nos fixtures
    await pool.query('SET FOREIGN_KEY_CHECKS = 0');
    await pool.query('TRUNCATE TABLE todos');
    await pool.query('SET FOREIGN_KEY_CHECKS = 1');

    // On insère deux todos spécifiques pour valider nos filtres
    await pool.execute(
      'INSERT INTO todos (id, author, title, content, archived, status) VALUES (?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?)',
      [
        101, mockUser.id, 'Urgent : Finir le projet', 'Coder les tests unitaires', false, 'in_progress',
        102, mockUser.id, 'Acheter du café', 'Prendre du grain arabica', true, 'completed'
      ]
    );
  });

  it('should filter todos by search query term (?q=)', async () => {
    const res = await request(app).get('/todos/search?q=Urgent');

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].id).toBe(101);
    expect(res.body.data[0].title).toBe('Urgent : Finir le projet');
  });

  it('should filter todos by status (?status=)', async () => {
    const res = await request(app).get('/todos/search?status=completed');

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].id).toBe(102);
  });

  it('should return 400 if an unknown query parameter is passed', async () => {
    // Ta fonction rejectUnknown() doit intercepter 'hackMe'
    const res = await request(app).get('/todos/search?hackMe=true');

    expect(res.status).toBe(400);
  });

  it('should return 400 if sort parameter is invalid', async () => {
    const res = await request(app).get('/todos/search?sort=invalid_column');

    expect(res.status).toBe(400);
  });
});