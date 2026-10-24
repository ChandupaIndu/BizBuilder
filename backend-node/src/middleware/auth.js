const jwt = require('jsonwebtoken');
const config = require('../config');
const { AppError } = require('./errors');

function requireAuth(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return next(new AppError(401, 'Authentication is required', 'UNAUTHENTICATED'));
  try {
    req.user = jwt.verify(token, config.jwtSecret || 'development-only-secret-change-me');
    return next();
  } catch {
    return next(new AppError(401, 'Token is invalid or expired', 'UNAUTHENTICATED'));
  }
}

module.exports = { requireAuth };
