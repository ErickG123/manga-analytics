import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { SelectQueryBuilder } from 'typeorm';
import { AppDataSource } from '../../config/data-source.js';
import { Edition, Volume } from '../../entities/index.js';
import type { AnalyticsFilters } from './models/analytics.model.js';

const currentPrice = `(SELECT p.amount::numeric FROM volume_prices p WHERE p."volumeId" = v.id ORDER BY p."observedAt" DESC NULLS LAST, p."createdAt" DESC LIMIT 1)`;
const hasCurrentPrice = `EXISTS (SELECT 1 FROM volume_prices p WHERE p."volumeId" = v.id)`;
const priceBandOrder = ['0–19,99', '20–39,99', '40–59,99', '60–99,99', '100+'];

function applyFilters(qb: SelectQueryBuilder<Volume>, filters: AnalyticsFilters): void {
  if (filters.publisherId)
    qb.andWhere('e."publisherId" = :publisherId', { publisherId: filters.publisherId });
  if (filters.category) qb.andWhere('m.category = :category', { category: filters.category });
  if (filters.status) qb.andWhere('v."releaseStatus" = :status', { status: filters.status });
  if (filters.yearFrom)
    qb.andWhere('v."releaseYear" >= :yearFrom', { yearFrom: Number(filters.yearFrom) });
  if (filters.yearTo) qb.andWhere('v."releaseYear" <= :yearTo', { yearTo: Number(filters.yearTo) });
  if (filters.hasPrice === 'true') qb.andWhere(hasCurrentPrice);
  if (filters.hasPrice === 'false') qb.andWhere(`NOT ${hasCurrentPrice}`);
  if (filters.manga) qb.andWhere('m.title ILIKE :manga', { manga: `%${filters.manga}%` });
}

function round(value: number | null, digits = 2): number | null {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round((value as number) * factor) / factor;
}

function baseQuery() {
  return AppDataSource.getRepository(Volume)
    .createQueryBuilder('v')
    .innerJoin('v.edition', 'e')
    .innerJoin('e.manga', 'm')
    .innerJoin('e.publisher', 'pub');
}

export async function registerAnalyticsRoutes(app: FastifyInstance) {
  app.get('/api/v1/analytics/overview', async (req: FastifyRequest, reply: FastifyReply) => {
    const filters = req.query as AnalyticsFilters;
    const qb = baseQuery()
      .select('COUNT(DISTINCT v.id)', 'totalVolumes')
      .addSelect('COUNT(DISTINCT m.id)', 'totalMangas')
      .addSelect('COUNT(DISTINCT e."publisherId")', 'totalPublishers')
      .addSelect(`COUNT(DISTINCT v.id) FILTER (WHERE ${hasCurrentPrice})`, 'pricedVolumes')
      .addSelect(`COUNT(DISTINCT v.id) FILTER (WHERE NOT ${hasCurrentPrice})`, 'unpricedVolumes')
      .addSelect('COUNT(DISTINCT v.id) FILTER (WHERE v."releaseYear" IS NOT NULL)', 'datedVolumes')
      .addSelect(
        'COUNT(DISTINCT v.id) FILTER (WHERE v."releaseYear" IS NOT NULL AND v."releaseStatus" = \'released\')',
        'releaseCount',
      )
      .addSelect(`AVG(${currentPrice}) FILTER (WHERE ${hasCurrentPrice})`, 'averagePrice')
      .addSelect(`MIN(${currentPrice}) FILTER (WHERE ${hasCurrentPrice})`, 'minPrice')
      .addSelect(`MAX(${currentPrice}) FILTER (WHERE ${hasCurrentPrice})`, 'maxPrice')
      .addSelect(
        `percentile_cont(0.5) WITHIN GROUP (ORDER BY ${currentPrice}) FILTER (WHERE ${hasCurrentPrice})`,
        'medianPrice',
      );
    applyFilters(qb, filters);
    const row = await qb.getRawOne<Record<string, string | null>>();
    const totalVolumes = Number(row?.totalVolumes ?? 0);
    const pricedVolumes = Number(row?.pricedVolumes ?? 0);
    const datedVolumes = Number(row?.datedVolumes ?? 0);
    return reply.send({
      totalMangas: Number(row?.totalMangas ?? 0),
      totalVolumes,
      totalPublishers: Number(row?.totalPublishers ?? 0),
      pricedVolumes,
      unpricedVolumes: Number(row?.unpricedVolumes ?? 0),
      priceCoverage: totalVolumes ? pricedVolumes / totalVolumes : null,
      datedVolumes,
      dateCoverage: totalVolumes ? datedVolumes / totalVolumes : null,
      averagePrice: round(row?.averagePrice === null ? null : Number(row?.averagePrice)),
      minPrice: round(row?.minPrice === null ? null : Number(row?.minPrice)),
      maxPrice: round(row?.maxPrice === null ? null : Number(row?.maxPrice)),
      medianPrice: round(row?.medianPrice === null ? null : Number(row?.medianPrice)),
      sampleSize: pricedVolumes,
      priceBasis: 'Preço de capa informado pela fonte para cada volume; ano pelo lançamento.',
      releaseCount: Number(row?.releaseCount ?? 0),
    });
  });

  app.get(
    '/api/v1/analytics/prices/by-publisher',
    async (req: FastifyRequest, reply: FastifyReply) => {
      const filters = req.query as AnalyticsFilters;
      const qb = baseQuery()
        .select('pub.id', 'id')
        .addSelect('pub.name', 'name')
        .addSelect('pub.slug', 'slug')
        .addSelect('COUNT(DISTINCT v.id)', 'volumesCount')
        .addSelect('COUNT(DISTINCT m.id)', 'mangaCount')
        .addSelect(`COUNT(DISTINCT v.id) FILTER (WHERE ${hasCurrentPrice})`, 'pricedVolumes')
        .addSelect(`AVG(${currentPrice}) FILTER (WHERE ${hasCurrentPrice})`, 'averagePrice')
        .groupBy('pub.id')
        .addGroupBy('pub.name')
        .addGroupBy('pub.slug')
        .orderBy('pub.name', 'ASC');
      applyFilters(qb, filters);
      const rows = await qb.getRawMany<Record<string, string | null>>();
      return reply.send(
        rows.map((row) => {
          const volumesCount = Number(row.volumesCount);
          const pricedVolumes = Number(row.pricedVolumes);
          return {
            id: row.id,
            name: row.name,
            slug: row.slug,
            volumesCount,
            mangaCount: Number(row.mangaCount),
            pricedVolumes,
            priceCoverage: volumesCount ? pricedVolumes / volumesCount : null,
            averagePrice: round(row.averagePrice === null ? null : Number(row.averagePrice)),
            sampleSize: pricedVolumes,
          };
        }),
      );
    },
  );

  app.get('/api/v1/analytics/prices/by-manga', async (req: FastifyRequest, reply: FastifyReply) => {
    const filters = req.query as AnalyticsFilters;
    const qb = baseQuery()
      .select('m.id', 'id')
      .addSelect('m.title', 'title')
      .addSelect('m.slug', 'slug')
      .addSelect('COUNT(DISTINCT v.id)', 'volumesCount')
      .addSelect(`COUNT(DISTINCT v.id) FILTER (WHERE ${hasCurrentPrice})`, 'sampleSize')
      .addSelect(`AVG(${currentPrice}) FILTER (WHERE ${hasCurrentPrice})`, 'averagePrice')
      .groupBy('m.id')
      .addGroupBy('m.title')
      .addGroupBy('m.slug')
      .orderBy('m.title', 'ASC');
    applyFilters(qb, filters);
    const rows = await qb.getRawMany<Record<string, string | null>>();
    return reply.send(
      rows.map((row) => ({
        id: row.id,
        title: row.title,
        slug: row.slug,
        volumesCount: Number(row.volumesCount),
        sampleSize: Number(row.sampleSize),
        pricedVolumes: Number(row.sampleSize),
        priceCoverage: Number(row.volumesCount)
          ? Number(row.sampleSize) / Number(row.volumesCount)
          : null,
        averagePrice: round(row.averagePrice === null ? null : Number(row.averagePrice)),
      })),
    );
  });

  app.get<{ Querystring: AnalyticsFilters }>(
    '/api/v1/analytics/prices/by-year',
    async (req, reply) => {
      const qb = baseQuery()
        .select('v."releaseYear"', 'year')
        .addSelect(`AVG(${currentPrice}) FILTER (WHERE ${hasCurrentPrice})`, 'averagePrice')
        .addSelect(
          `percentile_cont(0.5) WITHIN GROUP (ORDER BY ${currentPrice}) FILTER (WHERE ${hasCurrentPrice})`,
          'medianPrice',
        )
        .addSelect(`COUNT(DISTINCT v.id) FILTER (WHERE ${hasCurrentPrice})`, 'sampleSize')
        .addSelect('COUNT(DISTINCT v.id)', 'volumesCount')
        .where('v."releaseYear" IS NOT NULL')
        .groupBy('v."releaseYear"')
        .orderBy('v."releaseYear"', 'ASC');
      applyFilters(qb, req.query);
      const rows = await qb.getRawMany<Record<string, string | null>>();
      return reply.send(
        rows.map((row) => ({
          year: Number(row.year),
          averagePrice: round(row.averagePrice === null ? null : Number(row.averagePrice)),
          medianPrice: round(row.medianPrice === null ? null : Number(row.medianPrice)),
          sampleSize: Number(row.sampleSize),
          volumesCount: Number(row.volumesCount),
        })),
      );
    },
  );

  app.get('/api/v1/analytics/prices/by-page', async (req: FastifyRequest, reply: FastifyReply) => {
    const qb = baseQuery()
      .select('pub.name', 'publisher')
      .addSelect(
        `AVG(${currentPrice} / v."pageCount") FILTER (WHERE ${hasCurrentPrice})`,
        'avgPricePerPage',
      )
      .addSelect('AVG(v."pageCount")', 'avgPages')
      .addSelect(`COUNT(DISTINCT v.id) FILTER (WHERE ${hasCurrentPrice})`, 'sampleSize')
      .where('v."pageCount" IS NOT NULL AND v."pageCount" > 20')
      .groupBy('pub.name')
      .orderBy('pub.name', 'ASC');
    applyFilters(qb, req.query as AnalyticsFilters);
    const rows = await qb.getRawMany<Record<string, string | null>>();
    return reply.send(
      rows.map((row) => ({
        publisher: row.publisher,
        avgPricePerPage: round(
          row.avgPricePerPage === null ? null : Number(row.avgPricePerPage),
          3,
        ),
        avgPages: Math.round(Number(row.avgPages)),
        sampleSize: Number(row.sampleSize),
      })),
    );
  });

  app.get<{ Params: { mangaId: string } }>(
    '/api/v1/analytics/manga/:mangaId/evolution',
    async (req, reply) => {
      const rows = await AppDataSource.getRepository(Edition)
        .createQueryBuilder('edition')
        .innerJoin('edition.volumes', 'v')
        .where('edition."mangaId" = :mangaId', { mangaId: req.params.mangaId })
        .select('v.id', 'volumeId')
        .addSelect('v.number', 'number')
        .addSelect('v.title', 'title')
        .addSelect('v."releaseDate"', 'releaseDate')
        .addSelect('v."pageCount"', 'pages')
        .addSelect(currentPrice, 'price')
        .orderBy('v.number', 'ASC')
        .getRawMany<Record<string, string | null>>();
      return reply.send({
        mangaId: req.params.mangaId,
        volumes: rows.map((row) => ({
          ...row,
          number: Number(row.number),
          pages: row.pages ? Number(row.pages) : null,
          price: row.price === null ? null : Number(row.price),
        })),
      });
    },
  );

  app.get(
    '/api/v1/analytics/releases/by-month',
    async (req: FastifyRequest, reply: FastifyReply) => {
      const filters = req.query as AnalyticsFilters;
      const qb = baseQuery()
        .select('v."releaseYear"', 'year')
        .addSelect('v."releaseMonth"', 'month')
        .addSelect('COUNT(DISTINCT v.id)', 'count')
        .where('v."releaseYear" IS NOT NULL AND v."releaseMonth" IS NOT NULL')
        .groupBy('v."releaseYear"')
        .addGroupBy('v."releaseMonth"')
        .orderBy('v."releaseYear"', 'ASC')
        .addOrderBy('v."releaseMonth"', 'ASC');
      applyFilters(qb, filters);
      const rows = await qb.getRawMany<{ year: string; month: string; count: string }>();
      const counts = new Map(
        rows.map((row) => [`${Number(row.year)}-${Number(row.month)}`, Number(row.count)]),
      );
      const detectedYears = rows.map((row) => Number(row.year));
      const latestYear = Math.max(...detectedYears, new Date().getFullYear());
      const earliestYear = detectedYears.length ? Math.min(...detectedYears) : latestYear - 4;
      const toYear = Math.min(2100, Number(filters.yearTo) || latestYear);
      const fromYear = Math.max(
        1900,
        Number(filters.yearFrom) || Math.max(earliestYear, toYear - 9),
      );
      if (toYear < fromYear || toYear - fromYear > 19)
        return reply.badRequest('O período do gráfico mensal deve ter no máximo 20 anos.');
      const data = [];
      for (let year = fromYear; year <= toYear; year++) {
        for (let month = 1; month <= 12; month++)
          data.push({
            year,
            month,
            label: `${String(month).padStart(2, '0')}/${year}`,
            count: counts.get(`${year}-${month}`) ?? 0,
          });
      }
      return reply.send(data);
    },
  );

  app.get(
    '/api/v1/analytics/releases/by-publisher-month',
    async (req: FastifyRequest, reply: FastifyReply) => {
      const filters = req.query as AnalyticsFilters;
      const fromYear = filters.yearFrom === undefined ? undefined : Number(filters.yearFrom);
      const toYear = filters.yearTo === undefined ? undefined : Number(filters.yearTo);
      if (
        (fromYear !== undefined &&
          (!Number.isFinite(fromYear) || fromYear < 1900 || fromYear > 2100)) ||
        (toYear !== undefined && (!Number.isFinite(toYear) || toYear < 1900 || toYear > 2100)) ||
        (fromYear !== undefined && toYear !== undefined && toYear < fromYear) ||
        (fromYear !== undefined && toYear !== undefined && toYear - fromYear > 19)
      )
        return reply.badRequest('O período da linha do tempo deve ter no máximo 20 anos.');
      const qb = baseQuery()
        .select('pub.id', 'publisherId')
        .addSelect('pub.name', 'publisher')
        .addSelect('v."releaseYear"', 'year')
        .addSelect('v."releaseMonth"', 'month')
        .addSelect('COUNT(DISTINCT v.id)', 'count')
        .where('v."releaseYear" IS NOT NULL AND v."releaseMonth" BETWEEN 1 AND 12')
        .groupBy('pub.id')
        .addGroupBy('pub.name')
        .addGroupBy('v."releaseYear"')
        .addGroupBy('v."releaseMonth"')
        .orderBy('v."releaseYear"', 'ASC')
        .addOrderBy('v."releaseMonth"', 'ASC')
        .addOrderBy('pub.name', 'ASC');
      applyFilters(qb, filters);
      const rows = await qb.getRawMany<Record<string, string>>();
      return reply.send(
        rows.map((row) => ({
          publisherId: row.publisherId,
          publisher: row.publisher,
          year: Number(row.year),
          month: Number(row.month),
          count: Number(row.count),
        })),
      );
    },
  );

  app.get(
    '/api/v1/analytics/releases/by-year',
    async (req: FastifyRequest, reply: FastifyReply) => {
      const filters = req.query as AnalyticsFilters;
      const qb = baseQuery()
        .select('v."releaseYear"', 'year')
        .addSelect('COUNT(DISTINCT v.id)', 'count')
        .where('v."releaseYear" IS NOT NULL')
        .groupBy('v."releaseYear"')
        .orderBy('v."releaseYear"', 'ASC');
      applyFilters(qb, filters);
      const rows = await qb.getRawMany<{ year: string; count: string }>();
      return reply.send(rows.map((row) => ({ year: Number(row.year), count: Number(row.count) })));
    },
  );

  app.get('/api/v1/analytics/prices/by-band', async (req: FastifyRequest, reply: FastifyReply) => {
    const filters = req.query as AnalyticsFilters;
    const qb = baseQuery()
      .select(
        `CASE WHEN ${currentPrice} < 20 THEN '0–19,99' WHEN ${currentPrice} < 40 THEN '20–39,99' WHEN ${currentPrice} < 60 THEN '40–59,99' WHEN ${currentPrice} < 100 THEN '60–99,99' ELSE '100+' END`,
        'band',
      )
      .addSelect(`COUNT(DISTINCT v.id)`, 'count')
      .where(hasCurrentPrice)
      .groupBy('band');
    applyFilters(qb, filters);
    const rows = await qb.getRawMany<{ band: string; count: string }>();
    rows.sort(
      (left, right) => priceBandOrder.indexOf(left.band) - priceBandOrder.indexOf(right.band),
    );
    return reply.send(rows.map((row) => ({ band: row.band, count: Number(row.count) })));
  });
}
