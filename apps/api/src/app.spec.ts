import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from './app.js';
import type { FastifyInstance } from 'fastify';

describe('Fastify REST API', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
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
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/mangas/one-piece-aventura-escolar',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.title).toBe('One Piece Aventura Escolar');
    expect(body.volumes.length).toBeGreaterThan(0);
  });

  it('GET /api/v1/publishers deve retornar lista de editoras', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/publishers',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body)).toBe(true);
    expect(body.some((p: { slug: string }) => p.slug === 'panini')).toBe(true);
  });

  it('GET /api/v1/releases deve listar os volumes com datas', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/releases',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
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
