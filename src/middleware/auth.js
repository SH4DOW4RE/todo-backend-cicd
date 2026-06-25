const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../config');
const { HttpError } = require('../errors');

/**
 * Middleware d'authentification par JWT
 */
function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];

  // 1. Vérification de la présence du header Authorization
  if (!authHeader?.startsWith('Bearer ')) {
    throw new HttpError(401, 'Access denied. No token provided.');
  }

  // Extraction du token
  const token = authHeader.split(' ')[1];

  try {
    // 2. Vérification et décodage du token JWT
    const decoded = jwt.verify(token, jwtSecret || 'super-secret-de-test-pour-la-ci');

    // 3. Injection de l'utilisateur dans la requête (en récupérant l'id depuis sub)
    req.user = {
      id: decoded.sub ? Number.parseInt(decoded.sub, 10) : null
    };

    if (!req.user.id) {
      throw new HttpError(401, 'Invalid token.');
    }

    next();
  } catch (error) {
    // Si c'est déjà un HttpError, on le propage, sinon on lève une erreur de jeton invalide
    if (error instanceof HttpError) {
      throw error;
    }
    throw new HttpError(401, 'Invalid token.');
  }
}

// L'export par défaut indispensable pour router.use(authenticate)
module.exports = authMiddleware;
