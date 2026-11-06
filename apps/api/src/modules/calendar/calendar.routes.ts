import { AppDataSource } from '../../config/data-source.js';
import { Volume } from '../../entities/index.js';
import type { CalendarFilterParams, CalendarReleaseDto } from './models/calendar.model.js';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Repository, SelectQueryBuilder } from 'typeorm';

function parseDate(value: string | undefined): { year: number; month: number; day: number } | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  return { year: Number(year), month: Number(month), day: Number(day) };
}

function latestPrice(volume: Volume): number | null {
  const latest = [...(volume.prices ?? [])].sort(
    (left, right) =>
      (right.observedAt?.getTime() ?? right.createdAt.getTime()) -
      (left.observedAt?.getTime() ?? left.createdAt.getTime()),
  )[0];
  return latest ? Number(latest.amount) : null;
}

function releaseQuery(
  repository: Repository<Volume>,
  query: CalendarFilterParams,
  from: ReturnType<typeof parseDate>,
  to: ReturnType<typeof parseDate>,
): SelectQueryBuilder<Volume> {
  const qb = repository
    .createQueryBuilder('volume')
    .leftJoin('volume.edition', 'edition')
    .leftJoin('edition.manga', 'manga')
    .leftJoin('edition.publisher', 'publisher')
    .where('volume."releaseYear" IS NOT NULL');

  if (query.year) qb.andWhere('volume.releaseYear = :year', { year: Number(query.year) });
  if (query.monthUnknown === 'true') qb.andWhere('volume."releaseMonth" IS NULL');
  else if (query.month) qb.andWhere('volume.releaseMonth = :month', { month: Number(query.month) });
  if (query.publisher) qb.andWhere('publisher.slug = :publisher', { publisher: query.publisher });
  if (query.manga)
    qb.andWhere('(manga.slug = :manga OR manga.id = :manga OR manga.title ILIKE :mangaTitle)', {
      manga: query.manga,
      mangaTitle: `%${query.manga}%`,
    });
  if (query.status) qb.andWhere('volume.releaseStatus = :status', { status: query.status });
  if (query.hasPrice === 'true')
    qb.andWhere('EXISTS (SELECT 1 FROM volume_prices p WHERE p."volumeId" = volume.id)');
  if (query.hasPrice === 'false')
    qb.andWhere('NOT EXISTS (SELECT 1 FROM volume_prices p WHERE p."volumeId" = volume.id)');
  if (from) {
    qb.andWhere(
      `(volume."releaseYear" > :fromYear OR (volume."releaseYear" = :fromYear AND
      (volume."releaseMonth" IS NULL OR volume."releaseMonth" > :fromMonth OR (volume."releaseMonth" = :fromMonth AND
      (volume."releaseDay" >= :fromDay OR volume."releaseDay" IS NULL)))))`,
      { fromYear: from.year, fromMonth: from.month, fromDay: from.day },
    );
  }
  if (to) {
    qb.andWhere(
      `(volume."releaseYear" < :toYear OR (volume."releaseYear" = :toYear AND
      (volume."releaseMonth" IS NULL OR volume."releaseMonth" < :toMonth OR (volume."releaseMonth" = :toMonth AND
      (volume."releaseDay" <= :toDay OR volume."releaseDay" IS NULL)))))`,
      { toYear: to.year, toMonth: to.month, toDay: to.day },
    );
  }
  return qb;
}

function hasInvalidDateFilter(query: CalendarFilterParams): boolean {
  return Boolean((query.from && !parseDate(query.from)) || (query.to && !parseDate(query.to)));
}

export async function registerCalendarRoutes(app: FastifyInstance) {
  const volumeRepo = AppDataSource.getRepository(Volume);

  app.get('/api/v1/releases/summary', async (req: FastifyRequest, reply: FastifyReply) => {
    const query = req.query as CalendarFilterParams;
    if (hasInvalidDateFilter(query)) return reply.badRequest('Datas devem usar YYYY-MM-DD.');
    const qb = releaseQuery(volumeRepo, query, parseDate(query.from), parseDate(query.to))
      .select('volume."releaseYear"', 'year')
      .addSelect('volume."releaseMonth"', 'month')
      .addSelect('COUNT(DISTINCT volume.id)', 'count')
      .groupBy('volume."releaseYear"')
      .addGroupBy('volume."releaseMonth"')
      .orderBy('volume."releaseYear"', 'ASC')
      .addOrderBy('volume."releaseMonth"', 'ASC', 'NULLS LAST');
    const rows = await qb.getRawMany<{ year: string; month: string | null; count: string }>();
    return reply.send(
      rows.map((row) => ({
        year: Number(row.year),
        month: row.month === null ? null : Number(row.month),
        count: Number(row.count),
      })),
    );
  });

  app.get('/api/v1/releases', async (req: FastifyRequest, reply: FastifyReply) => {
    const query = req.query as CalendarFilterParams;
    const page = Math.max(1, Number.parseInt(query.page ?? '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit ?? '50', 10) || 50));
    const from = parseDate(query.from);
    const to = parseDate(query.to);
    if (hasInvalidDateFilter(query)) return reply.badRequest('Datas devem usar YYYY-MM-DD.');
    const qb = releaseQuery(volumeRepo, query, from, to);

    const orderByReleaseDate = (queryBuilder: typeof qb) =>
      queryBuilder
        .orderBy('volume.releaseYear', 'ASC', 'NULLS LAST')
        .addOrderBy('volume.releaseMonth', 'ASC', 'NULLS LAST')
        .addOrderBy('volume.releaseDay', 'ASC', 'NULLS LAST')
        .addOrderBy('manga.title', 'ASC')
        .addOrderBy('volume.number', 'ASC');

    // Paginate only volume IDs. Joining prices before pagination makes TypeORM build a
    // DISTINCT pagination subquery that fails for date-range filters on PostgreSQL.
    const total = await qb.getCount();
    const pageRows = await orderByReleaseDate(qb.clone())
      .select('volume.id', 'id')
      .offset((page - 1) * limit)
      .limit(limit)
      .getRawMany<{ id: string }>();
    const ids = pageRows.map((row) => row.id);
    const volumes = ids.length
      ? await volumeRepo
          .createQueryBuilder('volume')
          .leftJoinAndSelect('volume.edition', 'edition')
          .leftJoinAndSelect('edition.manga', 'manga')
          .leftJoinAndSelect('edition.publisher', 'publisher')
          .leftJoinAndSelect('volume.prices', 'price')
          .where('volume.id IN (:...ids)', { ids })
          .getMany()
      : [];
    const volumesById = new Map(volumes.map((volume) => [volume.id, volume]));
    const orderedVolumes = ids
      .map((id) => volumesById.get(id))
      .filter((volume): volume is Volume => volume !== undefined);

    const data: CalendarReleaseDto[] = orderedVolumes.map((volume) => ({
      id: volume.id,
      slug: volume.edition.manga.slug,
      title: volume.edition.manga.title,
      publisher: volume.edition.publisher.name,
      number: volume.number,
      date: volume.releaseDate ?? null,
      precision: volume.releaseDatePrecision,
      year: volume.releaseYear ?? null,
      month: volume.releaseMonth ?? null,
      day: volume.releaseDay ?? null,
      status: volume.releaseStatus,
      price: latestPrice(volume),
      coverUrl: volume.coverUrl || volume.edition.manga.coverUrl,
    }));

    return reply.send({
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  });
}
