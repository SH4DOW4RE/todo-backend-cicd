const express = require('express');
const pool = require('../db');
const authenticate = require('../middleware/auth');
const { HttpError, asyncHandler } = require('../errors');
const {
  TODO_STATUSES, objectBody, rejectUnknown, text, boolean, idArray, tags, parseId, nullableId
} = require('../validation');
const { hydrateTodos, getTodo, assertFolder, replaceRelations, transaction } = require('../services/todos');

const router = express.Router();
router.use(authenticate);

function todoInput(body, partial = false) {
  objectBody(body);
  rejectUnknown(body, ['title', 'content', 'archived', 'status', 'folder', 'parents', 'tags']);
  const result = {
    title: text(body.title, 'title', { max: 255, optional: partial }),
    content: text(body.content, 'content', { min: 0, optional: partial }),
    archived: boolean(body.archived, 'archived', true),
    status: body.status === undefined && partial ? undefined : text(body.status, 'status'),
    folder: nullableId(body.folder, 'folder', true),
    parents: idArray(body.parents, 'parents', true),
    tags: tags(body.tags, true)
  };
  if (result.status !== undefined && !TODO_STATUSES.includes(result.status)) {
    throw new HttpError(400, `status must be one of: ${TODO_STATUSES.join(', ')}`);
  }
  if (!partial) {
    result.archived ??= false;
    result.folder ??= null;
    result.parents ??= [];
    result.tags ??= [];
  }
  return result;
}

router.get('/', asyncHandler(async (req, res) => {
  rejectUnknown(req.query, ['page', 'limit', 'status', 'archived', 'folder', 'tag', 'search']);
  const page = req.query.page === undefined ? 1 : parseId(req.query.page, 'page');
  const limit = req.query.limit === undefined ? 50 : parseId(req.query.limit, 'limit');
  if (limit > 100) {throw new HttpError(400, 'limit cannot exceed 100');}

  const conditions = ['td.author = ?'];
  const params = [req.user.id];
  if (req.query.status !== undefined) {
    if (!TODO_STATUSES.includes(req.query.status)) {throw new HttpError(400, `status must be one of: ${TODO_STATUSES.join(', ')}`);}
    conditions.push('td.status = ?');
    params.push(req.query.status);
  }
  if (req.query.archived !== undefined) {
    if (!['true', 'false'].includes(req.query.archived)) {throw new HttpError(400, 'archived must be true or false');}
    conditions.push('td.archived = ?');
    params.push(req.query.archived === 'true');
  }
  if (req.query.folder === 'none') {
    conditions.push('td.folder_id IS NULL');
  } else if (req.query.folder !== undefined) {
    conditions.push('td.folder_id = ?');
    params.push(parseId(req.query.folder, 'folder'));
  }
  if (req.query.tag !== undefined) {
    const tag = text(req.query.tag, 'tag', { max: 64 }).toLowerCase();
    conditions.push('EXISTS (SELECT 1 FROM todo_tags ftt JOIN tags ft ON ft.id = ftt.tag_id WHERE ftt.todo_id = td.id AND ft.name = ?)');
    params.push(tag);
  }
  if (req.query.search !== undefined) {
    const search = text(req.query.search, 'search', { max: 255 });
    conditions.push('(td.title LIKE ? OR td.content LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  const where = conditions.join(' AND ');
  const offset = (page - 1) * limit;
  const [countRows] = await pool.execute(`SELECT COUNT(*) total FROM todos td WHERE ${where}`, params);
  const [rows] = await pool.execute(
    `SELECT td.id, td.author, td.folder_id AS folder, td.title, td.content, td.archived, td.status, td.\`date\`
     FROM todos td WHERE ${where} ORDER BY td.\`date\` DESC, td.id DESC LIMIT ${limit} OFFSET ${offset}`,
    params
  );
  res.json({
    data: await hydrateTodos(rows),
    pagination: { page, limit, total: countRows[0].total, pages: Math.ceil(countRows[0].total / limit) }
  });
}));

router.post('/', asyncHandler(async (req, res) => {
  const input = todoInput(req.body);
  const todo = await transaction(async (connection) => {
    await assertFolder(input.folder, req.user.id, connection);
    const [result] = await connection.execute(
      'INSERT INTO todos (author, folder_id, title, content, archived, status) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.id, input.folder, input.title, input.content, input.archived, input.status]
    );
    await replaceRelations(result.insertId, req.user.id, input.parents, input.tags, connection);
    return getTodo(result.insertId, req.user.id, connection);
  });
  res.status(201).location(`/todos/${todo.id}`).json(todo);
}));

function searchDate(value, field, endOfDay = false) {
  if (typeof value !== 'string') {throw new HttpError(400, `${field} must be an ISO 8601 date or date-time`);}
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  let normalizedValue = value;
  if (dateOnly) {
    const time = endOfDay ? '23:59:59.999' : '00:00:00.000';
    normalizedValue = `${value}T${time}Z`;
  }
  const date = new Date(normalizedValue);
  if (Number.isNaN(date.getTime())) {throw new HttpError(400, `${field} must be a valid ISO 8601 date or date-time`);}
  return date;
}

function addTextSearchFilters(query, conditions, params) {
  if (query.q !== undefined) {
    const search = text(query.q, 'q', { max: 255 });
    const pattern = `%${search}%`;
    conditions.push(`(td.title LIKE ? OR td.content LIKE ? OR EXISTS (
      SELECT 1 FROM todo_tags stt JOIN tags st ON st.id = stt.tag_id
      WHERE stt.todo_id = td.id AND st.name LIKE ?
    ))`);
    params.push(pattern, pattern, pattern);
  }
  if (query.title !== undefined) {
    conditions.push('td.title LIKE ?');
    params.push(`%${text(query.title, 'title', { max: 255 })}%`);
  }
  if (query.content !== undefined) {
    conditions.push('td.content LIKE ?');
    params.push(`%${text(query.content, 'content', { max: 255 })}%`);
  }
}

function addExactSearchFilters(query, conditions, params) {
  if (query.status !== undefined) {
    if (!TODO_STATUSES.includes(query.status)) {throw new HttpError(400, `status must be one of: ${TODO_STATUSES.join(', ')}`);}
    conditions.push('td.status = ?');
    params.push(query.status);
  }
  if (query.archived !== undefined) {
    if (!['true', 'false'].includes(query.archived)) {throw new HttpError(400, 'archived must be true or false');}
    conditions.push('td.archived = ?');
    params.push(query.archived === 'true');
  }
  if (query.folder === 'none') {
    conditions.push('td.folder_id IS NULL');
  } else if (query.folder !== undefined) {
    conditions.push('td.folder_id = ?');
    params.push(parseId(query.folder, 'folder'));
  }
  if (query.tag !== undefined) {
    const tag = text(query.tag, 'tag', { max: 64 }).toLowerCase();
    conditions.push('EXISTS (SELECT 1 FROM todo_tags stt JOIN tags st ON st.id = stt.tag_id WHERE stt.todo_id = td.id AND st.name = ?)');
    params.push(tag);
  }
}

function addDateSearchFilters(query, conditions, params) {
  const dateFrom = query.date_from === undefined ? undefined : searchDate(query.date_from, 'date_from');
  const dateTo = query.date_to === undefined ? undefined : searchDate(query.date_to, 'date_to', true);
  if (dateFrom && dateTo && dateFrom > dateTo) {throw new HttpError(400, 'date_from cannot be later than date_to');}
  if (dateFrom) {
    conditions.push('td.`date` >= ?');
    params.push(dateFrom);
  }
  if (dateTo) {
    conditions.push('td.`date` <= ?');
    params.push(dateTo);
  }
}

function searchOptions(query) {
  const page = query.page === undefined ? 1 : parseId(query.page, 'page');
  const limit = query.limit === undefined ? 50 : parseId(query.limit, 'limit');
  if (limit > 100) {throw new HttpError(400, 'limit cannot exceed 100');}

  const sortColumns = { date: 'td.`date`', title: 'td.title', status: 'td.status' };
  const sort = query.sort || 'date';
  const order = (query.order || 'desc').toLowerCase();
  if (!sortColumns[sort]) {throw new HttpError(400, 'sort must be one of: date, title, status');}
  if (!['asc', 'desc'].includes(order)) {throw new HttpError(400, 'order must be asc or desc');}
  return { page, limit, sortColumn: sortColumns[sort], order };
}

router.get('/search', asyncHandler(async (req, res) => {
  rejectUnknown(req.query, [
    'q', 'title', 'content', 'status', 'archived', 'folder', 'tag', 'date_from', 'date_to',
    'page', 'limit', 'sort', 'order'
  ]);
  const conditions = ['td.author = ?'];
  const params = [req.user.id];
  addTextSearchFilters(req.query, conditions, params);
  addExactSearchFilters(req.query, conditions, params);
  addDateSearchFilters(req.query, conditions, params);
  const { page, limit, sortColumn, order } = searchOptions(req.query);

  const where = conditions.join(' AND ');
  const offset = (page - 1) * limit;
  const [countRows] = await pool.execute(`SELECT COUNT(*) total FROM todos td WHERE ${where}`, params);
  const [rows] = await pool.execute(
    `SELECT td.id, td.author, td.folder_id AS folder, td.title, td.content, td.archived, td.status, td.\`date\`
     FROM todos td WHERE ${where} ORDER BY ${sortColumn} ${order.toUpperCase()}, td.id DESC LIMIT ${limit} OFFSET ${offset}`,
    params
  );
  res.json({
    data: await hydrateTodos(rows),
    pagination: { page, limit, total: countRows[0].total, pages: Math.ceil(countRows[0].total / limit) }
  });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  res.json(await getTodo(parseId(req.params.id), req.user.id));
}));

async function update(req, res, partial) {
  const id = parseId(req.params.id);
  const input = todoInput(req.body, partial);
  const entries = Object.entries(input).filter(([key, value]) => !['folder', 'parents', 'tags'].includes(key) && value !== undefined);
  if (partial && !entries.length && input.folder === undefined && input.parents === undefined && input.tags === undefined) {
    throw new HttpError(400, 'At least one field is required');
  }

  const todo = await transaction(async (connection) => {
    await getTodo(id, req.user.id, connection);
    if (input.folder !== undefined) {await assertFolder(input.folder, req.user.id, connection);}
    if (entries.length) {
      const assignments = entries.map(([field]) => `${field} = ?`).join(', ');
      await connection.execute(
        `UPDATE todos SET ${assignments} WHERE id = ? AND author = ?`,
        [...entries.map(([, value]) => value), id, req.user.id]
      );
    }
    if (input.folder !== undefined) {
      await connection.execute('UPDATE todos SET folder_id = ? WHERE id = ? AND author = ?', [input.folder, id, req.user.id]);
    }
    await replaceRelations(id, req.user.id, input.parents, input.tags, connection);
    return getTodo(id, req.user.id, connection);
  });
  res.json(todo);
}

router.put('/:id', asyncHandler((req, res) => update(req, res, false)));
router.patch('/:id', asyncHandler((req, res) => update(req, res, true)));

router.delete('/:id', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const [result] = await pool.execute('DELETE FROM todos WHERE id = ? AND author = ?', [id, req.user.id]);
  if (!result.affectedRows) {throw new HttpError(404, 'Todo not found');}
  res.status(204).end();
}));

module.exports = router;
