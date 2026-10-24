const { createApp } = require('./app');
const prisma = require('./lib/prisma');
const config = require('./config');

const app = createApp(prisma);
const server = app.listen(config.port, () => console.log(`BizBuilder API listening on http://localhost:${config.port}`));

async function shutdown() {
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
