const mysql = require('mysql2/promise');
const { db } = require('./config');

const pool = mysql.createPool({
  ...db,
  waitForConnections: true,
  enableKeepAlive: true,
  timezone: 'Z',
  namedPlaceholders: true,
  decimalNumbers: true
});

module.exports = pool;
