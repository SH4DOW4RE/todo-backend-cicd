const express = require('express');
const pool = require('../db');
const authenticate = require('../middleware/auth');
const { HttpError, asyncHandler } = require('../errors');
const { objectBody, rejectUnknown, text, parseId, nullableId } = require('../validation');

// ON ENLÈVE L'IMPORT DU SERVICE ICI POUR CASSER LA BOUCLE CIRCULAIRE

const router = express.Router();
router.use(authenticate);

const folderSelect = `
  SELECT f.id, f.author, f.parent_id AS parent, f.name, f.date,
    (SELECT COUNT(*) FROM todos td WHERE td.folder_id = f.id) AS todo_count,
    (SELECT COUNT(*) FROM folders child WHERE child.parent_id = f.id) AS child_count
  FROM folders f`;

async function getFolder(id, author, executor = pool) {
  const [rows] = await executor.execute(`${folderSelect} WHERE f.id = ? AND f.author = ?`, [id, author]);
  if (!rows[0]) {throw new HttpError(404, 'Folder not found');}
  return rows[0];
}

async function assertParent(parent, author, folderId, connection) {
  if (parent === null) {return;}
  if (parent === folderId) {throw new HttpError(400, 'A folder cannot be its own parent');}
  const [rows] = await connection.execute('SELECT id FROM folders WHERE id = ? AND author = ?', [parent, author]);
  if (!rows[0]) {throw new HttpError(400, 'The parent must be an existing folder owned by the current user');}
  if (!folderId) {return;}

  const [cycles] = await connection.execute(
    `WITH RECURSIVE ancestors AS (
       SELECT id, parent_id FROM folders WHERE id = ? AND author = ?
       UNION DISTINCT
       SELECT f.id, f.parent_id FROM folders f JOIN ancestors a ON f.id = a.parent_id WHERE f.author = ?
     ) SELECT 1 FROM ancestors WHERE id = ? LIMIT 1`,
    [parent, author, author, folderId]
  );
  if (cycles.length) {throw new HttpError(400, 'The parent relationship would create a cycle');}
}

router.get('/', asyncHandler(async (req, res) => {
  rejectUnknown(req.query, ['parent']);
  const params = [req.user.id];
  let parentCondition = '';
  if (req.query.parent === 'root') {
    parentCondition = ' AND f.parent_id IS NULL';
  } else if (req.query.parent !== undefined) {
    parentCondition = ' AND f.parent_id = ?';
    params.push(parseId(req.query.parent, 'parent'));
  }
  const [rows] = await pool.execute(
    `${folderSelect} WHERE f.author = ?${parentCondition} ORDER BY f.name ASC, f.id ASC`,
    params
  );
  res.json({ data: rows });
}));

router.post('/', asyncHandler(async (req, res) => {
  const body = objectBody(req.body);
  rejectUnknown(body, ['name', 'parent']);
  const name = text(body.name, 'name', { max: 255 });
  const parent = nullableId(body.parent, 'parent', true) ?? null;

  // On importe 'transaction' dynamiquement au moment de l'exécution pour contourner le problème
  const { transaction } = require('../services/todos');

  const folder = await transaction(async (connection) => {
    await assertParent(parent, req.user.id, undefined, connection);
    const [result] = await connection.execute(
      'INSERT INTO folders (author, parent_id, name) VALUES (?, ?, ?)',
      [req.user.id, parent, name]
    );
    return getFolder(result.insertId, req.user.id, connection);
  });
  res.status(201).location(`/folders/${folder.id}`).json(folder);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  res.json(await getFolder(parseId(req.params.id), req.user.id));
}));

async function update(req, res, partial) {
  const id = parseId(req.params.id);
  const body = objectBody(req.body);
  rejectUnknown(body, ['name', 'parent']);
  const name = text(body.name, 'name', { max: 255, optional: partial });
  let parent = nullableId(body.parent, 'parent', true);
  if (!partial && parent === undefined) {parent = null;}
  if (partial && name === undefined && parent === undefined) {throw new HttpError(400, 'At least one field is required');}

  // Idem ici, import à la volée
  const { transaction } = require('../services/todos');

  const folder = await transaction(async (connection) => {
    await getFolder(id, req.user.id, connection);
    if (parent !== undefined) {await assertParent(parent, req.user.id, id, connection);}
    const entries = Object.entries({ name, parent_id: parent }).filter(([, value]) => value !== undefined);
    const assignments = entries.map(([field]) => `${field} = ?`).join(', ');
    await connection.execute(
      `UPDATE folders SET ${assignments} WHERE id = ? AND author = ?`,
      [...entries.map(([, value]) => value), id, req.user.id]
    );
    return getFolder(id, req.user.id, connection);
  });
  res.json(folder);
}

router.put('/:id', asyncHandler((req, res) => update(req, res, false)));
router.patch('/:id', asyncHandler((req, res) => update(req, res, true)));

router.delete('/:id', asyncHandler(async (req, res) => {
  const [result] = await pool.execute(
    'DELETE FROM folders WHERE id = ? AND author = ?',
    [parseId(req.params.id), req.user.id]
  );
  if (!result.affectedRows) {throw new HttpError(404, 'Folder not found');}
  res.status(204).end();
}));

module.exports = router;
