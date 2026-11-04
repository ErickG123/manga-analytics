import type { FastifyInstance } from 'fastify';
import { AppDataSource } from '../../config/data-source.js';

export async function registerHealthRoutes(app: FastifyInstance) {
  app.get('/api/v1/health', async () => {
    return {
      status: 'ok',
      database: AppDataSource.isInitialized ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString(),
    };
  });
}
