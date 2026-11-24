import { Hono } from 'hono';
import { validator } from 'hono/validator';
import type { AppEnv } from '../types';
import { getGithubSession, verifyMutatingRequestOrigin } from '../lib/crypto';
import { isRecord } from '../lib/http';
import {
  getUserWorkspaceById,
  listUserWorkspaces,
  softDeleteUserWorkspace,
  upsertUserWorkspace,
  type IncomingWorkspaceInput,
} from '../services/workspaceService';

const workspaceJsonValidator = validator('json', (value, c) => {
  if (!isRecord(value)) {
    return c.json({ error: 'Invalid JSON workspace payload.' }, 400);
  }
  const payload: IncomingWorkspaceInput = value;
  return payload;
});

export const workspaceRoutes = new Hono<{ Bindings: AppEnv }>()
  .get('/', async (c) => {
    const db = c.env?.DB;
    if (!db) {
      return c.json({ error: 'Cloud database (D1) is not configured.' }, 503);
    }
    const session = await getGithubSession(c);
    if (!session) {
      return c.json({ error: 'Authentication required.' }, 401);
    }

    const workspaces = await listUserWorkspaces(db, session.user);
    return c.json({ workspaces }, 200);
  })
  .get('/:id', async (c) => {
    const db = c.env?.DB;
    if (!db) {
      return c.json({ error: 'Cloud database (D1) is not configured.' }, 503);
    }
    const session = await getGithubSession(c);
    if (!session) {
      return c.json({ error: 'Authentication required.' }, 401);
    }

    const result = await getUserWorkspaceById(
      db,
      session.user,
      c.req.param('id')
    );
    if (!result.ok) {
      return c.json({ error: result.error }, result.status);
    }
    return c.json({ workspace: result.data }, 200);
  })
  .put('/:id', workspaceJsonValidator, async (c) => {
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

    const result = await upsertUserWorkspace(
      db,
      session.user,
      c.req.param('id'),
      c.req.valid('json')
    );
    if (!result.ok) {
      return c.json({ error: result.error }, result.status);
    }
    return c.json(result.data, 200);
  })
  .delete('/:id', async (c) => {
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

    const result = await softDeleteUserWorkspace(
      db,
      session.user,
      c.req.param('id')
    );
    if (!result.ok) {
      return c.json({ error: result.error }, result.status);
    }
    return c.json(result.data, 200);
  });
