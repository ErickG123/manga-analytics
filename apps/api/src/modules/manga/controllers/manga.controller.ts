import type { FastifyReply, FastifyRequest } from 'fastify';
import { MangaService } from '../services/manga.service.js';
import type { MangaQueryParams } from '../models/manga.model.js';

export class MangaController {
  constructor(private readonly service = new MangaService()) {}

  async list(req: FastifyRequest, reply: FastifyReply) {
    const params = req.query as MangaQueryParams;
    const result = await this.service.list(params);
    return reply.send(result);
  }

  async getByIdentifier(req: FastifyRequest, reply: FastifyReply) {
    const { identifier } = req.params as { identifier: string };
    const manga = await this.service.getByIdentifier(identifier);
    if (!manga) {
      return reply.notFound('Obra não encontrada');
    }
    return reply.send(manga);
  }
}
