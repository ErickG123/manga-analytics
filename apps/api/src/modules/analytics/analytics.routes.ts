import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AppDataSource } from '../../config/data-source.js';
import { Manga, Publisher, Volume, VolumePrice, Edition } from '../../entities/index.js';
import type {
  AnalyticsOverviewDto,
  MangaPriceAvgDto,
  PublisherPriceAvgDto,
  ReleaseMonthAggregateDto,
} from './models/analytics.model.js';

export async function registerAnalyticsRoutes(app: FastifyInstance) {
  const mangaRepo = AppDataSource.getRepository(Manga);
  const publisherRepo = AppDataSource.getRepository(Publisher);
  const volumeRepo = AppDataSource.getRepository(Volume);
  const priceRepo = AppDataSource.getRepository(VolumePrice);
  const editionRepo = AppDataSource.getRepository(Edition);

  app.get('/api/v1/analytics/overview', async (_req: FastifyRequest, reply: FastifyReply) => {
    const totalMangas = await mangaRepo.count();
    const totalVolumes = await volumeRepo.count();
    const totalPublishers = await publisherRepo.count();

    const prices = await priceRepo.find();
    const sum = prices.reduce((acc, p) => acc + parseFloat(p.amount), 0);
    const averagePrice = prices.length > 0 ? sum / prices.length : 0;

    const data: AnalyticsOverviewDto = {
      totalMangas,
      totalVolumes,
      totalPublishers,
      averagePrice: Math.round(averagePrice * 100) / 100,
    };
    return reply.send(data);
  });

  // 1. Evolução anual do preço médio por ano
  app.get<{
    Querystring: { publisherId?: string; yearFrom?: string; yearTo?: string };
  }>('/api/v1/analytics/prices/by-year', async (req, reply) => {
    const qb = volumeRepo
      .createQueryBuilder('v')
      .innerJoin('v.prices', 'p')
      .innerJoin('v.edition', 'e')
      .select('v.releaseYear', 'year')
      .addSelect('AVG(CAST(p.amount AS numeric))', 'avgPrice')
      .addSelect('COUNT(DISTINCT v.id)', 'volumesCount')
      .where('v.releaseYear IS NOT NULL AND v.releaseYear > 1990')
      .groupBy('v.releaseYear')
      .orderBy('v.releaseYear', 'ASC');

    if (req.query.publisherId) {
      qb.andWhere('e.publisherId = :publisherId', { publisherId: req.query.publisherId });
    }
    if (req.query.yearFrom) {
      qb.andWhere('v.releaseYear >= :yearFrom', { yearFrom: parseInt(req.query.yearFrom, 10) });
    }
    if (req.query.yearTo) {
      qb.andWhere('v.releaseYear <= :yearTo', { yearTo: parseInt(req.query.yearTo, 10) });
    }

    const rows = await qb.getRawMany();
    const result = rows.map((r) => ({
      year: parseInt(r.year, 10),
      averagePrice: Math.round(parseFloat(r.avgPrice) * 100) / 100,
      volumesCount: parseInt(r.volumesCount, 10),
    }));

    return reply.send(result);
  });

  // 2. Preço médio por página (excluindo volumes com páginas ausentes ou <= 0)
  app.get('/api/v1/analytics/prices/by-page', async (_req, reply) => {
    const qb = volumeRepo
      .createQueryBuilder('v')
      .innerJoin('v.prices', 'p')
      .innerJoin('v.edition', 'e')
      .innerJoin('e.publisher', 'pub')
      .select('pub.name', 'publisher')
      .addSelect('AVG(CAST(p.amount AS numeric) / v.pages)', 'avgPricePerPage')
      .addSelect('AVG(v.pages)', 'avgPages')
      .addSelect('COUNT(DISTINCT v.id)', 'sampleSize')
      .where('v.pages IS NOT NULL AND v.pages > 20')
      .groupBy('pub.name')
      .orderBy('pub.name', 'ASC');

    const rows = await qb.getRawMany();
    const result = rows.map((r) => ({
      publisher: r.publisher,
      avgPricePerPage: Math.round(parseFloat(r.avgPricePerPage) * 1000) / 1000,
      avgPages: Math.round(parseFloat(r.avgPages)),
      sampleSize: parseInt(r.sampleSize, 10),
    }));

    return reply.send(result);
  });

  // 3. Evolução de volumes e preços por obra específica
  app.get<{ Params: { mangaId: string } }>(
    '/api/v1/analytics/manga/:mangaId/evolution',
    async (req, reply) => {
      const editions = await editionRepo.find({
        where: { mangaId: req.params.mangaId },
        relations: {
          volumes: {
            prices: true,
          },
        },
      });

      const volumesList = editions
        .flatMap((e) => e.volumes)
        .sort((a, b) => a.number - b.number)
        .map((v) => {
          const mainPrice = v.prices[0] ? parseFloat(v.prices[0].amount) : null;
          return {
            volumeId: v.id,
            number: v.number,
            title: v.title,
            releaseDate: v.releaseDate,
            price: mainPrice,
            pages: v.pages,
          };
        });

      return reply.send({
        mangaId: req.params.mangaId,
        volumes: volumesList,
      });
    },
  );

  app.get(
    '/api/v1/analytics/prices/by-manga',
    async (_req: FastifyRequest, reply: FastifyReply) => {
      const mangas = await mangaRepo.find({
        relations: {
          editions: {
            volumes: {
              prices: true,
            },
          },
        },
      });

      const data: MangaPriceAvgDto[] = mangas.map((m) => {
        const vols = m.editions.flatMap((e) => e.volumes);
        const prices = vols.flatMap((v) => v.prices.map((p) => parseFloat(p.amount)));
        const avg = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
        return {
          id: m.id,
          title: m.title,
          slug: m.slug,
          averagePrice: Math.round(avg * 100) / 100,
          volumesCount: vols.length,
        };
      });
      return reply.send(data);
    },
  );

  app.get(
    '/api/v1/analytics/prices/by-publisher',
    async (_req: FastifyRequest, reply: FastifyReply) => {
      const publishers = await publisherRepo.find({
        relations: {
          editions: {
            volumes: {
              prices: true,
            },
          },
        },
      });

      const data: PublisherPriceAvgDto[] = publishers.map((p) => {
        const vols = p.editions.flatMap((e) => e.volumes);
        const prices = vols.flatMap((v) => v.prices.map((pr) => parseFloat(pr.amount)));
        const avg = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
        return {
          id: p.id,
          name: p.name,
          slug: p.slug,
          averagePrice: Math.round(avg * 100) / 100,
          volumesCount: vols.length,
        };
      });
      return reply.send(data);
    },
  );

  app.get(
    '/api/v1/analytics/releases/by-month',
    async (_req: FastifyRequest, reply: FastifyReply) => {
      const qb = volumeRepo
        .createQueryBuilder('v')
        .select('v.releaseYear', 'year')
        .addSelect('v.releaseMonth', 'month')
        .addSelect('COUNT(v.id)', 'count')
        .where('v.releaseYear IS NOT NULL AND v.releaseMonth IS NOT NULL')
        .groupBy('v.releaseYear')
        .addGroupBy('v.releaseMonth')
        .orderBy('v.releaseYear', 'ASC')
        .addOrderBy('v.releaseMonth', 'ASC');

      const rows = await qb.getRawMany();
      const data: ReleaseMonthAggregateDto[] = rows.map((r) => ({
        year: parseInt(r.year, 10),
        month: parseInt(r.month, 10),
        label: `${String(r.month).padStart(2, '0')}/${r.year}`,
        count: parseInt(r.count, 10),
      }));
      return reply.send(data);
    },
  );
}
