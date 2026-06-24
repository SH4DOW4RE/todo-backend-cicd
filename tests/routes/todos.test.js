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

describe('Todos Routes and Services', () => {
  beforeEach(async () => {
    await pool.query('SET FOREIGN_KEY_CHECKS = 0');
    await pool.query('TRUNCATE TABLE todos');
    await pool.query('TRUNCATE TABLE folders');
    await pool.query('TRUNCATE TABLE tags');
    await pool.query('TRUNCATE TABLE todo_tags');
    await pool.query('TRUNCATE TABLE todo_parents');
    await pool.query('SET FOREIGN_KEY_CHECKS = 1');
  });

  afterAll(async () => {
    await pool.end();
  });

  // --- POST /todos (Création et Validations) ---
  it('should create a basic todo successfully', async () => {
    const res = await request(app)
      .post('/todos')
      .send({ title: 'Task 1', content: 'Description 1', status: 'pending' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.title).toBe('Task 1');
    expect(res.body.archived).toBe(false);
  });

  it('should create a todo with folder, tags, and parents successfully', async () => {
    await pool.execute('INSERT INTO folders (id, name, author) VALUES (1, "Work", 1)');
    await pool.execute('INSERT INTO todos (id, author, title, content, status) VALUES (10, 1, "Parent Task", "...", "pending")');

    const res = await request(app)
      .post('/todos')
      .send({
        title: 'Child Task',
        content: 'With tags',
        status: 'in_progress',
        folder: 1,
        parents: [10],
        tags: ['Urgent', 'Code']
      });

    expect(res.status).toBe(201);
    expect(res.body.folder).toBe(1);
    expect(res.body.parents).toContain(10);
    expect(res.body.tags).toContain('urgent'); // Normalisé en minuscule
  });

  it('should return 400 on POST if status is invalid', async () => {
    const res = await request(app)
      .post('/todos')
      .send({ title: 'Invalid Status', content: '...', status: 'wrong_status' });

    expect(res.status).toBe(400);
  });

  it('should return 400 on POST if folder does not exist or belongs to another user', async () => {
    const res = await request(app)
      .post('/todos')
      .send({ title: 'Bad Folder', content: '...', status: 'pending', folder: 999 });

    expect(res.status).toBe(400);
  });

  // --- GET /todos (Listes, Pagination, Filtres) ---
  it('should list todos with pagination and query filters', async () => {
    await pool.execute('INSERT INTO todos (id, author, title, content, status, archived) VALUES (1, 1, "Find Me", "Content target", "completed", 0)');
    
    // Test des filtres combinés
    const res = await request(app)
      .get('/todos')
      .query({ status: 'completed', archived: 'false', search: 'Find', limit: 10, page: 1 });

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.pagination.total).toBe(1);
  });

  it('should return 400 on GET if limit exceeds 100', async () => {
    const res = await request(app).get('/todos').query({ limit: 101 });
    expect(res.status).toBe(400);
  });

  it('should filter todos by folder="none"', async () => {
    await pool.execute('INSERT INTO todos (id, author, title, content, status, folder_id) VALUES (1, 1, "No Folder", "...", "pending", NULL)');
    const res = await request(app).get('/todos').query({ folder: 'none' });
    expect(res.status).toBe(200);
  });

  // --- GET /todos/search (Recherche Avancée & Tris) ---
  it('should execute full-text advanced search and sorting options', async () => {
    await pool.execute('INSERT INTO todos (id, author, title, content, status, \`date\`) VALUES (1, 1, "Apple", "Pie recipe", "pending", "2026-06-20 10:00:00")');
    await pool.execute('INSERT INTO todos (id, author, title, content, status, \`date\`) VALUES (2, 1, "Banana", "Split recipe", "blocked", "2026-06-22 10:00:00")');

    const res = await request(app)
      .get('/todos/search')
      .query({ q: 'recipe', sort: 'title', order: 'asc', date_from: '2026-06-19', date_to: '2026-06-23' });

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
    expect(res.body.data[0].title).toBe('Apple'); // Ordre ASC sur le titre
  });

  it('should return 400 on search if date_from is later than date_to', async () => {
    const res = await request(app)
      .get('/todos/search')
      .query({ date_from: '2026-06-25', date_to: '2026-06-20' });

    expect(res.status).toBe(400);
  });

  // --- GET /todos/:id ---
  it('should return 404 if todo is not found', async () => {
    const res = await request(app).get('/todos/9999');
    expect(res.status).toBe(404);
  });

  // --- PUT / PATCH / DELETE ---
  it('should perform full update via PUT', async () => {
    await pool.execute('INSERT INTO todos (id, author, title, content, status) VALUES (1, 1, "Old Title", "Old Content", "pending")');
    
    const res = await request(app)
      .put('/todos/1')
      .send({ title: 'New Title', content: 'New Content', status: 'blocked' });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('New Title');
  });

  it('should perform partial update via PATCH', async () => {
    await pool.execute('INSERT INTO todos (id, author, title, content, status) VALUES (1, 1, "Keep Title", "Old Content", "pending")');
    
    const res = await request(app)
      .patch('/todos/1')
      .send({ content: 'Just Content Updated' });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Keep Title');
    expect(res.body.content).toBe('Just Content Updated');
  });

  it('should return 400 on PUT/PATCH if relations create a cycle', async () => {
    await pool.execute('INSERT INTO todos (id, author, title, content, status) VALUES (1, 1, "Task A", "...", "pending")');
    await pool.execute('INSERT INTO todos (id, author, title, content, status) VALUES (2, 1, "Task B", "...", "pending")');
    await pool.execute('INSERT INTO todo_parents (todo_id, parent_id) VALUES (1, 2)'); // B est parent de A

    // Tenter de rendre A parent de B (Crée un cycle A -> B -> A)
    const res = await request(app)
      .patch('/todos/2')
      .send({ parents: [1] });

    expect(res.status).toBe(400);
  });

  it('should return 400 on PATCH if a todo is assigned as its own parent', async () => {
    await pool.execute('INSERT INTO todos (id, author, title, content, status) VALUES (1, 1, "Self Loop", "...", "pending")');
    
    const res = await request(app)
      .patch('/todos/1')
      .send({ parents: [1] });

    expect(res.status).toBe(400);
  });

  it('should delete a todo successfully', async () => {
    await pool.execute('INSERT INTO todos (id, author, title, content, status) VALUES (1, 1, "To Delete", "...", "pending")');
    
    const res = await request(app).delete('/todos/1');
    expect(res.status).toBe(204);
  });

  it('should return 400 on POST if parents parameter is not an array', async () => {
    const res = await request(app)
      .post('/todos')
      .send({ title: 'Bad Parents', content: '...', status: 'pending', parents: 'not-an-array' });

    expect(res.status).toBe(400); // Couvre la ligne 26-27 de validation.js
  });

  it('should return 400 on GET /todos/search if format of date_from is not a valid string date', async () => {
    // En envoyant un tableau, req.query.date_from devient un Array, ce qui fait échouer le typeof value !== 'string'
    const res = await request(app)
      .get('/todos/search')
      .query({ 'date_from[]': ['2026-01-01', '2026-01-02'] });

    expect(res.status).toBe(400); // Déclenche avec succès le premier if de searchDate !
  });

  it('should return 400 on GET /todos/search if date string is completely invalid', async () => {
    const res = await request(app)
      .get('/todos/search')
      .query({ date_from: 'not-a-date' });

    expect(res.status).toBe(400); // Couvre la validation NaN de searchDate
  });

  it('should return 400 on GET /todos/search if sort column or order is invalid', async () => {
    const resInvalidSort = await request(app).get('/todos/search').query({ sort: 'invalid_col' });
    const resInvalidOrder = await request(app).get('/todos/search').query({ order: 'UPWARD' });

    expect(resInvalidSort.status).toBe(400);
    expect(resInvalidOrder.status).toBe(400); // Couvre les lignes 142-144 de todos.js
  });

  it('should filter on GET /todos/search with specific title, content and archived flags', async () => {
    await pool.execute('INSERT INTO todos (id, author, title, content, status, archived) VALUES (5, 1, "Specific Todo", "Unique body text", "pending", 1)');
    
    const res = await request(app)
      .get('/todos/search')
      .query({ title: 'Specific', content: 'Unique', archived: 'true' });

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1); // Couvre les branches des filtres cumulatifs
  });

  it('should return 400 on GET /todos or search if archived parameter is not true or false', async () => {
    const res = await request(app).get('/todos').query({ archived: 'maybe' });
    expect(res.status).toBe(400); // Couvre la validation stricte de la chaîne archived
  });
});