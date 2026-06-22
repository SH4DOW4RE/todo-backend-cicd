const fs = require('node:fs/promises');
const path = require('node:path');
const mysql = require('mysql2/promise');
const { db } = require('../config');

async function migrate() {
  const sql = await fs.readFile(path.join(__dirname, '../../database/schema.sql'), 'utf8');
  const { ...connectionOptions } = db;
  const connection = await mysql.createConnection({ ...connectionOptions, multipleStatements: true });
  try {
    await connection.query(sql);
    console.log('Database schema is up to date');
  } finally {
    await connection.end();
  }
}

migrate().catch((error) => {
  console.error('Migration failed:', error.message);
  process.exit(1);
});
