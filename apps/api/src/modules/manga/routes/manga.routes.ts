import type { FastifyInstance } from 'fastify';
import { MangaController } from '../controllers/manga.controller.js';

export async function registerMangaRoutes(app: FastifyInstance) {
  const controller = new MangaController();

  app.get('/api/v1/mangas/facets', controller.facets.bind(controller));
  app.get('/api/v1/mangas', controller.list.bind(controller));
  app.get('/api/v1/mangas/:identifier', controller.getByIdentifier.bind(controller));
}
