const app = require('./app');
const pool = require('./db');
const { host, port } = require('./config');

async function start() {
  await pool.query('SELECT 1');
  const server = app.listen(port, host, () => {
    console.log(`Todo API listening on http://${host}:${port}`);
  });

  async function shutdown(signal) {
    console.log(`${signal} received, shutting down`);
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((error) => {
  console.error('Unable to start server:', error.message);
  process.exit(1);
});
