import { Hono } from 'hono';
import { z } from 'zod';
import { ValidationError } from '../../../../shared/domain/errors';
import {
  executeGetGithubRepoInfo,
  executeGetGithubRepoTree,
} from '../../../application/usecases/github/inspectRepo';
import { executeGetGithubCommitHistory } from '../../../application/usecases/github/readGithubCommits';
import {
  executeGetGithubModularFolder,
  executeGetGithubSingleFile,
} from '../../../application/usecases/github/readGithubFiles';
import { createRequestContainer } from '../container';
import { GITHUB_SLUG_REGEX, zValidate } from '../middleware/validation';
import type { AppEnv } from '../types';

const ownerField = z
  .string()
  .trim()
  .min(1, 'Missing owner parameter.')
  .max(100)
  .regex(GITHUB_SLUG_REGEX, 'Invalid repository owner.');

const repoField = z
  .string()
  .trim()
  .min(1, 'Missing repo parameter.')
  .max(100)
  .regex(GITHUB_SLUG_REGEX, 'Invalid repository name.');

const repoInfoQuerySchema = z.object({
  owner: ownerField,
  repo: repoField,
});

const treeQuerySchema = z.object({
  owner: ownerField,
  repo: repoField,
  branch: z.string().trim().min(1).max(200).optional(),
});

const fileQuerySchema = z.object({
  owner: ownerField,
  repo: repoField,
  path: z.string().trim().min(1, 'Missing path parameter.').max(500),
  ref: z.string().trim().min(1).max(200).optional(),
});

const folderQuerySchema = z.object({
  owner: ownerField,
  repo: repoField,
  branch: z.string().trim().max(200).optional(),
  ref: z.string().trim().max(200).optional(),
  folder: z.string().trim().max(300).optional(),
});

const commitsQuerySchema = z.object({
  owner: ownerField,
  repo: repoField,
  branch: z.string().trim().min(1).max(200).optional(),
  path: z.string().trim().min(1).max(500).optional(),
  per_page: z.string().regex(/^\d{1,3}$/).optional(),
});

export const githubReadRoutes = new Hono<{ Bindings: AppEnv }>()
  .get('/repo-info', zValidate('query', repoInfoQuerySchema), async (c) => {
    const container = createRequestContainer(c);
    const session = await container.getSession();
    const q = c.req.valid('query');
    const data = await executeGetGithubRepoInfo({
      githubGateway: container.githubGateway,
      accessToken: session?.accessToken,
      owner: q.owner,
      repo: q.repo,
    });
    return c.json(data, 200);
  })
  .get('/tree', zValidate('query', treeQuerySchema), async (c) => {
    const container = createRequestContainer(c);
    const session = await container.getSession();
    const q = c.req.valid('query');
    const data = await executeGetGithubRepoTree({
      githubGateway: container.githubGateway,
      accessToken: session?.accessToken,
      owner: q.owner,
      repo: q.repo,
      branch: q.branch || 'main',
    });
    return c.json(data, 200);
  })
  .get('/file', zValidate('query', fileQuerySchema), async (c) => {
    const container = createRequestContainer(c);
    const session = await container.getSession();
    const q = c.req.valid('query');
    const data = await executeGetGithubSingleFile({
      githubGateway: container.githubGateway,
      accessToken: session?.accessToken,
      owner: q.owner,
      repo: q.repo,
      path: q.path,
      ref: q.ref,
    });
    return c.json(data, 200);
  })
  .get('/folder', zValidate('query', folderQuerySchema), async (c) => {
    const container = createRequestContainer(c);
    const session = await container.getSession();
    const q = c.req.valid('query');
    const branch = q.ref || q.branch || 'main';
    const folder = (q.folder || 'schema').replace(/^\/+|\/+$/g, '');
    if (!folder) {
      throw new ValidationError(
        'Missing required parameters: owner, repo, branch, folder.'
      );
    }
    const data = await executeGetGithubModularFolder({
      githubGateway: container.githubGateway,
      accessToken: session?.accessToken,
      owner: q.owner,
      repo: q.repo,
      branch,
      folder,
    });
    return c.json(data, 200);
  })
  .get('/commits', zValidate('query', commitsQuerySchema), async (c) => {
    const container = createRequestContainer(c);
    const session = await container.getSession();
    const q = c.req.valid('query');
    const parsedPerPage = q.per_page ? Number(q.per_page) : undefined;
    const data = await executeGetGithubCommitHistory({
      githubGateway: container.githubGateway,
      accessToken: session?.accessToken,
      owner: q.owner,
      repo: q.repo,
      branch: q.branch,
      path: q.path,
      perPage: parsedPerPage,
    });
    return c.json(data, 200);
  });
