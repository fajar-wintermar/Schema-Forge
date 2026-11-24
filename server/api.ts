import { Hono } from 'hono';
import type { AppEnv } from './types';
import { ensureMigrations } from './lib/migrator';
import { authRoutes } from './routes/auth';
import { fetchUrlRoutes } from './routes/fetchUrl';
import { githubRoutes } from './routes/github';
import { shareRoutes } from './routes/share';
import { workspaceRoutes } from './routes/workspaces';

export type { AppEnv } from './types';

export const routes = new Hono<{ Bindings: AppEnv }>()
  .use('/api/*', async (c, next) => {
    if (c.env?.DB && !c.req.path.startsWith('/api/fetch-url')) {
      await ensureMigrations(c.env.DB);
    }
    await next();
  })
  .route('/api/auth', authRoutes)
  .route('/api/fetch-url', fetchUrlRoutes)
  .route('/api/github', githubRoutes)
  .route('/api/workspaces', workspaceRoutes)
  .route('/api', shareRoutes);

export const api = routes;
export type AppType = typeof routes;
