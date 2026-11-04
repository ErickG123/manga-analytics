import Fastify from 'fastify';
import { AppDataSource } from './config/data-source.js';
import {
  registerCorsPlugin,
  registerSensiblePlugin,
  registerSwaggerPlugin,
  adminAuthPlugin,
} from './plugins/index.js';
import { registerHealthRoutes } from './modules/health/health.routes.js';
import { registerMangaRoutes } from './modules/manga/routes/manga.routes.js';
import { registerPublisherRoutes } from './modules/publisher/routes/publisher.routes.js';
import { registerVolumeRoutes } from './modules/volume/volume.routes.js';
import { registerCalendarRoutes } from './modules/calendar/calendar.routes.js';
import { registerAnalyticsRoutes } from './modules/analytics/analytics.routes.js';
import { registerReportsRoutes } from './modules/reports/reports.routes.js';
import { adminRoutes } from './modules/admin/admin.routes.js';

export async function buildApp() {
  const app = Fastify({
    logger: process.env.NODE_ENV === 'test' ? false : true,
  });

  // Plugins globais
  await registerSensiblePlugin(app);
  await registerCorsPlugin(app);
  await registerSwaggerPlugin(app);
  await app.register(adminAuthPlugin);

  // Inicialização TypeORM
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  // Módulos por Domínio
  await registerHealthRoutes(app);
  await registerMangaRoutes(app);
  await registerPublisherRoutes(app);
  await registerVolumeRoutes(app);
  await registerCalendarRoutes(app);
  await registerAnalyticsRoutes(app);
  await registerReportsRoutes(app);

  // Rotas Administrativas Protegidas
  await app.register(adminRoutes, { prefix: '/api/admin' });

  return app;
}
