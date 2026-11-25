import { Hono } from 'hono';
import { z } from 'zod';
import { ForbiddenError, ValidationError } from '../../../../shared/domain/errors';
import { executeCreateShareLink } from '../../../application/usecases/shares/createShareLink';
import { executeListWorkspaceShares } from '../../../application/usecases/shares/listWorkspaceShares';
import { executeResolvePublicShare } from '../../../application/usecases/shares/resolvePublicShare';
import { executeRevokeShareLink } from '../../../application/usecases/shares/revokeShareLink';
import { executeUpdateShareLink } from '../../../application/usecases/shares/updateShareLink';
import { createRequestContainer } from '../container';
import {
  SAFE_ID_REGEX,
  SAFE_TOKEN_REGEX,
  zValidate,
} from '../middleware/validation';
import { verifyMutatingRequestOrigin } from '../security/httpSecurity';
import type { ApiContext, AppEnv } from '../types';

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
  const container = createRequestContainer(c);
  const { shareRepository } = container.requireDatabaseRepositories(
    'Cloud sharing service is not configured.'
  );
  const data = await executeResolvePublicShare({
    shareRepository,
    rawToken: token,
    requestedVersionTag: versionParam,
  });
  return c.json(data, 200);
}

export const shareRoutes = new Hono<{ Bindings: AppEnv }>()
  .get(
    '/workspaces/:id/shares',
    zValidate('param', workspaceIdParamSchema),
    async (c) => {
      const container = createRequestContainer(c);
      const { shareRepository } = container.requireDatabaseRepositories();
      const session = await container.requireSession();
      const { id } = c.req.valid('param');
      const shares = await executeListWorkspaceShares({
        shareRepository,
        user: session.user,
        rawWorkspaceId: id,
      });
      return c.json({ shares }, 200);
    }
  )
  .post(
    '/workspaces/:id/shares',
    zValidate('param', workspaceIdParamSchema),
    zValidate('json', shareMutationBodySchema),
    async (c) => {
      if (!verifyMutatingRequestOrigin(c)) {
        throw new ForbiddenError('Invalid request origin.');
      }
      const container = createRequestContainer(c);
      const { shareRepository } = container.requireDatabaseRepositories();
      const session = await container.requireSession();
      const { id } = c.req.valid('param');
      const share = await executeCreateShareLink({
        shareRepository,
        tokenCipher: container.tokenCipher,
        user: session.user,
        rawWorkspaceId: id,
        body: c.req.valid('json'),
      });
      return c.json({ share }, 200);
    }
  )
  .patch(
    '/workspaces/:id/shares/:shareId',
    zValidate('param', shareItemParamSchema),
    zValidate('json', shareMutationBodySchema),
    async (c) => {
      if (!verifyMutatingRequestOrigin(c)) {
        throw new ForbiddenError('Invalid request origin.');
      }
      const container = createRequestContainer(c);
      const { shareRepository } = container.requireDatabaseRepositories();
      const session = await container.requireSession();
      const { id, shareId } = c.req.valid('param');
      const share = await executeUpdateShareLink({
        shareRepository,
        user: session.user,
        rawWorkspaceId: id,
        rawShareId: shareId,
        body: c.req.valid('json'),
      });
      return c.json({ share }, 200);
    }
  )
  .delete(
    '/workspaces/:id/shares/:shareId',
    zValidate('param', shareItemParamSchema),
    async (c) => {
      if (!verifyMutatingRequestOrigin(c)) {
        throw new ForbiddenError('Invalid request origin.');
      }
      const container = createRequestContainer(c);
      const { shareRepository } = container.requireDatabaseRepositories();
      const session = await container.requireSession();
      const { id, shareId } = c.req.valid('param');
      const result = await executeRevokeShareLink({
        shareRepository,
        user: session.user,
        rawWorkspaceId: id,
        rawShareId: shareId,
      });
      return c.json(result, 200);
    }
  )
  .get(
    '/share/:token',
    zValidate('param', publicShareTokenParamSchema),
    zValidate('query', publicShareQuerySchema),
    async (c) =>
      handlePublicShare(c, c.req.valid('param').token, c.req.valid('query').v)
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
        throw new ValidationError('Invalid version tag.');
      }
      return handlePublicShare(c, token, decodedVersion);
    }
  );
