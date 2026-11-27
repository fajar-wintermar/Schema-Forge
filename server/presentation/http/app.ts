import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { ensureMigrations } from '../../infrastructure/persistence/d1/d1Migrator';
import { mapErrorToHttpResponse } from './middleware/errorMapper';
import {
  apiRateLimiter,
  strictEndpointRateLimiter,
} from './middleware/rateLimit';
import { optionalSessionHeadersSchema, zValidate } from './middleware/validation';
import { authRoutes } from './routes/authRoutes';
import { fetchUrlRoutes } from './routes/fetchUrlRoutes';
import { githubRoutes } from './routes/githubRoutes';
import { shareRoutes } from './routes/shareRoutes';
import { workspaceRoutes } from './routes/workspaceRoutes';
import { isAllowedCorsOrigin } from './security/httpSecurity';
import type { AppEnv } from './types';

export type { AppEnv } from './types';

const SMALL_JSON_BODY_LIMIT = 256 * 1024; // 256 KB
const WORKSPACE_BODY_LIMIT = 10 * 1024 * 1024; // 10 MB

export const routes = new Hono<{ Bindings: AppEnv }>()
  .use(
    '*',
    secureHeaders({
      xFrameOptions: false,
      crossOriginOpenerPolicy: 'same-origin-allow-popups',
      crossOriginResourcePolicy: 'same-site',
      xContentTypeOptions: 'nosniff',
      referrerPolicy: 'strict-origin-when-cross-origin',
      xPermittedCrossDomainPolicies: 'none',
    })
  )
  .get('/healthz', async (c) => {
    const db = c.env?.DB;
    if (!db) {
      return c.json({ status: 'error', db: 'unavailable' }, 503);
    }
    try {
      const probe = await db.prepare('SELECT 1 AS ok').first<{ ok: number }>();
      if (!probe || probe.ok !== 1) {
        return c.json({ status: 'error', db: 'unavailable' }, 503);
      }
      return c.json({ status: 'ok', db: 'connected' }, 200);
    } catch (err) {
      console.error('[Healthz] Database connectivity check failed:', err);
      return c.json({ status: 'error', db: 'unavailable' }, 503);
    }
  })
  .use(
    '/api/*',
    cors({
      origin: (origin, c) => (isAllowedCorsOrigin(origin, c) ? origin : ''),
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'X-Requested-With'],
      credentials: true,
      maxAge: 600,
    })
  )
  .use('/api/*', apiRateLimiter)
  .use('/api/fetch-url/*', strictEndpointRateLimiter)
  .use('/api/github/*', strictEndpointRateLimiter)
  .use('/api/auth/*', strictEndpointRateLimiter)
  .use('/api/ai/*', strictEndpointRateLimiter)
  .use('/api/gemini/*', strictEndpointRateLimiter)
  .use(
    '/api/fetch-url/*',
    bodyLimit({
      maxSize: SMALL_JSON_BODY_LIMIT,
      onError: (c) => c.json({ error: 'Request payload too large.' }, 413),
    })
  )
  .use(
    '/api/auth/*',
    bodyLimit({
      maxSize: SMALL_JSON_BODY_LIMIT,
      onError: (c) => c.json({ error: 'Request payload too large.' }, 413),
    })
  )
  .use(
    '/api/ai/*',
    bodyLimit({
      maxSize: SMALL_JSON_BODY_LIMIT,
      onError: (c) => c.json({ error: 'Request payload too large.' }, 413),
    })
  )
  .use(
    '/api/gemini/*',
    bodyLimit({
      maxSize: SMALL_JSON_BODY_LIMIT,
      onError: (c) => c.json({ error: 'Request payload too large.' }, 413),
    })
  )
  .use(
    '/api/*',
    bodyLimit({
      maxSize: WORKSPACE_BODY_LIMIT,
      onError: (c) => c.json({ error: 'Request payload too large.' }, 413),
    })
  )
  .use('/api/*', zValidate('header', optionalSessionHeadersSchema))
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
  .route('/api', shareRoutes)
  .notFound((c) => {
    return c.json({ error: 'API endpoint not found.' }, 404);
  })
  .onError((err, c) => mapErrorToHttpResponse(err, c));

export const api = routes;
export type AppType = typeof routes;
