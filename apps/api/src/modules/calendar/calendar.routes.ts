import { AppDataSource } from '../../config/data-source.js';
import { Volume } from '../../entities/index.js';
import type { CalendarFilterParams, CalendarReleaseDto } from './models/calendar.model.js';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

export async function registerCalendarRoutes(app: FastifyInstance) {
  const volumeRepo = AppDataSource.getRepository(Volume);

  app.get('/api/v1/releases', async (req: FastifyRequest, reply: FastifyReply) => {
    const query = req.query as CalendarFilterParams;

    const qb = volumeRepo
      .createQueryBuilder('volume')
      .leftJoinAndSelect('volume.edition', 'edition')
      .leftJoinAndSelect('edition.manga', 'manga')
      .leftJoinAndSelect('edition.publisher', 'publisher')
      .leftJoinAndSelect('volume.prices', 'price');

    if (query.year) {
      qb.andWhere('volume.releaseYear = :y', { y: parseInt(query.year, 10) });
    }
    if (query.month) {
      qb.andWhere('volume.releaseMonth = :m', { m: parseInt(query.month, 10) });
    }
    if (query.publisher) {
      qb.andWhere('publisher.slug = :pub OR publisher.name = :pub', { pub: query.publisher });
    }
    if (query.status) {
      qb.andWhere('volume.releaseStatus = :st', { st: query.status });
    }

    qb.orderBy('volume.releaseYear', 'ASC', 'NULLS LAST');
    qb.addOrderBy('volume.releaseMonth', 'ASC', 'NULLS LAST');
    qb.addOrderBy('volume.releaseDay', 'ASC', 'NULLS LAST');

    const volumes = await qb.getMany();

    const data: CalendarReleaseDto[] = volumes.map((v) => ({
      id: v.id,
      slug: v.edition.manga.slug,
      title: v.edition.manga.title,
      publisher: v.edition.publisher.name,
      number: v.number,
      date: v.releaseDate || '—',
      status: v.releaseStatus,
      price: v.prices?.[0]?.amount ? parseFloat(v.prices[0].amount) : null,
      coverUrl: v.coverUrl || v.edition.manga.coverUrl,
    }));

    return reply.send(data);
  });
}
