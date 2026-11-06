import type { FastifyPluginAsync } from 'fastify';
import { In } from 'typeorm';
import { AppDataSource } from '../../config/data-source.js';
import {
  ImportJob,
  DataQualityIssue,
  CollectorSourceState,
  CollectorFailure,
} from '../../entities/index.js';
import { createAdminSession, invalidateAdminSession } from '../../plugins/auth.plugin.js';
import { collectorRunner } from './collector-runner.service.js';
import type {
  CollectorBackfillOptions,
  CollectorDashboardSnapshot,
  CollectorReviewItem,
} from './models/collector-runner.model.js';

function getHttpMetrics(
  metrics: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  const value = metrics?.['http'];
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export const adminRoutes: FastifyPluginAsync = async (fastify) => {
  const jobRepo = AppDataSource.getRepository(ImportJob);
  const issueRepo = AppDataSource.getRepository(DataQualityIssue);
  const sourceStateRepo = AppDataSource.getRepository(CollectorSourceState);
  const collectorFailureRepo = AppDataSource.getRepository(CollectorFailure);

  // 1. Rota pública de Login Administrativo (emite token de sessão)
  fastify.post<{ Body: { password?: string; key?: string } }>(
    '/auth/login',
    async (request, reply) => {
      const { password, key } = request.body || {};
      const expectedKey = process.env.ADMIN_API_KEY || 'atlas_admin_secret_token_2026';
      const providedCredential = password || key;

      if (!providedCredential || providedCredential !== expectedKey) {
        reply.code(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Credencial administrativa incorreta.',
        });
        return;
      }

      const sessionToken = createAdminSession();
      return {
        message: 'Autenticado com sucesso.',
        token: sessionToken,
        expiresIn: '4h',
      };
    },
  );

  // 2. Rota pública de Logout Administrativo
  fastify.post<{ Body: { token?: string } }>('/auth/logout', async (request) => {
    const authHeader = request.headers['authorization'];
    let tokenToInvalidate = request.body?.token;

    if (!tokenToInvalidate && authHeader && authHeader.startsWith('Bearer ')) {
      tokenToInvalidate = authHeader.substring(7).trim();
    }

    if (tokenToInvalidate) {
      invalidateAdminSession(tokenToInvalidate);
    }

    return { message: 'Sessão encerrada com sucesso.' };
  });

  // Rotas autenticadas utilizam hook de verificação (exceto as rotas públicas de auth)
  fastify.addHook('preHandler', async (request, reply) => {
    if (request.url.includes('/auth/login') || request.url.includes('/auth/logout')) {
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (fastify as any).authenticateAdmin(request, reply);
  });

  // Reconciliação automática: marca jobs 'running' com mais de 30 minutos como 'failed'
  const reconcileAbandonedJobs = async () => {
    try {
      const staleJobThreshold = new Date(Date.now() - 45 * 60 * 1000);
      await jobRepo
        .createQueryBuilder()
        .update(ImportJob)
        .set({
          status: 'failed',
          finishedAt: new Date(),
        })
        .where("status = 'running' AND startedAt < :limitDate", {
          limitDate: staleJobThreshold,
        })
        .execute();
    } catch {
      // Ignora erro de reconciliação em casos de teste ou locks rápidos
    }
  };

  // 3. Métricas do painel administrativo
  fastify.get('/stats', async () => {
    await reconcileAbandonedJobs();

    const totalJobs = await jobRepo.count();
    const successfulJobs = await jobRepo.count({ where: { status: 'completed' } });
    const failedJobs = await jobRepo.count({ where: { status: 'failed' } });
    const runningJobs = await jobRepo.count({ where: { status: 'running' } });

    const openIssues = await issueRepo.count({ where: { status: 'open' } });
    const errorIssues = await issueRepo.count({
      where: { status: 'open', severity: 'error' },
    });

    const lastJob = await jobRepo
      .createQueryBuilder('job')
      .orderBy('job.startedAt', 'DESC')
      .getOne();

    return {
      jobs: {
        total: totalJobs,
        successful: successfulJobs,
        failed: failedJobs,
        running: runningJobs,
        lastJob,
      },
      quality: {
        openIssues,
        errorIssues,
      },
    };
  });

  fastify.get('/collector-state', async () => {
    const source = await sourceStateRepo.findOne({ where: { sourceId: 'bbm' } });
    const checkpoint = await AppDataSource.query(
      'SELECT "currentPage", "currentOffset", "lastExternalId", status, "updatedAt" FROM collector_checkpoints WHERE "sourceId" = $1 AND scope = $2',
      ['bbm', 'catalog'],
    );
    const pendingFailures = await collectorFailureRepo.count({
      where: [
        { sourceId: 'bbm', status: 'needs_review' },
        { sourceId: 'bbm', status: 'failed_retryable' },
        { sourceId: 'bbm', status: 'failed_permanent' },
      ],
    });
    return { source, checkpoint: checkpoint[0] || null, pendingFailures };
  });

  const loadCollectorDashboard = async (): Promise<CollectorDashboardSnapshot> => {
    const [
      checkpointRows,
      source,
      failures,
      recentJobs,
      pending,
      needsReview,
      retryable,
      permanent,
    ] = await Promise.all([
      AppDataSource.query(
        'SELECT "currentPage", "currentOffset", "lastExternalId", status, "updatedAt", "processedCount" FROM collector_checkpoints WHERE "sourceId" = $1 AND scope = $2',
        ['bbm', 'catalog'],
      ),
      sourceStateRepo.findOne({ where: { sourceId: 'bbm' } }),
      collectorFailureRepo.find({
        where: [
          { sourceId: 'bbm', status: 'needs_review' },
          { sourceId: 'bbm', status: 'failed_retryable' },
          { sourceId: 'bbm', status: 'failed_permanent' },
        ],
        order: { updatedAt: 'DESC' },
        take: 8,
      }),
      jobRepo.find({
        where: { sourceId: 'bbm' },
        order: { startedAt: 'DESC' },
        take: 20,
      }),
      collectorFailureRepo.count({
        where: {
          sourceId: 'bbm',
          status: In(['needs_review', 'failed_retryable', 'failed_permanent']),
        },
      }),
      collectorFailureRepo.count({ where: { sourceId: 'bbm', status: 'needs_review' } }),
      collectorFailureRepo.count({ where: { sourceId: 'bbm', status: 'failed_retryable' } }),
      collectorFailureRepo.count({ where: { sourceId: 'bbm', status: 'failed_permanent' } }),
    ]);

    const checkpoint = checkpointRows[0] as
      | {
          currentPage: number;
          currentOffset: number;
          lastExternalId: string | null;
          status: string;
          updatedAt: Date | string;
          processedCount: number;
        }
      | undefined;
    const totalJob = recentJobs.find(
      (job) => typeof getHttpMetrics(job.metrics)?.['catalog_total_items'] === 'number',
    );
    const httpMetrics = getHttpMetrics(totalJob?.metrics);
    const latestBatchJob = recentJobs.find((job) => job.runType !== 'admin_trigger');
    const totalItems =
      typeof httpMetrics?.['catalog_total_items'] === 'number'
        ? httpMetrics['catalog_total_items']
        : null;
    const processedItems = checkpoint?.processedCount ?? 0;
    const failuresForReview: CollectorReviewItem[] = failures.map((failure) => ({
      externalId: failure.externalId,
      externalUrl: failure.externalUrl ?? null,
      status: failure.status,
      category: failure.category,
      message: failure.message,
      attempts: failure.attempts,
      updatedAt: failure.updatedAt.toISOString(),
    }));

    return {
      runner: collectorRunner.snapshot(),
      checkpoint: checkpoint
        ? {
            currentPage: checkpoint.currentPage,
            currentOffset: checkpoint.currentOffset,
            lastExternalId: checkpoint.lastExternalId,
            status: checkpoint.status,
            updatedAt: new Date(checkpoint.updatedAt).toISOString(),
            processedCount: processedItems,
          }
        : null,
      catalog: {
        totalItems,
        processedItems,
        remainingItems: totalItems === null ? null : Math.max(0, totalItems - processedItems),
        percentComplete:
          totalItems === null || totalItems === 0
            ? null
            : Math.min(100, Math.round((processedItems / totalItems) * 1000) / 10),
        totalPages:
          typeof httpMetrics?.['catalog_total_pages'] === 'number'
            ? httpMetrics['catalog_total_pages']
            : null,
      },
      latestBatch: latestBatchJob
        ? {
            status: latestBatchJob.status,
            recordsProcessed: latestBatchJob.recordsProcessed,
            recordsCreated: latestBatchJob.recordsCreated,
            recordsUpdated: latestBatchJob.recordsUpdated,
            recordsFailed: latestBatchJob.recordsFailed,
            startedAt: latestBatchJob.startedAt?.toISOString() ?? null,
          }
        : null,
      failures: { pending, needsReview, retryable, permanent, items: failuresForReview },
      source: source
        ? {
            status: source.status,
            suspendedUntil: source.suspendedUntil?.toISOString() ?? null,
            reason: source.suspensionReason ?? null,
            lastHttpStatus: source.lastHttpStatus ?? null,
          }
        : null,
    };
  };

  fastify.get('/collector/control/status', loadCollectorDashboard);

  fastify.get('/collector/events', async (_request, reply) => {
    reply.hijack();
    const response = reply.raw;
    response.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });

    let sending = false;
    const publish = async () => {
      if (sending || response.destroyed) return;
      sending = true;
      try {
        const snapshot = await loadCollectorDashboard();
        response.write(`event: collector\ndata: ${JSON.stringify(snapshot)}\n\n`);
      } catch (error) {
        response.write(`event: error\ndata: ${JSON.stringify({ message: String(error) })}\n\n`);
      } finally {
        sending = false;
      }
    };

    void publish();
    const timer = setInterval(() => void publish(), 2000);
    response.on('close', () => clearInterval(timer));
  });

  fastify.post<{ Body: CollectorBackfillOptions }>(
    '/collector/backfill/start',
    async (request, reply) => {
      const options: CollectorBackfillOptions = {
        resetCheckpoint: request.body?.resetCheckpoint === true,
        forceReparse: request.body?.forceReparse === true,
      };
      const activeJob = await jobRepo
        .createQueryBuilder('job')
        .where('job.status = :status', { status: 'running' })
        .andWhere('job.runType <> :adminRunType', { adminRunType: 'admin_trigger' })
        .getOne();
      if (activeJob) {
        reply
          .code(409)
          .send({ message: `O Collector já possui uma execução ativa (${activeJob.id}).` });
        return;
      }

      const source = await sourceStateRepo.findOne({ where: { sourceId: 'bbm' } });
      const suspensionIsActive =
        source?.status === 'suspended' &&
        (!source.suspendedUntil || source.suspendedUntil.getTime() > Date.now());
      if (source?.status === 'blocked' || suspensionIsActive) {
        reply.code(409).send({
          message: source.suspensionReason || `A origem BBM está ${source.status}.`,
          status: source.status,
          suspendedUntil: source.suspendedUntil,
        });
        return;
      }

      if (!collectorRunner.start(options)) {
        reply.code(409).send({ message: 'Já existe uma execução do Collector neste servidor.' });
        return;
      }
      reply.code(202);
      return {
        message: options.resetCheckpoint
          ? 'Reprocessamento completo iniciado desde a primeira página.'
          : 'Backfill iniciado a partir do checkpoint salvo.',
        runner: collectorRunner.snapshot(),
      };
    },
  );

  fastify.post('/collector/backfill/pause', async (_request, reply) => {
    if (!collectorRunner.pause()) {
      reply.code(409).send({ message: 'Não há uma execução ativa para pausar.' });
      return;
    }
    return {
      message: 'A pausa será aplicada quando o lote atual confirmar seu checkpoint.',
      runner: collectorRunner.snapshot(),
    };
  });

  fastify.get<{ Querystring: { page?: string; limit?: string } }>(
    '/collector-failures',
    async (request) => {
      const page = Math.max(1, parseInt(request.query.page || '1', 10));
      const limit = Math.min(100, Math.max(1, parseInt(request.query.limit || '10', 10)));
      const [items, total] = await collectorFailureRepo.findAndCount({
        where: { sourceId: 'bbm' },
        order: { updatedAt: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      });
      return { items, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
    },
  );

  // 4. Histórico de execuções paginado
  fastify.get<{
    Querystring: {
      page?: string;
      limit?: string;
      status?: string;
      sourceId?: string;
    };
  }>('/jobs', async (request) => {
    await reconcileAbandonedJobs();

    const page = Math.max(1, parseInt(request.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(request.query.limit || '10', 10)));
    const skip = (page - 1) * limit;

    const queryBuilder = jobRepo.createQueryBuilder('job').orderBy('job.startedAt', 'DESC');

    if (request.query.status) {
      queryBuilder.andWhere('job.status = :status', { status: request.query.status });
    }

    if (request.query.sourceId) {
      queryBuilder.andWhere('job.sourceId = :sourceId', { sourceId: request.query.sourceId });
    }

    const [items, total] = await queryBuilder.skip(skip).take(limit).getManyAndCount();

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  });

  // 5. Detalhes de um job por ID
  fastify.get<{ Params: { id: string } }>('/jobs/:id', async (request, reply) => {
    const job = await jobRepo.findOne({ where: { id: request.params.id } });
    if (!job) {
      reply.code(404).send({ message: 'Execução de importação não encontrada.' });
      return;
    }
    return job;
  });

  // 6. Disparo assíncrono com exclusão mútua contra concorrência (409 Conflict)
  fastify.post<{
    Body: { sourceId?: string; limit?: number; action?: 'sync' | 'revalidate' };
  }>('/jobs/trigger', async (_request, reply) => {
    reply.code(410);
    return {
      message: 'Este disparador simulado foi removido. Use /collector/backfill/start.',
    };
  });

  // 7. Listagem de problemas de qualidade de dados (Data Quality Issues)
  fastify.get<{
    Querystring: {
      page?: string;
      limit?: string;
      severity?: string;
      status?: string;
      entityType?: string;
    };
  }>('/quality-issues', async (request) => {
    const page = Math.max(1, parseInt(request.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(request.query.limit || '15', 10)));
    const skip = (page - 1) * limit;

    const qb = issueRepo.createQueryBuilder('issue').orderBy('issue.detectedAt', 'DESC');

    if (request.query.severity) {
      qb.andWhere('issue.severity = :severity', { severity: request.query.severity });
    }
    if (request.query.status) {
      qb.andWhere('issue.status = :status', { status: request.query.status });
    }
    if (request.query.entityType) {
      qb.andWhere('issue.entityType = :entityType', { entityType: request.query.entityType });
    }

    const [items, total] = await qb.skip(skip).take(limit).getManyAndCount();

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  });

  // 8. Resolução / Atualização de status de uma issue
  fastify.patch<{
    Params: { id: string };
    Body: { status: 'open' | 'resolved' | 'ignored' };
  }>('/quality-issues/:id', async (request, reply) => {
    const issue = await issueRepo.findOne({ where: { id: request.params.id } });
    if (!issue) {
      reply.code(404).send({ message: 'Inconsistência não encontrada.' });
      return;
    }

    issue.status = request.body.status;
    if (request.body.status === 'resolved') {
      issue.resolvedAt = new Date();
    } else {
      issue.resolvedAt = null;
    }

    await issueRepo.save(issue);
    return issue;
  });
};
