const pool = require('../db');
const { HttpError } = require('../errors');

async function hydrateTodos(todos, executor = pool) {
  if (!todos.length) return todos;
  const ids = todos.map((todo) => todo.id);
  const placeholders = ids.map(() => '?').join(',');
  const [[parents], [tags]] = await Promise.all([
    executor.query(`SELECT todo_id, parent_id FROM todo_parents WHERE todo_id IN (${placeholders}) ORDER BY parent_id`, ids),
    executor.query(`SELECT tt.todo_id, t.name FROM todo_tags tt JOIN tags t ON t.id = tt.tag_id WHERE tt.todo_id IN (${placeholders}) ORDER BY t.name`, ids)
  ]);
  const parentMap = new Map(ids.map((id) => [id, []]));
  const tagMap = new Map(ids.map((id) => [id, []]));
  parents.forEach(({ todo_id, parent_id }) => parentMap.get(todo_id)?.push(parent_id));
  tags.forEach(({ todo_id, name }) => tagMap.get(todo_id)?.push(name));
  return todos.map((todo) => ({
    ...todo,
    archived: Boolean(todo.archived),
    parents: parentMap.get(todo.id),
    tags: tagMap.get(todo.id)
  }));
}

async function getTodo(id, author, executor = pool) {
  const [rows] = await executor.execute(
    'SELECT id, author, folder_id AS folder, title, content, archived, status, `date` FROM todos WHERE id = ? AND author = ?',
    [id, author]
  );
  if (!rows[0]) throw new HttpError(404, 'Todo not found');
  return (await hydrateTodos(rows, executor))[0];
}

async function assertFolder(folderId, author, executor = pool) {
  if (folderId === null) return;
  const [rows] = await executor.execute('SELECT id FROM folders WHERE id = ? AND author = ?', [folderId, author]);
  if (!rows[0]) throw new HttpError(400, 'folder must be an existing folder owned by the current user');
}

async function assertParents(parentIds, author, todoId, connection) {
  if (!parentIds.length) return;
  const placeholders = parentIds.map(() => '?').join(',');
  const [rows] = await connection.query(
    `SELECT id FROM todos WHERE author = ? AND id IN (${placeholders})`,
    [author, ...parentIds]
  );
  if (rows.length !== parentIds.length) throw new HttpError(400, 'Every parent must be an existing todo owned by the current user');
  if (!todoId) return;
  if (parentIds.includes(todoId)) throw new HttpError(400, 'A todo cannot be its own parent');

  const [cycles] = await connection.query(
    `WITH RECURSIVE ancestors AS (
       SELECT todo_id, parent_id FROM todo_parents WHERE todo_id IN (${placeholders})
       UNION DISTINCT
       SELECT tp.todo_id, tp.parent_id FROM todo_parents tp JOIN ancestors a ON tp.todo_id = a.parent_id
     ) SELECT 1 FROM ancestors WHERE parent_id = ? LIMIT 1`,
    [...parentIds, todoId]
  );
  if (cycles.length) throw new HttpError(400, 'The parent relationships would create a cycle');
}

async function replaceRelations(todoId, author, parentIds, tagNames, connection) {
  if (parentIds !== undefined) {
    await assertParents(parentIds, author, todoId, connection);
    await connection.execute('DELETE FROM todo_parents WHERE todo_id = ?', [todoId]);
    if (parentIds.length) {
      await connection.query('INSERT INTO todo_parents (todo_id, parent_id) VALUES ?', [parentIds.map((id) => [todoId, id])]);
    }
  }
  if (tagNames !== undefined) {
    await connection.execute('DELETE FROM todo_tags WHERE todo_id = ?', [todoId]);
    for (const name of tagNames) {
      await connection.execute('INSERT INTO tags (name) VALUES (?) ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)', [name]);
      const [tagRows] = await connection.execute('SELECT id FROM tags WHERE name = ?', [name]);
      await connection.execute('INSERT INTO todo_tags (todo_id, tag_id) VALUES (?, ?)', [todoId, tagRows[0].id]);
    }
  }
}

async function transaction(work) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = { hydrateTodos, getTodo, assertFolder, replaceRelations, transaction };
