const authMiddleware = require('../../src/middleware/auth');
const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../../src/config');

describe('Auth Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = { headers: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    next = jest.fn();
  });

  it('should return 401 if no Authorization header is provided', () => {
    try {
      authMiddleware(req, res, next);
    } catch (err) {
      if (err.status === 401) return;
    }
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('should return 401 if token is invalid or expired', () => {
    req.headers['authorization'] = 'Bearer invalid-token';
    try {
      authMiddleware(req, res, next);
    } catch (err) {
      if (err.status === 401) return;
    }
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('should call next() and populate req.user if token is valid', () => {
    const userId = '1';
    const token = jwt.sign({}, jwtSecret || 'super-secret-de-test-pour-la-ci', { subject: userId });
    req.headers['authorization'] = `Bearer ${token}`;

    authMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toBeDefined();
    expect(String(req.user.id)).toBe(userId);
  });
});