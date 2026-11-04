import sensible from '@fastify/sensible';
import type { FastifyInstance } from 'fastify';

export async function registerSensiblePlugin(app: FastifyInstance) {
  await app.register(sensible);
}
