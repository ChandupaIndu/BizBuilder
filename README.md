# BizBuilder

BizBuilder is an initial multi-tenant website builder MVP. The active stack is a React + TypeScript + Vite frontend, an Express API in CommonJS, and PostgreSQL through Prisma. No Spring Boot or Maven code was present in this checkout. The supplied project brief ended mid-step at “Add Postgre…”, after its complete feature requirements.

## Repository layout

- `backend-node/` — Express API, Prisma schema, OpenAPI document
- `frontend/` — Vite application
- `backend-node/backend-node/` — original duplicate starter manifest and lockfile retained from the checkout

## Requirements

- Node.js 20+ and npm
- PostgreSQL 14+

## Run locally

1. Create a PostgreSQL database named `bizbuilder`.
2. Copy `backend-node/.env.example` to `backend-node/.env` and set `DATABASE_URL` plus a random `JWT_SECRET` (at least 32 characters for production).
3. Install and initialize the backend:

   ```sh
   cd backend-node
   npm install
   npx prisma migrate dev --name initial
   npm run dev
   ```

4. In another terminal, install and start the frontend:

   ```sh
   cd frontend
   npm install
   npm run dev
   ```

The API listens on `http://localhost:4000/api`; Vite runs on `http://localhost:5173`. Health check: `GET /api/health`. Set `VITE_API_URL` to change the frontend API URL. Configure comma-separated allowed browser origins with `CORS_ORIGINS`.

## API and data isolation

All API results use `{ "success": true, "data": ... }`; errors use `{ "success": false, "error": { "code", "message" } }`. Registration and login return a bearer JWT. Private routes require `Authorization: Bearer <token>`. A business is scoped by its owner on every route; nested website access checks ownership through its business. Product and page records are created only after the same ownership check. The public `GET /api/public/sites/:slug` response is available only for published websites and selects public business fields, pages, and active products.

The API schema is in `backend-node/openapi.yaml`, with Swagger UI at `GET /api/docs` and the raw schema at `GET /api/docs/openapi.yaml`. WSO2 is a planned deployment layer and is not configured here. For a gateway demonstration, import this OpenAPI definition in API Manager, configure the backend as the Express service (`http://<service-host>:4000/api`), publish a versioned context such as `/bizbuilder/v1`, create an application and subscribe it to a tier, and route client traffic through the gateway URL. Configure JWT validation or gateway OAuth policy and rate limits on that API; use the API Manager analytics view to demonstrate request volume, errors, latency, and throttling. The local app calls Express directly for development. A gateway demonstration must point its frontend/API client at the gateway URL rather than bypassing it. Published site content is viewable at `/s/:slug` in the frontend; drafts return 404 on the public API.

## Scripts and tests

- `npm run dev` — development server with nodemon
- `npm start` — production process
- `npm test` — backend unit/integration tests
- `npx prisma migrate dev --name <migration>` — create/apply migrations
- `npx prisma generate` — regenerate Prisma client
- `backend-node/postman/BizBuilder.postman_collection.json` — importable API smoke flow

Never commit `.env` files or production secrets. `.env.example` contains placeholders only.
