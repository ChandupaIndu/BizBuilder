const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('./config');
const fs = require('node:fs');
const path = require('node:path');
const defaultPrisma = require('./lib/prisma');
const { AppError, notFound, errorHandler } = require('./middleware/errors');
const { requireAuth } = require('./middleware/auth');
const { body } = require('./middleware/validate');
const { toSlug } = require('./utils/slug');

function createApp(prisma = defaultPrisma) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: config.corsOrigins, methods: ['GET', 'POST', 'PATCH', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization'] }));
  app.use(express.json({ limit: '1mb' }));
  app.use((req, res, next) => {
    const started = Date.now();
    res.on('finish', () => console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - started}ms`));
    next();
  });

  const api = express.Router();
  const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });
  const protectedRoute = [requireAuth];
  const businessForUser = async (businessId, userId) => {
    const business = await prisma.business.findFirst({ where: { id: businessId, ownerId: userId } });
    if (!business) throw new AppError(404, 'Business not found', 'NOT_FOUND');
    return business;
  };
  const websiteForUser = async (websiteId, userId) => {
    const website = await prisma.website.findFirst({
      where: { id: websiteId, business: { ownerId: userId } },
      include: { business: true },
    });
    if (!website) throw new AppError(404, 'Website not found', 'NOT_FOUND');
    return website;
  };
  const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

  api.get('/health', (req, res) => ok(res, { status: 'ok', service: 'bizbuilder-api', timestamp: new Date().toISOString() }));
  api.get('/docs/openapi.yaml', (req, res) => res.type('text/yaml').send(fs.readFileSync(path.join(__dirname, '..', 'openapi.yaml'), 'utf8')));
  api.get('/docs', (req, res) => res.type('html').send(`<!doctype html><html><head><title>BizBuilder API docs</title><link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"></head><body><div id="swagger-ui"></div><script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script><script>SwaggerUIBundle({url:'/api/docs/openapi.yaml',dom_id:'#swagger-ui'});</script></body></html>`));

  api.post('/auth/register', body(['name', 'email', 'password']), asyncRoute(async (req, res) => {
    const { name, email, password } = req.body;
    if (name.trim().length > 100 || !/^\S+@\S+\.\S+$/.test(email) || email.length > 254 || password.length < 8 || password.length > 72) {
      throw new AppError(400, 'Provide a name, valid email, and password between 8 and 72 characters', 'VALIDATION_ERROR');
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (await prisma.user.findUnique({ where: { email: normalizedEmail } })) {
      throw new AppError(409, 'An account with that email already exists', 'EMAIL_IN_USE');
    }
    const user = await prisma.user.create({ data: { name: name.trim(), email: normalizedEmail, passwordHash: await bcrypt.hash(password, 12) } });
    const token = jwt.sign({ sub: user.id, email: user.email }, config.jwtSecret || 'development-only-secret-change-me', { expiresIn: config.jwtExpiresIn });
    return ok(res, { user: { id: user.id, name: user.name, email: user.email }, token }, 201);
  }));

  api.post('/auth/login', body(['email', 'password']), asyncRoute(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { email: req.body.email.trim().toLowerCase() } });
    if (!user || !(await bcrypt.compare(req.body.password, user.passwordHash))) {
      throw new AppError(401, 'Email or password is incorrect', 'INVALID_CREDENTIALS');
    }
    const token = jwt.sign({ sub: user.id, email: user.email }, config.jwtSecret || 'development-only-secret-change-me', { expiresIn: config.jwtExpiresIn });
    return ok(res, { user: { id: user.id, name: user.name, email: user.email }, token });
  }));

  api.get('/auth/me', ...protectedRoute, asyncRoute(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user.sub }, select: { id: true, name: true, email: true, createdAt: true } });
    if (!user) throw new AppError(401, 'Account no longer exists', 'UNAUTHENTICATED');
    return ok(res, { user });
  }));

  api.post('/businesses', ...protectedRoute, body(['name'], ['description', 'category', 'email', 'phone']), asyncRoute(async (req, res) => {
    if (req.body.email && !/^\S+@\S+\.\S+$/.test(req.body.email)) throw new AppError(400, 'email must be a valid email address', 'VALIDATION_ERROR');
    return ok(res, await prisma.business.create({ data: { ...req.body, name: req.body.name.trim(), ownerId: req.user.sub } }), 201);
  }));
  api.get('/businesses', ...protectedRoute, asyncRoute(async (req, res) => {
    return ok(res, await prisma.business.findMany({ where: { ownerId: req.user.sub }, include: { website: { include: { pages: { orderBy: { sortOrder: 'asc' } } } }, _count: { select: { products: true } } }, orderBy: { createdAt: 'desc' } }));
  }));
  api.get('/businesses/:businessId', ...protectedRoute, asyncRoute(async (req, res) => {
    await businessForUser(req.params.businessId, req.user.sub);
    return ok(res, await prisma.business.findFirst({ where: { id: req.params.businessId, ownerId: req.user.sub }, include: { website: { include: { pages: { orderBy: { sortOrder: 'asc' } } } }, products: true } }));
  }));
  api.post('/businesses/:businessId/websites', ...protectedRoute, body(['name'], ['template', 'slug']), asyncRoute(async (req, res) => {
    await businessForUser(req.params.businessId, req.user.sub);
    if (req.body.template && !['starter', 'studio', 'market'].includes(req.body.template)) throw new AppError(400, 'template must be starter, studio, or market', 'VALIDATION_ERROR');
    const website = await prisma.website.create({ data: {
      businessId: req.params.businessId, name: req.body.name.trim(), template: req.body.template || 'starter',
      slug: toSlug(req.body.slug || req.body.name), pages: { create: [{ title: 'Home', slug: 'home', sortOrder: 0, content: '' }] },
    }, include: { pages: true } });
    return ok(res, website, 201);
  }));
  api.get('/businesses/:businessId/websites', ...protectedRoute, asyncRoute(async (req, res) => {
    await businessForUser(req.params.businessId, req.user.sub);
    return ok(res, await prisma.website.findMany({ where: { businessId: req.params.businessId }, include: { pages: { orderBy: { sortOrder: 'asc' } } }, orderBy: { createdAt: 'desc' } }));
  }));
  api.post('/websites/:websiteId/pages', ...protectedRoute, body(['title'], ['slug', 'content']), asyncRoute(async (req, res) => {
    const website = await websiteForUser(req.params.websiteId, req.user.sub);
    const slug = toSlug(req.body.slug || req.body.title);
    const page = await prisma.websitePage.create({ data: { websiteId: website.id, title: req.body.title.trim(), slug, content: req.body.content || '', sortOrder: await prisma.websitePage.count({ where: { websiteId: website.id } }) } });
    return ok(res, page, 201);
  }));
  api.get('/websites/:websiteId/pages', ...protectedRoute, asyncRoute(async (req, res) => {
    const website = await websiteForUser(req.params.websiteId, req.user.sub);
    return ok(res, await prisma.websitePage.findMany({ where: { websiteId: website.id }, orderBy: { sortOrder: 'asc' } }));
  }));
  api.patch('/websites/:websiteId/pages/:pageId', ...protectedRoute, body([], ['title', 'content']), asyncRoute(async (req, res) => {
    const website = await websiteForUser(req.params.websiteId, req.user.sub);
    if (!Object.keys(req.body).length) throw new AppError(400, 'Provide a title or content to update', 'VALIDATION_ERROR');
    const page = await prisma.websitePage.findFirst({ where: { id: req.params.pageId, websiteId: website.id }, select: { id: true } });
    if (!page) throw new AppError(404, 'Page not found', 'NOT_FOUND');
    const data = {};
    if (req.body.title !== undefined) data.title = req.body.title.trim();
    if (req.body.content !== undefined) data.content = req.body.content;
    if (data.title === '') throw new AppError(400, 'title cannot be empty', 'VALIDATION_ERROR');
    return ok(res, await prisma.websitePage.update({ where: { id: page.id }, data }));
  }));
  api.post('/businesses/:businessId/products', ...protectedRoute, body(['name'], ['description', 'price', 'type']), asyncRoute(async (req, res) => {
    await businessForUser(req.params.businessId, req.user.sub);
    if (req.body.type && !['product', 'service'].includes(req.body.type)) throw new AppError(400, 'type must be product or service', 'VALIDATION_ERROR');
    let price;
    if (req.body.price !== undefined) {
      if (String(req.body.price).trim() === '') throw new AppError(400, 'price must be a non-negative number', 'VALIDATION_ERROR');
      price = Number(req.body.price);
      if (!Number.isFinite(price) || price < 0) throw new AppError(400, 'price must be a non-negative number', 'VALIDATION_ERROR');
    }
    return ok(res, await prisma.product.create({ data: { businessId: req.params.businessId, name: req.body.name.trim(), description: req.body.description, type: req.body.type || 'product', price } }), 201);
  }));
  api.get('/businesses/:businessId/products', ...protectedRoute, asyncRoute(async (req, res) => {
    await businessForUser(req.params.businessId, req.user.sub);
    return ok(res, await prisma.product.findMany({ where: { businessId: req.params.businessId }, orderBy: { createdAt: 'desc' } }));
  }));
  api.patch('/websites/:websiteId/publish', ...protectedRoute, asyncRoute(async (req, res) => {
    await websiteForUser(req.params.websiteId, req.user.sub);
    const website = await prisma.website.update({ where: { id: req.params.websiteId }, data: { status: 'PUBLISHED' } });
    return ok(res, website);
  }));
  api.patch('/websites/:websiteId/unpublish', ...protectedRoute, asyncRoute(async (req, res) => {
    await websiteForUser(req.params.websiteId, req.user.sub);
    return ok(res, await prisma.website.update({ where: { id: req.params.websiteId }, data: { status: 'DRAFT' } }));
  }));
  api.get('/public/sites/:slug', asyncRoute(async (req, res) => {
    const site = await prisma.website.findFirst({ where: { slug: req.params.slug, status: 'PUBLISHED' }, select: {
      id: true, name: true, slug: true, template: true, business: { select: { name: true, description: true, category: true, email: true, phone: true, products: { where: { isActive: true }, select: { id: true, name: true, description: true, price: true, type: true } } } },
      pages: { select: { id: true, title: true, slug: true, content: true, sortOrder: true }, orderBy: { sortOrder: 'asc' } },
    } });
    if (!site) throw new AppError(404, 'Published website not found', 'NOT_FOUND');
    return ok(res, site);
  }));

  app.use('/api', api);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
