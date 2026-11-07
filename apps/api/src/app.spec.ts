import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from './app.js';
import type { FastifyInstance } from 'fastify';
import { escapeCsvCell } from './modules/reports/csv.utils.js';

describe('Fastify REST API', () => {
  let app: FastifyInstance;
  let appAddress: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    appAddress = await app.listen({ host: '127.0.0.1', port: 0 });
  });

  afterAll(async () => {
    await app.close();
  });

  it('CSV preserva Unicode, escapa aspas e neutraliza fórmulas', () => {
    expect(escapeCsvCell('Mangá "Atlas"')).toBe('"Mangá ""Atlas"""');
    expect(escapeCsvCell('=1+1')).toBe('"\'=1+1"');
    expect(escapeCsvCell(null)).toBe('""');
  });

  it('GET /api/v1/health deve responder status ok e database connected', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('ok');
    expect(body.database).toBe('connected');
  });

  it('GET /api/v1/mangas deve retornar lista de mangás paginada', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/mangas',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toBeDefined();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.pagination.total).toBeGreaterThan(0);
  });

  it('GET /api/v1/mangas/:identifier deve retornar dados detalhados da obra', async () => {
    const listRes = await app.inject({ method: 'GET', url: '/api/v1/mangas?limit=1' });
    const firstManga = JSON.parse(listRes.body).data[0] as {
      slug: string;
      coverUrl?: string | null;
    };
    expect(firstManga).toBeDefined();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/mangas/${firstManga.slug}`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.slug).toBe(firstManga.slug);
    expect(body.volumes.length).toBeGreaterThan(0);
    expect(body).toHaveProperty('coverUrl');
  });

  it('GET /api/v1/publishers deve retornar lista de editoras', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/publishers',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body)).toBe(true);
    if (body.length > 0) expect(body[0]).toHaveProperty('slug');
  });

  it('GET /api/v1/releases deve listar os volumes com datas', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/releases',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.pagination).toHaveProperty('total');
    if (body.data.length > 0) expect(body.data[0]).toHaveProperty('precision');
  });

  it('GET /api/v1/releases deve paginar corretamente por intervalo de datas e editora', async () => {
    const publishersResponse = await app.inject({ method: 'GET', url: '/api/v1/publishers' });
    const publishers = JSON.parse(publishersResponse.body) as { slug: string }[];
    const publisher = publishers.find((item) => item.slug === 'panini');
    expect(publisher).toBeDefined();

    for (const publisherSlug of [undefined, publisher?.slug]) {
      const query = new URLSearchParams({
        from: '2022-01-01',
        to: '2026-12-31',
        page: '1',
        limit: '100',
      });
      if (publisherSlug) query.set('publisher', publisherSlug);
      const res = await app.inject({ method: 'GET', url: `/api/v1/releases?${query}` });

      expect(res.statusCode, res.body).toBe(200);
      const body = JSON.parse(res.body) as {
        data: { publisher: string }[];
        pagination: { total: number; limit: number; page: number };
      };
      expect(body.data.length).toBeLessThanOrEqual(100);
      expect(body.pagination.limit).toBe(100);
      expect(body.pagination.page).toBe(1);
      expect(body.pagination.total).toBeGreaterThanOrEqual(body.data.length);
      if (publisherSlug) {
        expect(body.data.every((item) => item.publisher.toLowerCase().includes('panini'))).toBe(
          true,
        );
      }
    }
  });

  it('GET /api/v1/releases/summary agrupa volumes por ano e mês de lançamento', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/releases/summary?from=2022-01-01&to=2026-12-31&publisher=panini',
    });

    expect(res.statusCode, res.body).toBe(200);
    const rows = JSON.parse(res.body) as { year: number; month: number | null; count: number }[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.year >= 2022 && row.year <= 2026 && row.count > 0)).toBe(true);
    expect(rows.every((row) => row.month === null || (row.month >= 1 && row.month <= 12))).toBe(
      true,
    );
  });

  it('GET /api/v1/mangas deve combinar busca e filtros no backend', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/mangas?search=Mieruko&hasPrice=true&limit=5',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.every((manga: { title: string }) => manga.title.includes('Mieruko'))).toBe(
      true,
    );
    expect(body.pagination.limit).toBe(5);
  });

  it('GET /api/v1/mangas deve validar paginação e ordenação/filter params', async () => {
    const badPage = await app.inject({ method: 'GET', url: '/api/v1/mangas?page=0' });
    expect(badPage.statusCode).toBe(400);
    const badPrice = await app.inject({ method: 'GET', url: '/api/v1/mangas?hasPrice=yes' });
    expect(badPrice.statusCode).toBe(400);
  });

  it('GET /api/v1/analytics/overview deve retornar agregados', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/analytics/overview',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.totalMangas).toBeGreaterThan(0);
    expect(body.totalVolumes).toBeGreaterThan(0);
    expect(body.averagePrice).toBeGreaterThan(0);
    expect(body.sampleSize).toBe(body.pricedVolumes);
    expect(body.pricedVolumes + body.unpricedVolumes).toBe(body.totalVolumes);
    expect(body).toHaveProperty('medianPrice');
    expect(body).toHaveProperty('priceCoverage');
  });

  it('GET /api/v1/analytics/releases/by-month deve completar meses vazios com zero', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/analytics/releases/by-month?yearFrom=2026&yearTo=2026&manga=__no_matching_manga__',
    });
    expect(res.statusCode).toBe(200);
    const rows = JSON.parse(res.body) as { year: number; month: number; count: number }[];
    expect(rows).toHaveLength(12);
    expect(rows.every((row) => row.year === 2026)).toBe(true);
    expect(rows.every((row) => row.count === 0)).toBe(true);
  });

  it('GET /api/v1/analytics/releases/year-range retorna anos de lançamento por filtro', async () => {
    const publisherResponse = await app.inject({ method: 'GET', url: '/api/v1/publishers' });
    const publishers = JSON.parse(publisherResponse.body) as { id: string }[];
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/analytics/releases/year-range?publisherId=${publishers[0].id}&yearFrom=2025&yearTo=2026`,
    });

    expect(res.statusCode).toBe(200);
    const range = JSON.parse(res.body) as { minYear: number | null; maxYear: number | null };
    expect(range.minYear).not.toBeNull();
    expect(range.maxYear).not.toBeNull();
    expect(range.minYear).toBeLessThanOrEqual(range.maxYear as number);
  });

  it('GET /api/v1/reports/releases?format=csv deve retornar CSV formatado', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/reports/releases?format=csv',
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.body).toContain('Obra');
    expect(res.body).toContain('Editora');
  });

  it('GET /api/admin/stats sem autorização deve retornar 401 Unauthorized', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/stats',
    });

    expect(res.statusCode).toBe(401);
  });

  it('POST /api/admin/auth/login com senha correta deve emitir token de sessão', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/auth/login',
      payload: {
        password: 'atlas_admin_secret_token_2026',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.token).toBeDefined();
    expect(body.token).toContain('atlas_sess_');

    // Usar o token de sessão para acessar a rota protegida
    const statsRes = await app.inject({
      method: 'GET',
      url: '/api/admin/stats',
      headers: {
        authorization: `Bearer ${body.token}`,
      },
    });
    expect(statsRes.statusCode).toBe(200);
  });

  it('POST /api/admin/auth/login com senha incorreta deve falhar com 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/auth/login',
      payload: {
        password: 'senha_completamente_errada',
      },
    });

    expect(res.statusCode).toBe(401);
  });

  it('GET /api/admin/collector/control/status exige autenticação', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/collector/control/status',
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/admin/collector/backfill/pause exige autenticação', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/collector/backfill/pause',
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/admin/collector/backfill/pause sem worker ativo retorna 409', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/collector/backfill/pause',
      headers: { authorization: 'Bearer atlas_admin_secret_token_2026' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('GET /api/admin/collector/control/status retorna progresso autenticado', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/collector/control/status',
      headers: { authorization: 'Bearer atlas_admin_secret_token_2026' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      runner: { status: string };
      checkpoint: { currentPage: number } | null;
      catalog: { processedItems: number; percentComplete: number | null };
      failures: { pending: number; items: unknown[] };
    };
    expect(body.runner.status).toBeDefined();
    expect(body.catalog.processedItems).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(body.failures.items)).toBe(true);
  });

  it('GET /api/admin/collector/events publica snapshots SSE autenticados', async () => {
    const controller = new AbortController();
    const response = await fetch(`${appAddress}/api/admin/collector/events`, {
      headers: { authorization: 'Bearer atlas_admin_secret_token_2026' },
      signal: controller.signal,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const firstEvent = await response.body?.getReader().read();
    expect(new TextDecoder().decode(firstEvent?.value)).toContain('event: collector');
    controller.abort();
  });

  it('POST /api/admin/jobs/trigger não cria mais uma execução simulada', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/jobs/trigger',
      headers: {
        authorization: 'Bearer atlas_admin_secret_token_2026',
      },
      payload: { limit: 5 },
    });
    expect(res.statusCode).toBe(410);
    expect(JSON.parse(res.body).message).toContain('/collector/backfill/start');
  });

  it('GET /api/v1/analytics/prices/by-year deve retornar evolução por ano', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/analytics/prices/by-year',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      year: number;
      averagePrice: number | null;
      medianPrice: number | null;
      sampleSize: number;
      volumesCount: number;
    }[];
    expect(Array.isArray(body)).toBe(true);
    if (body.length > 0) {
      expect(body[0]).toHaveProperty('averagePrice');
      expect(body[0]).toHaveProperty('medianPrice');
      expect(body[0].sampleSize).toBeGreaterThanOrEqual(0);
    }
  });

  it('GET /api/v1/analytics/editions/by-format deve retornar contagens e cobertura desconhecida', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/analytics/editions/by-format',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      formatType: string;
      label: string;
      editionsCount: number;
      mangaCount: number;
      volumesCount: number;
    }[];
    expect(Array.isArray(body)).toBe(true);
    expect(body.every((row) => row.editionsCount > 0 && row.volumesCount > 0)).toBe(true);
    expect(
      body.some((row) => row.formatType === 'unknown' && row.label === 'Volume convencional'),
    ).toBe(true);
  });

  it('GET /api/v1/analytics/prices/by-format deve expor amostras e dispersão', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/analytics/prices/by-format' });
    expect(res.statusCode).toBe(200);
    const rows = JSON.parse(res.body) as {
      formatType: string;
      averagePrice: number | null;
      medianPrice: number | null;
      lowerQuartilePrice: number | null;
      upperQuartilePrice: number | null;
      normalizedSampleSize: number;
    }[];
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.every((row) => row.normalizedSampleSize >= 0)).toBe(true);
  });

  it('GET /api/v1/analytics/prices/by-page deve informar cobertura de páginas', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/analytics/prices/by-page' });
    expect(res.statusCode).toBe(200);
    const rows = JSON.parse(res.body) as {
      publisher: string;
      averagePricePerPage: number | null;
      volumesWithPageCount: number;
      volumesCount: number;
      pageCoverage: number | null;
    }[];
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.every((row) => row.volumesWithPageCount <= row.volumesCount)).toBe(true);
  });

  it('GET /api/v1/analytics/prices/observed-by-month deve separar observações e mudanças', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/analytics/prices/observed-by-month?yearFrom=2022&yearTo=2026',
    });
    expect(res.statusCode).toBe(200);
    const rows = JSON.parse(res.body) as {
      year: number;
      month: number;
      observationsCount: number;
      changesCount: number;
      increasesCount: number;
      decreasesCount: number;
    }[];
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.every((row) => row.month >= 1 && row.month <= 12)).toBe(true);
    expect(rows.every((row) => row.changesCount <= row.observationsCount)).toBe(true);
  });

  it('GET /api/v1/analytics/prices/comparable-editions requer uma busca por obra', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/analytics/prices/comparable-editions?manga=Blue%20Lock',
    });
    expect(res.statusCode).toBe(200);
    const rows = JSON.parse(res.body) as { manga: string; comparableEditions: number }[];
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.every((row) => row.comparableEditions > 1)).toBe(true);
  });

  it('GET /api/v1/analytics/releases/by-publisher-month deve agregar séries com os filtros', async () => {
    const publishersResponse = await app.inject({ method: 'GET', url: '/api/v1/publishers' });
    const publishers = JSON.parse(publishersResponse.body) as { id: string }[];
    expect(publishers.length).toBeGreaterThan(0);
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/analytics/releases/by-publisher-month?yearFrom=2022&yearTo=2026&publisherId=${publishers[0].id}`,
    });

    expect(res.statusCode).toBe(200);
    const rows = JSON.parse(res.body) as {
      publisherId: string;
      publisher: string;
      year: number;
      month: number;
      count: number;
    }[];
    expect(Array.isArray(rows)).toBe(true);
    if (rows.length > 0) {
      expect(rows[0].publisherId).toBe(publishers[0].id);
      expect(rows[0].month).toBeGreaterThanOrEqual(1);
      expect(rows[0].month).toBeLessThanOrEqual(12);
      expect(rows[0].count).toBeGreaterThan(0);
    }
  });

  it('GET /api/v1/analytics/releases/by-publisher-month deve limitar períodos longos', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/analytics/releases/by-publisher-month?yearFrom=2000&yearTo=2020',
    });

    expect(res.statusCode).toBe(400);
  });
});
