const pool = require('../src/db');

// Avant chaque test d'un fichier, on nettoie les données
beforeEach(async () => {
  // On désactive temporairement les contraintes FK pour vider proprement
  await pool.query('SET FOREIGN_KEY_CHECKS = 0');
  await pool.query('TRUNCATE TABLE todo_parents');
  await pool.query('TRUNCATE TABLE todo_tags');
  await pool.query('TRUNCATE TABLE tags');
  await pool.query('TRUNCATE TABLE todos');
  await pool.query('TRUNCATE TABLE folders');
  await pool.query('TRUNCATE TABLE users');
  await pool.query('SET FOREIGN_KEY_CHECKS = 1');
});

// Une fois que TOUS les tests sont finis, on ferme le pool pour libérer le script Jest
afterAll(async () => {
  await pool.end();
});