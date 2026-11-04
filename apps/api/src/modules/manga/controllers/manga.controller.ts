import type { FastifyReply, FastifyRequest } from 'fastify';
import { MangaService } from '../services/manga.service.js';
import type { MangaQueryParams } from '../models/manga.model.js';
import { AppDataSource } from '../../../config/data-source.js';
import { Edition, Manga } from '../../../entities/index.js';

export class MangaController {
  constructor(private readonly service = new MangaService()) {}

  async list(req: FastifyRequest, reply: FastifyReply) {
    const params = req.query as MangaQueryParams;
    const numericParams = [
      'page',
      'limit',
      'yearFrom',
      'yearTo',
      'volumesMin',
      'volumesMax',
    ] as const;
    for (const key of numericParams) {
      const value = params[key];
      if (value !== undefined && (!/^\d+$/.test(value) || Number(value) > 10000)) {
        return reply.badRequest(`Parâmetro ${key} deve ser um inteiro válido.`);
      }
    }
    if (params.limit && Number(params.limit) > 100) return reply.badRequest('limit máximo: 100.');
    if (params.page && Number(params.page) < 1)
      return reply.badRequest('page deve ser maior que zero.');
    if (params.yearFrom && params.yearTo && Number(params.yearFrom) > Number(params.yearTo)) {
      return reply.badRequest('yearFrom deve ser menor ou igual a yearTo.');
    }
    if (
      params.volumesMin &&
      params.volumesMax &&
      Number(params.volumesMin) > Number(params.volumesMax)
    ) {
      return reply.badRequest('volumesMin deve ser menor ou igual a volumesMax.');
    }
    for (const key of ['hasPrice', 'upcoming', 'hasCover'] as const) {
      if (params[key] !== undefined && !['true', 'false'].includes(params[key] as string)) {
        return reply.badRequest(`Parâmetro ${key} aceita apenas true ou false.`);
      }
    }
    const result = await this.service.list(params);
    return reply.send(result);
  }

  async facets(_req: FastifyRequest, reply: FastifyReply) {
    const [categories, statuses] = await Promise.all([
      AppDataSource.getRepository(Manga)
        .createQueryBuilder('manga')
        .select('DISTINCT manga.category', 'value')
        .where(`manga.category IS NOT NULL AND manga.category <> ''`)
        .orderBy('manga.category', 'ASC')
        .getRawMany<{ value: string }>(),
      AppDataSource.getRepository(Edition)
        .createQueryBuilder('edition')
        .select('DISTINCT edition.status', 'value')
        .where(`edition.status IS NOT NULL AND edition.status <> ''`)
        .orderBy('edition.status', 'ASC')
        .getRawMany<{ value: string }>(),
    ]);
    return reply.send({
      categories: categories.map((item) => item.value),
      statuses: statuses.map((item) => item.value),
    });
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
