import { Hono } from 'hono';
import { z } from 'zod';
import type { ApiContext, AppEnv } from '../types';
import { getGithubSession, verifyMutatingRequestOrigin } from '../lib/crypto';
import {
  SAFE_ID_REGEX,
  SAFE_TOKEN_REGEX,
  zValidate,
} from '../lib/validation';
import {
  createWorkspaceShareLink,
  listWorkspaceShares,
  resolvePublicShareLink,
  revokeWorkspaceShareLink,
  updateWorkspaceShareLink,
} from '../services/shareService';

const workspaceIdParamSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(SAFE_ID_REGEX, 'Invalid workspace ID.'),
});

const shareItemParamSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(SAFE_ID_REGEX, 'Invalid workspace ID.'),
  shareId: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(SAFE_ID_REGEX, 'Invalid share ID.'),
});

const shareMutationBodySchema = z.object({
  label: z.string().max(120).optional(),
  pinnedVersionTag: z.string().max(64).nullable().optional(),
  defaultView: z.enum(['docs', 'diagram']).optional(),
  allowDiagramExport: z.boolean().optional(),
  expiresInDays: z.number().finite().min(1).max(3650).nullable().optional(),
  expiresAt: z.string().max(64).nullable().optional(),
});

const publicShareTokenParamSchema = z.object({
  token: z
    .string()
    .trim()
    .regex(SAFE_TOKEN_REGEX, 'Invalid share link.'),
});

const publicShareTokenVersionParamSchema = z.object({
  token: z
    .string()
    .trim()
    .regex(SAFE_TOKEN_REGEX, 'Invalid share link.'),
  versionTag: z.string().min(1).max(128),
});

const publicShareQuerySchema = z.object({
  v: z.string().max(64).optional(),
});

async function handlePublicShare(
  c: ApiContext,
  token: string,
  versionParam?: string
) {
  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: 'Cloud sharing service is not configured.' }, 503);
  }

  const result = await resolvePublicShareLink(
    db,
    token,
    versionParam || c.req.query('v')
  );
  if (!result.ok) {
    return c.json({ error: result.error }, result.status);
  }
  return c.json(result.data, 200);
}

export const shareRoutes = new Hono<{ Bindings: AppEnv }>()
  .get(
    '/workspaces/:id/shares',
    zValidate('param', workspaceIdParamSchema),
    async (c) => {
      const db = c.env?.DB;
      if (!db) {
        return c.json({ error: 'Cloud database (D1) is not configured.' }, 503);
      }
      const session = await getGithubSession(c);
      if (!session) {
        return c.json({ error: 'Authentication required.' }, 401);
      }

      const { id } = c.req.valid('param');
      const result = await listWorkspaceShares(db, session.user, id);
      if (!result.ok) {
        return c.json({ error: result.error }, result.status);
      }
      return c.json({ shares: result.data }, 200);
    }
  )
  .post(
    '/workspaces/:id/shares',
    zValidate('param', workspaceIdParamSchema),
    zValidate('json', shareMutationBodySchema),
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

      const { id } = c.req.valid('param');
      const result = await createWorkspaceShareLink(
        db,
        session.user,
        id,
        c.req.valid('json')
      );
      if (!result.ok) {
        return c.json({ error: result.error }, result.status);
      }
      return c.json({ share: result.data }, 200);
    }
  )
  .patch(
    '/workspaces/:id/shares/:shareId',
    zValidate('param', shareItemParamSchema),
    zValidate('json', shareMutationBodySchema),
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

      const { id, shareId } = c.req.valid('param');
      const result = await updateWorkspaceShareLink(
        db,
        session.user,
        id,
        shareId,
        c.req.valid('json')
      );
      if (!result.ok) {
        return c.json({ error: result.error }, result.status);
      }
      return c.json({ share: result.data }, 200);
    }
  )
  .delete(
    '/workspaces/:id/shares/:shareId',
    zValidate('param', shareItemParamSchema),
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

      const { id, shareId } = c.req.valid('param');
      const result = await revokeWorkspaceShareLink(
        db,
        session.user,
        id,
        shareId
      );
      if (!result.ok) {
        return c.json({ error: result.error }, result.status);
      }
      return c.json(result.data, 200);
    }
  )
  .get(
    '/share/:token',
    zValidate('param', publicShareTokenParamSchema),
    zValidate('query', publicShareQuerySchema),
    async (c) => await handlePublicShare(c, c.req.valid('param').token)
  )
  .get(
    '/share/:token/:versionTag',
    zValidate('param', publicShareTokenVersionParamSchema),
    async (c) => {
      const { token, versionTag } = c.req.valid('param');
      let decodedVersion: string;
      try {
        decodedVersion = decodeURIComponent(versionTag);
      } catch {
        return c.json({ error: 'Invalid version tag.' }, 400);
      }
      return await handlePublicShare(c, token, decodedVersion);
    }
  );
