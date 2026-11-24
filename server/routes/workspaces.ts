import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../types';
import { getGithubSession, verifyMutatingRequestOrigin } from '../lib/crypto';
import { SAFE_ID_REGEX, zValidate } from '../lib/validation';
import {
  getUserWorkspaceById,
  listUserWorkspaces,
  softDeleteUserWorkspace,
  upsertUserWorkspace,
} from '../services/workspaceService';

const workspaceIdParamSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(SAFE_ID_REGEX, 'Invalid workspace ID.'),
});

const tablePositionSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

const stickyNoteSchema = z.object({
  id: z.string().max(100),
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite(),
  color: z.enum(['amber', 'sky', 'emerald', 'rose', 'slate']),
  title: z.string().max(500),
  content: z.string().max(20000),
  author: z.string().max(200),
  updatedAt: z.string().max(64),
  linkedTarget: z.string().max(200).optional(),
  collapsed: z.boolean().optional(),
});

const workspacePutBodySchema = z.object({
  id: z.string().max(120).optional(),
  name: z
    .string()
    .trim()
    .min(1, 'Workspace name is required.')
    .max(140),
  description: z.string().max(500).optional(),
  dbml: z.string().max(4 * 1024 * 1024, 'Schema exceeds 4 MB cloud limit.'),
  schemaFiles: z
    .array(
      z.object({
        id: z.string().max(120),
        path: z.string().max(500),
        content: z.string().max(4 * 1024 * 1024),
        sha: z.string().max(128).optional(),
        lastSyncedContent: z.string().max(4 * 1024 * 1024).optional(),
        lastSyncedAt: z.string().max(64).optional(),
      })
    )
    .max(400)
    .optional(),
  activeSchemaFile: z.string().max(260).optional(),
  schemaFolder: z.string().max(180).optional(),
  tablePositions: z.record(z.string(), tablePositionSchema).optional(),
  groupMeta: z
    .record(
      z.string(),
      z.object({
        description: z.string().max(2000).optional(),
        collapsed: z.boolean().optional(),
      })
    )
    .optional(),
  stickyNotes: z.array(stickyNoteSchema).max(500).optional(),
  detailLevel: z.enum(['full', 'columns', 'keys', 'names']).optional(),
  versions: z
    .array(
      z.object({
        id: z.string().max(120),
        tag: z.string().max(64),
        title: z.string().max(200),
        description: z.string().max(2000),
        dbml: z.string().max(4 * 1024 * 1024),
        tablePositions: z.record(z.string(), tablePositionSchema),
        stickyNotes: z.array(stickyNoteSchema).max(500),
        createdAt: z.string().max(64),
        isPublished: z.boolean(),
      })
    )
    .max(100)
    .optional(),
  githubLink: z
    .object({
      owner: z.string().max(100),
      repo: z.string().max(100),
      branch: z.string().max(200),
      path: z.string().max(500),
      sha: z.string().max(128),
      htmlUrl: z.string().max(1000).optional(),
      lastSyncedDbml: z.string().max(4 * 1024 * 1024),
      lastSyncedAt: z.string().max(64),
    })
    .optional(),
  githubRepoLink: z
    .object({
      owner: z.string().max(100),
      repo: z.string().max(100),
      branch: z.string().max(200),
      schemaFolder: z.string().max(300),
      lastSyncedAt: z.string().max(64),
    })
    .optional(),
  urlLink: z
    .object({
      url: z.string().max(2048),
      resolvedUrl: z.string().max(2048).optional(),
      loadedAt: z.string().max(64),
    })
    .optional(),
  createdAt: z.string().max(64).optional(),
  updatedAt: z.string().max(64).optional(),
  syncOrigin: z.enum(['local', 'cloud']).optional(),
  cloudSyncedAt: z.string().max(64).optional(),
  cloudRevision: z.number().finite().optional(),
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
  .get('/:id', zValidate('param', workspaceIdParamSchema), async (c) => {
    const db = c.env?.DB;
    if (!db) {
      return c.json({ error: 'Cloud database (D1) is not configured.' }, 503);
    }
    const session = await getGithubSession(c);
    if (!session) {
      return c.json({ error: 'Authentication required.' }, 401);
    }

    const { id } = c.req.valid('param');
    const result = await getUserWorkspaceById(db, session.user, id);
    if (!result.ok) {
      return c.json({ error: result.error }, result.status);
    }
    return c.json({ workspace: result.data }, 200);
  })
  .put(
    '/:id',
    zValidate('param', workspaceIdParamSchema),
    zValidate('json', workspacePutBodySchema),
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
      const result = await upsertUserWorkspace(
        db,
        session.user,
        id,
        c.req.valid('json')
      );
      if (!result.ok) {
        return c.json({ error: result.error }, result.status);
      }
      return c.json(result.data, 200);
    }
  )
  .delete('/:id', zValidate('param', workspaceIdParamSchema), async (c) => {
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
      const result = await softDeleteUserWorkspace(db, session.user, id);
      if (!result.ok) {
        return c.json({ error: result.error }, result.status);
      }
      return c.json(result.data, 200);
    }
  );
