const express = require('express');
const path = require('node:path');
const { openDatabase } = require('./db');
const { HttpError } = require('./validate');
const requireAuthFactory = require('./middleware/requireAuth');
const authRoutes = require('./routes/auth');
const projectRoutes = require('./routes/projects');

function createApp({ dbFile } = {}) {
  const { db } = openDatabase(dbFile);
  const requireAuth = requireAuthFactory(db);
  const app = express();
  app.locals.db = db;

  app.use(express.json({ limit: '50kb' }));
  // A JSON body must be an object so routes can destructure it safely.
  app.use('/api', (req, res, next) => {
    if (req.body === undefined || req.body === null || typeof req.body !== 'object' || Array.isArray(req.body)) {
      req.body = {};
    }
    next();
  });

  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
  app.use('/api/auth', authRoutes(db, requireAuth));
  app.use('/api/projects', requireAuth, projectRoutes(db));
  app.use('/api', (req, res, next) => next(new HttpError(404, 'Not found')));

  app.use(express.static(path.join(__dirname, '..', 'public')));

  // Central error handler: every API error is JSON with the right status code.
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') err = new HttpError(400, 'Request body is not valid JSON');
    else if (err.type === 'entity.too.large') err = new HttpError(413, 'Request body is too large');
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({
      error: status >= 500 ? 'Internal server error' : err.message,
      ...(err.details ? { details: err.details } : {}),
    });
  });

  return app;
}

module.exports = { createApp };
