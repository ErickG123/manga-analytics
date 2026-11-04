import cors from '@fastify/cors';
import type { FastifyInstance } from 'fastify';

export async function registerCorsPlugin(app: FastifyInstance) {
  await app.register(cors, {
    origin: process.env.CORS_ORIGIN || 'http://localhost:4200',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });
}
