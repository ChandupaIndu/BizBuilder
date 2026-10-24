class AppError extends Error {
  constructor(status, message, code = 'REQUEST_ERROR') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function notFound(req, res, next) {
  next(new AppError(404, `Route ${req.method} ${req.originalUrl} was not found`, 'NOT_FOUND'));
}

function errorHandler(error, req, res, next) { // eslint-disable-line no-unused-vars
  if (res.headersSent) return next(error);
  if (error?.type === 'entity.too.large') {
    return res.status(413).json({ success: false, error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' } });
  }
  if (error?.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Request body must contain valid JSON' } });
  }
  if (error?.code === 'P2002') {
    return res.status(409).json({ success: false, error: { code: 'CONFLICT', message: 'A record with that value already exists' } });
  }
  if (error?.code === 'P2025') {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Record not found' } });
  }
  const missingDatabaseUrl = error?.message?.includes('Environment variable not found: DATABASE_URL');
  const databaseUnavailable = missingDatabaseUrl || ['P1001', 'P1002', 'P1003', 'P1017', 'P2024'].includes(error?.code);
  if (databaseUnavailable) {
    const message = missingDatabaseUrl
      ? 'Database configuration is missing. Set DATABASE_URL in backend-node/.env and start PostgreSQL before using accounts.'
      : 'The database is unavailable. Start PostgreSQL and check DATABASE_URL, then try again.';
    return res.status(503).json({ success: false, error: { code: 'DATABASE_UNAVAILABLE', message } });
  }
  const status = error.status || 500;
  const message = status >= 500 ? 'An unexpected error occurred' : error.message;
  if (status >= 500) console.error(error);
  return res.status(status).json({ success: false, error: { code: error.code || 'INTERNAL_ERROR', message } });
}

module.exports = { AppError, notFound, errorHandler };
