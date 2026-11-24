import { Hono } from 'hono';
import { validator } from 'hono/validator';
import type { ApiContext, AppEnv } from '../types';
import { getGithubSession, verifyMutatingRequestOrigin } from '../lib/crypto';
import { isRecord } from '../lib/http';
import {
  createWorkspaceShareLink,
  listWorkspaceShares,
  resolvePublicShareLink,
  revokeWorkspaceShareLink,
  updateWorkspaceShareLink,
  type ShareMutationPayload,
} from '../services/shareService';

const shareCreateValidator = validator('json', (value): ShareMutationPayload => {
  return isRecord(value) ? value : {};
});

const shareUpdateValidator = validator('json', (value, c) => {
  if (!isRecord(value)) {
    return c.json({ error: 'Invalid JSON payload.' }, 400);
  }
  const payload: ShareMutationPayload = value;
  return payload;
});

async function handlePublicShare(c: ApiContext, versionParam?: string) {
  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: 'Cloud sharing service is not configured.' }, 503);
  }

  const result = await resolvePublicShareLink(
    db,
    c.req.param('token') || '',
    versionParam || c.req.query('v')
  );
  if (!result.ok) {
    return c.json({ error: result.error }, result.status);
  }
  return c.json(result.data, 200);
}

export const shareRoutes = new Hono<{ Bindings: AppEnv }>()
  .get('/workspaces/:id/shares', async (c) => {
    const db = c.env?.DB;
    if (!db) {
      return c.json({ error: 'Cloud database (D1) is not configured.' }, 503);
    }
    const session = await getGithubSession(c);
    if (!session) {
      return c.json({ error: 'Authentication required.' }, 401);
    }

    const result = await listWorkspaceShares(
      db,
      session.user,
      c.req.param('id')
    );
    if (!result.ok) {
      return c.json({ error: result.error }, result.status);
    }
    return c.json({ shares: result.data }, 200);
  })
  .post('/workspaces/:id/shares', shareCreateValidator, async (c) => {
    if (!verifyMutatingRequestOrigin(c)) {
      return c.json({ error: 'Invalid request origin.' }, 403);
    }
    const db = c.env?.DB;
    if (!db) {
      return c.json({ error: 'Cloud database (D1) is not configured.' }, 503);
    }
    const session = await getGithubSession(c);
    if (!session) {
      return c.json({ error: 'Authentication required.' }, 401);
    }

    const result = await createWorkspaceShareLink(
      db,
      session.user,
      c.req.param('id'),
      c.req.valid('json')
    );
    if (!result.ok) {
      return c.json({ error: result.error }, result.status);
    }
    return c.json({ share: result.data }, 200);
  })
  .patch(
    '/workspaces/:id/shares/:shareId',
    shareUpdateValidator,
    async (c) => {
      if (!verifyMutatingRequestOrigin(c)) {
        return c.json({ error: 'Invalid request origin.' }, 403);
      }
      const db = c.env?.DB;
      if (!db) {
        return c.json({ error: 'Cloud database (D1) is not configured.' }, 503);
      }
      const session = await getGithubSession(c);
      if (!session) {
        return c.json({ error: 'Authentication required.' }, 401);
      }

      const result = await updateWorkspaceShareLink(
        db,
        session.user,
        c.req.param('id'),
        c.req.param('shareId'),
        c.req.valid('json')
      );
      if (!result.ok) {
        return c.json({ error: result.error }, result.status);
      }
      return c.json({ share: result.data }, 200);
    }
  )
  .delete('/workspaces/:id/shares/:shareId', async (c) => {
    if (!verifyMutatingRequestOrigin(c)) {
      return c.json({ error: 'Invalid request origin.' }, 403);
    }
    const db = c.env?.DB;
    if (!db) {
      return c.json({ error: 'Cloud database (D1) is not configured.' }, 503);
    }
    const session = await getGithubSession(c);
    if (!session) {
      return c.json({ error: 'Authentication required.' }, 401);
    }

    const result = await revokeWorkspaceShareLink(
      db,
      session.user,
      c.req.param('id'),
      c.req.param('shareId')
    );
    if (!result.ok) {
      return c.json({ error: result.error }, result.status);
    }
    return c.json(result.data, 200);
  })
  .get('/share/:token', (c) => handlePublicShare(c))
  .get('/share/:token/:versionTag', (c) =>
    handlePublicShare(c, decodeURIComponent(c.req.param('versionTag')))
  );
