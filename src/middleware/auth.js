const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../config');
const { HttpError } = require('../errors');

function authenticate(req, _res, next) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) return next(new HttpError(401, 'A Bearer token is required'));

  try {
    const payload = jwt.verify(token, jwtSecret);
    req.user = { id: Number(payload.sub) };
    return next();
  } catch (_error) {
    return next(new HttpError(401, 'The access token is invalid or expired'));
  }
}

module.exports = authenticate;
