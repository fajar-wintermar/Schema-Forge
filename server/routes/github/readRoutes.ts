import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../../types';
import { GITHUB_SLUG_REGEX, zValidate } from '../../lib/validation';
import {
  getGithubCommitHistory,
  getGithubModularFolder,
  getGithubRepoInfo,
  getGithubRepoTree,
  getGithubSingleFile,
} from '../../services/githubService';

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
    const result = await getGithubRepoInfo(c, c.req.valid('query'));
    if (!result.ok) {
      return c.json({ error: result.error }, result.status);
    }
    return c.json(result.data, 200);
  })
  .get('/tree', zValidate('query', treeQuerySchema), async (c) => {
    const q = c.req.valid('query');
    const result = await getGithubRepoTree(c, {
      owner: q.owner,
      repo: q.repo,
      branch: q.branch || 'main',
    });
    if (!result.ok) {
      return c.json({ error: result.error }, result.status);
    }
    return c.json(result.data, 200);
  })
  .get('/file', zValidate('query', fileQuerySchema), async (c) => {
    const result = await getGithubSingleFile(c, c.req.valid('query'));
    if (!result.ok) {
      return c.json({ error: result.error }, result.status);
    }
    return c.json(result.data, 200);
  })
  .get('/folder', zValidate('query', folderQuerySchema), async (c) => {
    const q = c.req.valid('query');
    const branch = q.ref || q.branch || 'main';
    const folder = (q.folder || 'schema').replace(/^\/+|\/+$/g, '');
    if (!folder) {
      return c.json(
        { error: 'Missing required parameters: owner, repo, branch, folder.' },
        400
      );
    }
    const result = await getGithubModularFolder(c, {
      owner: q.owner,
      repo: q.repo,
      branch,
      folder,
    });
    if (!result.ok) {
      return c.json({ error: result.error }, result.status);
    }
    return c.json(result.data, 200);
  })
  .get('/commits', zValidate('query', commitsQuerySchema), async (c) => {
      const q = c.req.valid('query');
      const parsedPerPage = q.per_page ? Number(q.per_page) : undefined;
      const result = await getGithubCommitHistory(c, {
        owner: q.owner,
        repo: q.repo,
        branch: q.branch,
        path: q.path,
        perPage: parsedPerPage,
      });
      if (!result.ok) {
        return c.json({ error: result.error }, result.status);
      }
      return c.json(result.data, 200);
    }
  );
