/** Hono アプリ組み立て（テスト・dev・Worker 共通） */
import { Hono } from 'hono';
import { dbProvider, sessionAuth, csrfGuard, errorHandler, notFoundHandler, securityHeaders, requireRole } from './middleware.ts';
import { authRoutes } from './routes/auth.ts';
import { oppRoutes } from './routes/opportunities.ts';
import { planRoutes } from './routes/plans.ts';
import { customerRoutes, masterRoutes, metaRoutes, dashboardRoutes, healthRoutes, snapshotRoutes, auditRoutes, notificationRoutes, adminRoutes } from './routes/misc.ts';
import { csvRoutes } from './routes/csv.ts';
import { internalRoutes } from './routes/internal.ts';
import type { AppEnv } from './types.ts';

export function createApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.use('*', dbProvider());
  app.use('*', securityHeaders);
  app.use('/api/*', sessionAuth);
  app.use('/api/*', csrfGuard);
  app.onError(errorHandler);
  app.notFound(notFoundHandler);

  // 公開
  app.route('/api/internal', internalRoutes);

  // 認証
  app.route('/api/auth', authRoutes);

  // 要認証
  app.use('/api/meta', requireRole('viewer', 'sales', 'manager', 'hq'));
  app.use('/api/opportunities', requireRole('viewer', 'sales', 'manager', 'hq'));
  app.use('/api/plans', requireRole('viewer', 'sales', 'manager', 'hq'));
  app.use('/api/customers', requireRole('viewer', 'sales', 'manager', 'hq'));
  app.use('/api/masters', requireRole('viewer', 'sales', 'manager', 'hq'));
  app.use('/api/dashboard', requireRole('viewer', 'sales', 'manager', 'hq'));
  app.use('/api/health', requireRole('viewer', 'sales', 'manager', 'hq'));
  app.use('/api/snapshots', requireRole('viewer', 'sales', 'manager', 'hq'));
  app.use('/api/notifications', requireRole('viewer', 'sales', 'manager', 'hq'));
  app.use('/api/audit-logs', requireRole('hq'));
  app.use('/api/admin', requireRole('admin'));
  app.use('/api/csv', requireRole('sales', 'manager', 'hq'));

  app.route('/api/meta', metaRoutes);
  app.route('/api/opportunities', oppRoutes);
  app.route('/api/plans', planRoutes);
  app.route('/api/customers', customerRoutes);
  app.route('/api/masters', masterRoutes);
  app.route('/api/dashboard', dashboardRoutes);
  app.route('/api/health', healthRoutes);
  app.route('/api/snapshots', snapshotRoutes);
  app.route('/api/audit-logs', auditRoutes);
  app.route('/api/notifications', notificationRoutes);
  app.route('/api/admin', adminRoutes);
  app.route('/api/csv', csvRoutes);

  return app;
}
