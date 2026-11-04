import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from './app.js';
import type { FastifyInstance } from 'fastify';
import { escapeCsvCell } from './modules/reports/csv.utils.js';

describe('Fastify REST API', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
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
      url: '/api/v1/analytics/releases/by-month?yearFrom=2026&yearTo=2026',
    });
    expect(res.statusCode).toBe(200);
    const rows = JSON.parse(res.body) as { year: number; month: number; count: number }[];
    expect(rows).toHaveLength(12);
    expect(rows.every((row) => row.year === 2026)).toBe(true);
    expect(rows.some((row) => row.count === 0)).toBe(true);
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

  it('POST /api/admin/jobs/trigger com job ativo deve retornar 409 Conflict', async () => {
    // Limpar jobs running legados que possam ter sobrado de execuções anteriores
    const { AppDataSource } = await import('./config/data-source.js');
    const { ImportJob } = await import('./entities/index.js');
    await AppDataSource.getRepository(ImportJob).update(
      { status: 'running' },
      { status: 'completed' },
    );

    // 1º disparo
    const res1 = await app.inject({
      method: 'POST',
      url: '/api/admin/jobs/trigger',
      headers: {
        authorization: 'Bearer atlas_admin_secret_token_2026',
      },
      payload: { limit: 5 },
    });
    expect(res1.statusCode).toBe(200);

    // 2º disparo simultâneo imediato deve colidir em 409 Conflict
    const res2 = await app.inject({
      method: 'POST',
      url: '/api/admin/jobs/trigger',
      headers: {
        authorization: 'Bearer atlas_admin_secret_token_2026',
      },
      payload: { limit: 5 },
    });
    expect(res2.statusCode).toBe(409);
    const body2 = JSON.parse(res2.body);
    expect(body2.message).toContain('Já existe uma sincronização em andamento');
  });

  it('GET /api/v1/analytics/prices/by-year deve retornar evolução por ano', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/analytics/prices/by-year',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body)).toBe(true);
  });
});
