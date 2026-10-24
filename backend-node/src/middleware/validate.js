const { AppError } = require('./errors');
const MAX_LENGTHS = { name: 120, email: 254, password: 72, description: 2000, category: 80, phone: 40, template: 40, slug: 60, title: 120, content: 20000, type: 40 };

function body(required, optional = []) {
  return (req, res, next) => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return next(new AppError(400, 'A JSON object is required', 'VALIDATION_ERROR'));
    }
    const allowed = new Set([...required, ...optional]);
    const unknown = Object.keys(req.body).filter((key) => !allowed.has(key));
    if (unknown.length) return next(new AppError(400, `Unexpected field: ${unknown[0]}`, 'VALIDATION_ERROR'));
    for (const [key, value] of Object.entries(req.body)) {
      const isPrice = key === 'price' && (typeof value === 'number' || typeof value === 'string');
      if (typeof value !== 'string' && !isPrice) return next(new AppError(400, `${key} must be a string`, 'VALIDATION_ERROR'));
      if (typeof value === 'string' && value.length > (MAX_LENGTHS[key] || 2000)) {
        return next(new AppError(400, `${key} is too long`, 'VALIDATION_ERROR'));
      }
    }
    for (const key of required) {
      if (typeof req.body[key] !== 'string' || !req.body[key].trim()) {
        return next(new AppError(400, `${key} is required`, 'VALIDATION_ERROR'));
      }
    }
    return next();
  };
}

function length(field, max) {
  return (req, res, next) => {
    const value = req.body?.[field];
    if (typeof value === 'string' && value.length > max) {
      return next(new AppError(400, `${field} must be ${max} characters or fewer`, 'VALIDATION_ERROR'));
    }
    return next();
  };
}

module.exports = { body, length };
