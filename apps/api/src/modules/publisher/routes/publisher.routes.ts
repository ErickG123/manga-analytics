import type { FastifyInstance } from 'fastify';
import { PublisherController } from '../controllers/publisher.controller.js';

export async function registerPublisherRoutes(app: FastifyInstance) {
  const controller = new PublisherController();
  app.get('/api/v1/publishers', controller.list.bind(controller));
}
