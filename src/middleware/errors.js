const { HttpError } = require('../errors');

function notFound(req, _res, next) {
  next(new HttpError(404, `Route ${req.method} ${req.originalUrl} was not found`));
}

function errorHandler(error, _req, res, _next) {
  if (error.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ error: { message: 'A record with that value already exists' } });
  }

  const status = error.status || 500;
  const body = { error: { message: status === 500 ? 'Internal server error' : error.message } };
  if (error.details) body.error.details = error.details;
  if (status === 500 && process.env.NODE_ENV !== 'production') body.error.details = error.message;
  return res.status(status).json(body);
}

module.exports = { notFound, errorHandler };
