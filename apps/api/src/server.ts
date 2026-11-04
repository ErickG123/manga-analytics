import { buildApp } from './app.js';

async function start() {
  const app = await buildApp();
  const port = parseInt(process.env.API_PORT || '3333', 10);
  const host = process.env.API_HOST || '0.0.0.0';

  try {
    await app.listen({ port, host });
    console.log(`🚀 Fastify API rodando em http://localhost:${port}`);
    console.log(`📚 Swagger documentation disponível em http://localhost:${port}/docs`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
