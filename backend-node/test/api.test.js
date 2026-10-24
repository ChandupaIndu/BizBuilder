const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { createApp } = require('../src/app');

const users = new Map();
const businesses = new Map();
const websites = new Map();
const products = new Map();
let app;
let server;
const prisma = {
  user: {
    findUnique: async ({ where }) => [...users.values()].find((user) => user.email === where.email || user.id === where.id) || null,
    create: async ({ data }) => { const user = { ...data, id: `u${users.size + 1}`, createdAt: new Date() }; users.set(user.id, user); return user; },
  },
  business: {
    create: async ({ data }) => { const value = { ...data, id: `b${businesses.size + 1}` }; businesses.set(value.id, value); return value; },
    findMany: async ({ where }) => [...businesses.values()].filter((item) => item.ownerId === where.ownerId).map((b) => ({ ...b, website: [], _count: { products: 0 } })),
    findFirst: async ({ where }) => [...businesses.values()].find((item) => item.id === where.id && (!where.ownerId || item.ownerId === where.ownerId)) || null,
  },
  website: {
    create: async ({ data }) => { const value = { ...data, status: data.status || 'DRAFT', id: `w${websites.size + 1}`, pages: [] }; websites.set(value.id, value); return value; },
    findFirst: async ({ where }) => {
      if (where.slug) {
        const value = [...websites.values()].find((site) => site.slug === where.slug && (!where.status || site.status === where.status));
        if (!value) return null;
        const business = businesses.get(value.businessId);
        return { ...value, pages: [], business: { name: business.name, description: business.description, category: business.category, email: business.email, phone: business.phone, products: [] } };
      }
      const value = websites.get(where.id); const business = value && businesses.get(value.businessId); return value && business?.ownerId === where.business.ownerId ? { ...value, business } : null;
    },
    update: async ({ where, data }) => { const value = { ...websites.get(where.id), ...data }; websites.set(where.id, value); return value; },
  },
  websitePage: { count: async () => 0, create: async ({ data }) => ({ ...data, id: `page${Date.now()}` }), findFirst: async () => null, findMany: async () => [], update: async ({ where, data }) => ({ id: where.id, ...data }) },
  product: { create: async ({ data }) => { const value = { ...data, id: `p${products.size + 1}` }; products.set(value.id, value); return value; }, findMany: async ({ where }) => [...products.values()].filter((p) => p.businessId === where.businessId) },
};

before(() => { app = createApp(prisma); server = app.listen(0); });
after(() => server.close());

async function register(name, email) {
  const response = await request(server).post('/api/auth/register').send({ name, email, password: 'secure-pass-123' });
  assert.equal(response.status, 201);
  return response.body.data.token;
}

test('health responds with the standard success envelope', async () => {
  const response = await request(server).get('/api/health');
  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.data.status, 'ok');
});

test('unknown routes use the JSON 404 response', async () => {
  const response = await request(server).get('/api/not-a-route');
  assert.equal(response.status, 404);
  assert.equal(response.body.success, false);
  assert.equal(response.body.error.code, 'NOT_FOUND');
});

test('registration hashes password; login rejects invalid credentials and succeeds with valid ones', async () => {
  const response = await request(server).post('/api/auth/register').send({ name: 'Ari', email: 'ari@example.com', password: 'secure-pass-123' });
  assert.equal(response.status, 201);
  assert.equal(await bcrypt.compare('secure-pass-123', users.get('u1').passwordHash), true);
  assert.equal(response.body.data.user.passwordHash, undefined);
  const bad = await request(server).post('/api/auth/login').send({ email: 'ari@example.com', password: 'incorrect' });
  assert.equal(bad.status, 401);
  const good = await request(server).post('/api/auth/login').send({ email: 'ari@example.com', password: 'secure-pass-123' });
  assert.equal(good.status, 200);
});

test('validates registration and requires authentication for private routes', async () => {
  const invalid = await request(server).post('/api/auth/register').send({ name: 'Bad', email: 'nope', password: 'short' });
  assert.equal(invalid.status, 400);
  const malformed = await request(server).post('/api/auth/register').set('Content-Type', 'application/json').send('{"name":');
  assert.equal(malformed.status, 400);
  const unauthenticated = await request(server).get('/api/businesses');
  assert.equal(unauthenticated.status, 401);
});

test('reports missing database configuration as unavailable instead of a generic server error', async () => {
  const findUnique = prisma.user.findUnique;
  prisma.user.findUnique = async () => { throw new Error('Environment variable not found: DATABASE_URL'); };
  try {
    const response = await request(server).post('/api/auth/register').send({ name: 'No DB', email: 'no-db@example.test', password: 'secure-pass-123' });
    assert.equal(response.status, 503);
    assert.equal(response.body.error.code, 'DATABASE_UNAVAILABLE');
    assert.match(response.body.error.message, /DATABASE_URL/);
  } finally { prisma.user.findUnique = findUnique; }
});

test('business data and nested websites are isolated by owner', async () => {
  const tokenA = await register('Owner A', 'a@example.com');
  const tokenB = await register('Owner B', 'b@example.com');
  const business = await request(server).post('/api/businesses').set('Authorization', `Bearer ${tokenA}`).send({ name: 'A Shop' });
  const denied = await request(server).get(`/api/businesses/${business.body.data.id}`).set('Authorization', `Bearer ${tokenB}`);
  assert.equal(denied.status, 404);
  const site = await request(server).post(`/api/businesses/${business.body.data.id}/websites`).set('Authorization', `Bearer ${tokenA}`).send({ name: 'A Site' });
  const crossTenantPage = await request(server).post(`/api/websites/${site.body.data.id}/pages`).set('Authorization', `Bearer ${tokenB}`).send({ title: 'Private' });
  assert.equal(crossTenantPage.status, 404);
  const noCredentialList = await request(server).get('/api/businesses');
  assert.equal(noCredentialList.status, 401);
});

test('public website endpoint hides draft websites', async () => {
  const publisherToken = await register('Publisher', 'publisher@example.com');
  const businessResponse = await request(server).post('/api/businesses').set('Authorization', `Bearer ${publisherToken}`).send({ name: 'Draft Co' });
  const business = businessResponse.body.data;
  const site = await prisma.website.create({ data: { businessId: business.id, name: 'Draft', slug: 'draft-co' } });
  const response = await request(server).get(`/api/public/sites/${site.slug}`);
  assert.equal(response.status, 404);
  await prisma.website.update({ where: { id: site.id }, data: { status: 'PUBLISHED' } });
  const published = await request(server).get(`/api/public/sites/${site.slug}`);
  assert.equal(published.status, 200);
  assert.equal(published.body.data.business.name, 'Draft Co');
  assert.equal(published.body.data.business.ownerId, undefined);
});
