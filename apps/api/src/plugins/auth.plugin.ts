import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';

declare module 'fastify' {
  interface FastifyRequest {
    isAdmin?: boolean;
  }
}

// Armazenamento em memória para tokens de sessão ativos com tempo de expiração
const activeAdminSessions = new Map<string, { createdAt: number; expiresAt: number }>();
const SESSION_TTL_MS = 1000 * 60 * 60 * 4; // 4 horas

export function createAdminSession(): string {
  const token = 'atlas_sess_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
  activeAdminSessions.set(token, {
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  return token;
}

export function invalidateAdminSession(token: string): boolean {
  return activeAdminSessions.delete(token);
}

export function isValidAdminSession(token: string): boolean {
  const session = activeAdminSessions.get(token);
  if (!session) return false;
  if (Date.now() > session.expiresAt) {
    activeAdminSessions.delete(token);
    return false;
  }
  return true;
}

const adminAuthPluginAsync: FastifyPluginAsync = async (fastify) => {
  fastify.decorate(
    'authenticateAdmin',
    async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      const authHeader = request.headers['authorization'];
      const apiKeyHeader = request.headers['x-admin-key'];
      const expectedApiKey = process.env.ADMIN_API_KEY || 'atlas_admin_secret_token_2026';

      let token: string | undefined;

      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7).trim();
      } else if (apiKeyHeader && typeof apiKeyHeader === 'string') {
        token = apiKeyHeader.trim();
      }

      // Valida tanto a chave mestra configurada no servidor quanto tokens de sessão emitidos pelo login
      const isMasterKey = token && token === expectedApiKey;
      const isSessionToken = token && isValidAdminSession(token);

      if (!token || (!isMasterKey && !isSessionToken)) {
        reply.code(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message:
            'Acesso restrito à administração. Efetue login ou forneça uma credencial administrativa válida.',
        });
        return;
      }

      request.isAdmin = true;
    },
  );
};

export const adminAuthPlugin = fp(adminAuthPluginAsync, {
  name: 'admin-auth-plugin',
});
