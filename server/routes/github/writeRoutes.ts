import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../../types';
import { verifyMutatingRequestOrigin } from '../../lib/crypto';
import { GITHUB_SLUG_REGEX, zValidate } from '../../lib/validation';
import {
  initGithubRepositoryBranch,
  pushBatchGithubFiles,
  pushSingleGithubFile,
} from '../../services/githubService';

const ownerField = z
  .string()
  .trim()
  .min(1, 'Missing repository owner.')
  .max(100)
  .regex(GITHUB_SLUG_REGEX, 'Invalid repository owner.');

const repoField = z
  .string()
  .trim()
  .min(1, 'Missing repository name.')
  .max(100)
  .regex(GITHUB_SLUG_REGEX, 'Invalid repository name.');

const initBranchBodySchema = z.object({
  owner: ownerField,
  repo: repoField,
  branch: z.string().trim().min(1).max(200).optional(),
});

const pushSingleBodySchema = z.object({
  owner: ownerField,
  repo: repoField,
  path: z.string().trim().min(1, 'File path is required.').max(500),
  branch: z.string().trim().min(1, 'Branch is required.').max(200),
  message: z.string().trim().min(1, 'Commit message is required.').max(1000),
  content: z.string().max(5 * 1024 * 1024, 'File exceeds 5 MB limit.'),
  expectedSha: z.string().max(128).optional(),
  createNewBranch: z.boolean().optional(),
  newBranchName: z.string().max(200).optional(),
  forceWithLatestSha: z.boolean().optional(),
});

const pushBatchFileSchema = z.object({
  path: z.string().trim().min(1, 'File path is required.').max(500),
  content: z.string().max(5 * 1024 * 1024, 'File exceeds 5 MB limit.'),
  expectedSha: z.string().max(128).optional(),
});

const pushBatchBodySchema = z.object({
  owner: ownerField,
  repo: repoField,
  branch: z.string().trim().min(1, 'Branch is required.').max(200),
  message: z.string().trim().min(1, 'Commit message is required.').max(1000),
  files: z
    .array(pushBatchFileSchema)
    .min(1, 'Provide at least one file to push.')
    .max(300, 'Too many files in a single batch push.'),
  createNewBranch: z.boolean().optional(),
  newBranchName: z.string().max(200).optional(),
  forceWithLatestSha: z.boolean().optional(),
});

export const githubWriteRoutes = new Hono<{ Bindings: AppEnv }>()
  .post('/init-branch', zValidate('json', initBranchBodySchema), async (c) => {
    if (!verifyMutatingRequestOrigin(c)) {
      return c.json({ error: 'Invalid request origin.' }, 403);
    }
    const body = c.req.valid('json');
    const result = await initGithubRepositoryBranch(c, {
      owner: body.owner,
      repo: body.repo,
      branch: body.branch || 'main',
    });
    if (!result.ok) {
      return c.json({ error: result.error }, result.status);
    }
    return c.json(result.data, 200);
  })
  .post('/push', zValidate('json', pushSingleBodySchema), async (c) => {
    if (!verifyMutatingRequestOrigin(c)) {
      return c.json({ error: 'Invalid request origin.' }, 403);
    }
    const result = await pushSingleGithubFile(c, c.req.valid('json'));
    if (!result.ok) {
      return c.json(
        { error: result.error, code: result.code },
        result.status
      );
    }
    return c.json(result.data, 200);
  })
  .post('/push-batch', zValidate('json', pushBatchBodySchema), async (c) => {
      if (!verifyMutatingRequestOrigin(c)) {
        return c.json({ error: 'Invalid request origin.' }, 403);
      }
      const result = await pushBatchGithubFiles(c, c.req.valid('json'));
      if (!result.ok) {
        return c.json(
          {
            error: result.error,
            code: result.code,
            conflictPaths: result.conflictPaths,
          },
          result.status
        );
      }
      return c.json(result.data, 200);
    }
  );
