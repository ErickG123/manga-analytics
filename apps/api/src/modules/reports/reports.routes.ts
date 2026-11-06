import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { SelectQueryBuilder } from 'typeorm';
import { AppDataSource } from '../../config/data-source.js';
import { PriceObservation, Volume } from '../../entities/index.js';
import { serializeCsv } from './csv.utils.js';
import type { ReportFilters } from './models/report-filter.model.js';

function applyFilters(
  qb: SelectQueryBuilder<Volume>,
  filters: ReportFilters,
  periodAlias = 'volume',
): void {
  if (filters.yearFrom)
    qb.andWhere(`${periodAlias}."releaseYear" >= :yearFrom`, {
      yearFrom: Number(filters.yearFrom),
    });
  if (filters.yearTo)
    qb.andWhere(`${periodAlias}."releaseYear" <= :yearTo`, { yearTo: Number(filters.yearTo) });
  if (filters.publisherId)
    qb.andWhere('edition."publisherId" = :publisherId', { publisherId: filters.publisherId });
  if (filters.category) qb.andWhere('manga.category = :category', { category: filters.category });
  if (filters.status)
    qb.andWhere(`${periodAlias}."releaseStatus" = :status`, { status: filters.status });
  if (filters.manga) qb.andWhere('manga.title ILIKE :manga', { manga: `%${filters.manga}%` });
}

function sendCsv(reply: FastifyReply, filename: string, headers: string[], rows: unknown[][]) {
  const csv = serializeCsv(headers, rows);
  reply.header('Content-Type', 'text/csv; charset=utf-8');
  reply.header('Content-Disposition', `attachment; filename="${filename}"`);
  return reply.send(`\uFEFF${csv}`);
}

export async function registerReportsRoutes(app: FastifyInstance) {
  const volumeRepo = AppDataSource.getRepository(Volume);
  const obsRepo = AppDataSource.getRepository(PriceObservation);

  app.get('/api/v1/reports/releases', async (req: FastifyRequest, reply: FastifyReply) => {
    const filters = req.query as ReportFilters;
    const qb = volumeRepo
      .createQueryBuilder('volume')
      .innerJoin('volume.edition', 'edition')
      .innerJoin('edition.manga', 'manga')
      .innerJoin('edition.publisher', 'publisher')
      .select('manga.title', 'obra')
      .addSelect('publisher.name', 'editora')
      .addSelect('volume.number', 'volume')
      .addSelect('volume."isbn13"', 'isbn')
      .addSelect('volume."releaseDate"', 'data')
      .addSelect('volume."releaseDatePrecision"', 'precisao')
      .addSelect('volume."releaseStatus"', 'status')
      .addSelect(
        '(SELECT p.amount FROM volume_prices p WHERE p."volumeId" = volume.id ORDER BY p."observedAt" DESC NULLS LAST, p."createdAt" DESC LIMIT 1)',
        'preco',
      )
      .orderBy('volume."releaseYear"', 'ASC', 'NULLS LAST')
      .addOrderBy('volume."releaseMonth"', 'ASC', 'NULLS LAST')
      .addOrderBy('volume."releaseDay"', 'ASC', 'NULLS LAST')
      .addOrderBy('manga.title', 'ASC')
      .addOrderBy('volume.number', 'ASC');
    applyFilters(qb, filters);
    if (filters.hasPrice === 'true')
      qb.andWhere('EXISTS (SELECT 1 FROM volume_prices p WHERE p."volumeId" = volume.id)');
    if (filters.hasPrice === 'false')
      qb.andWhere('NOT EXISTS (SELECT 1 FROM volume_prices p WHERE p."volumeId" = volume.id)');
    const raw = await qb.getRawMany<Record<string, string | null>>();
    const rows = raw.map((row) => [
      row.obra,
      row.editora,
      `#${row.volume}`,
      row.isbn,
      row.data,
      row.precisao,
      row.status,
      row.preco === null ? null : Number(row.preco).toFixed(2),
    ]);
    if (filters.format === 'csv')
      return sendCsv(
        reply,
        'relatorio-lancamentos.csv',
        [
          'Obra',
          'Editora',
          'Volume',
          'ISBN',
          'Data',
          'Precisão da data',
          'Situação',
          'Preço de capa (BRL)',
        ],
        rows,
      );
    return reply.send(rows);
  });

  app.get('/api/v1/reports/prices', async (req: FastifyRequest, reply: FastifyReply) => {
    const filters = req.query as ReportFilters;
    const qb = obsRepo
      .createQueryBuilder('observation')
      .innerJoin('observation.volume', 'volume')
      .innerJoin('volume.edition', 'edition')
      .innerJoin('edition.manga', 'manga')
      .innerJoin('edition.publisher', 'publisher')
      .select('manga.title', 'obra')
      .addSelect('publisher.name', 'editora')
      .addSelect('edition.name', 'edicao')
      .addSelect('volume.number', 'volume')
      .addSelect('observation.amount', 'preco')
      .addSelect('observation.observedAt', 'observedAt')
      .addSelect('observation.sourceId', 'fonte')
      .orderBy('observation.observedAt', 'DESC');
    applyFilters(qb, filters);
    if (filters.hasPrice === 'false') qb.andWhere('1 = 0');
    const raw = await qb.getRawMany<Record<string, string>>();
    const rows = raw.map((row) => [
      row.obra,
      row.editora,
      row.edicao,
      `#${row.volume}`,
      Number(row.preco).toFixed(2),
      new Date(row.observedAt).toISOString().slice(0, 10),
      row.fonte,
    ]);
    if (filters.format === 'csv')
      return sendCsv(
        reply,
        'relatorio-precos.csv',
        [
          'Obra',
          'Editora',
          'Edição',
          'Volume',
          'Preço observado (BRL)',
          'Data da observação',
          'Fonte',
        ],
        rows,
      );
    return reply.send(rows);
  });
}
