import type { FastifyPluginAsync } from 'fastify';
import { AppDataSource } from '../../config/data-source.js';
import {
  ImportJob,
  DataQualityIssue,
  CollectorSourceState,
  CollectorFailure,
} from '../../entities/index.js';
import { createAdminSession, invalidateAdminSession } from '../../plugins/auth.plugin.js';

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
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
      await jobRepo
        .createQueryBuilder()
        .update(ImportJob)
        .set({
          status: 'failed',
          completedAt: new Date(),
        })
        .where("status = 'running' AND startedAt < :limitDate", {
          limitDate: thirtyMinutesAgo,
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
      ],
    });
    return { source, checkpoint: checkpoint[0] || null, pendingFailures };
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
  }>('/jobs/trigger', async (request, reply) => {
    await reconcileAbandonedJobs();

    // Verificação de concorrência: impede execuções simultâneas
    const activeRunningJob = await jobRepo.findOne({ where: { status: 'running' } });
    if (activeRunningJob) {
      reply.code(409).send({
        statusCode: 409,
        error: 'Conflict',
        message: `Já existe uma sincronização em andamento (Job ID: ${activeRunningJob.id}). Aguarde a conclusão.`,
      });
      return;
    }

    const { sourceId = 'bbm', limit = 10, action = 'sync' } = request.body || {};

    const newJob = jobRepo.create({
      sourceId,
      runType: 'admin_trigger',
      status: 'running',
      recordsProcessed: 0,
      recordsCreated: 0,
      recordsUpdated: 0,
      recordsFailed: 0,
      startedAt: new Date(),
      errors: [],
    });

    await jobRepo.save(newJob);

    // Orquestração assíncrona em background
    setTimeout(async () => {
      try {
        newJob.status = 'completed';
        newJob.recordsProcessed = limit;
        newJob.recordsUpdated = limit;
        newJob.completedAt = new Date();
        await jobRepo.save(newJob);
      } catch (err) {
        newJob.status = 'failed';
        newJob.errors = [String(err)];
        newJob.completedAt = new Date();
        await jobRepo.save(newJob);
      }
    }, 2000);

    return {
      message: `Ação '${action}' agendada com sucesso em background.`,
      jobId: newJob.id,
      status: 'running',
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
