import { Hono } from 'hono';
import { z } from 'zod';
import { ForbiddenError } from '../../../../shared/domain/errors';
import { executeCreateGithubPullRequest } from '../../../application/usecases/github/createPullRequest';
import { executeInitGithubRepositoryBranch } from '../../../application/usecases/github/initializeBranch';
import {
  executePushBatchGithubFiles,
  executePushSingleGithubFile,
} from '../../../application/usecases/github/pushGithubChanges';
import { createRequestContainer } from '../container';
import { GITHUB_SLUG_REGEX, zValidate } from '../middleware/validation';
import { verifyMutatingRequestOrigin } from '../security/httpSecurity';
import type { AppEnv } from '../types';

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

const createPrBodySchema = z.object({
  owner: ownerField,
  repo: repoField,
  head: z.string().trim().min(1, 'Head branch is required.').max(200),
  base: z.string().trim().min(1, 'Base branch is required.').max(200),
  title: z.string().trim().min(1, 'Pull request title is required.').max(256),
  body: z.string().max(65536).optional(),
});

export const githubWriteRoutes = new Hono<{ Bindings: AppEnv }>()
  .post('/init-branch', zValidate('json', initBranchBodySchema), async (c) => {
    if (!verifyMutatingRequestOrigin(c)) {
      throw new ForbiddenError('Invalid request origin.');
    }
    const container = createRequestContainer(c);
    const session = await container.getSession();
    const body = c.req.valid('json');
    const data = await executeInitGithubRepositoryBranch({
      githubGateway: container.githubGateway,
      accessToken: session?.accessToken,
      owner: body.owner,
      repo: body.repo,
      branch: body.branch || 'main',
    });
    return c.json(data, 200);
  })
  .post('/push', zValidate('json', pushSingleBodySchema), async (c) => {
    if (!verifyMutatingRequestOrigin(c)) {
      throw new ForbiddenError('Invalid request origin.');
    }
    const container = createRequestContainer(c);
    const session = await container.getSession();
    const data = await executePushSingleGithubFile({
      githubGateway: container.githubGateway,
      accessToken: session?.accessToken,
      body: c.req.valid('json'),
    });
    return c.json(data, 200);
  })
  .post('/push-batch', zValidate('json', pushBatchBodySchema), async (c) => {
    if (!verifyMutatingRequestOrigin(c)) {
      throw new ForbiddenError('Invalid request origin.');
    }
    const container = createRequestContainer(c);
    const session = await container.getSession();
    const data = await executePushBatchGithubFiles({
      githubGateway: container.githubGateway,
      accessToken: session?.accessToken,
      body: c.req.valid('json'),
    });
    return c.json(data, 200);
  })
  .post('/create-pr', zValidate('json', createPrBodySchema), async (c) => {
    if (!verifyMutatingRequestOrigin(c)) {
      throw new ForbiddenError('Invalid request origin.');
    }
    const container = createRequestContainer(c);
    const session = await container.getSession();
    const data = await executeCreateGithubPullRequest({
      githubGateway: container.githubGateway,
      accessToken: session?.accessToken,
      body: c.req.valid('json'),
    });
    return c.json(data, 200);
  });
