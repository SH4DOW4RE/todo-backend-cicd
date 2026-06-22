const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { corsOrigin } = require('./config');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const todoRoutes = require('./routes/todos');
const folderRoutes = require('./routes/folders');
const { notFound, errorHandler } = require('./middleware/errors');

const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: corsOrigin === '*' ? true : corsOrigin }));
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/auth', authRoutes);
app.use('/users', userRoutes);
app.use('/folders', folderRoutes);
app.use('/todos', todoRoutes);
app.use(notFound);
app.use(errorHandler);

module.exports = app;
