import { Hono } from 'hono';
import { validator } from 'hono/validator';
import type { AppEnv } from '../../types';
import { isRecord, readBoolean, readString } from '../../lib/http';
import {
  initGithubRepositoryBranch,
  pushBatchGithubFiles,
  pushSingleGithubFile,
} from '../../services/githubService';

interface InitBranchBody {
  owner: string;
  repo: string;
  branch?: string;
}

interface PushSingleBody {
  owner: string;
  repo: string;
  path: string;
  branch: string;
  message: string;
  content: string;
  expectedSha?: string;
  createNewBranch?: boolean;
  newBranchName?: string;
  forceWithLatestSha?: boolean;
}

interface PushBatchBody {
  owner: string;
  repo: string;
  branch: string;
  message: string;
  files: Array<{
    path: string;
    content: string;
    expectedSha?: string;
  }>;
  createNewBranch?: boolean;
  newBranchName?: string;
  forceWithLatestSha?: boolean;
}

export const githubWriteRoutes = new Hono<{ Bindings: AppEnv }>()
  .post(
    '/init-branch',
    validator('json', (value, c): InitBranchBody | Response => {
      if (!isRecord(value)) {
        return c.json({ error: 'Invalid JSON payload.' }, 400);
      }
      const owner = (readString(value, 'owner') || '').trim();
      const repo = (readString(value, 'repo') || '').trim();
      const branch = (readString(value, 'branch') || 'main').trim();
      if (!owner || !repo || !branch) {
        return c.json(
          { error: 'Missing required fields: owner, repo, and branch.' },
          400
        );
      }
      return { owner, repo, branch };
    }),
    async (c) => {
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
    }
  )
  .post(
    '/push',
    validator('json', (value, c): PushSingleBody | Response => {
      if (!isRecord(value)) {
        return c.json({ error: 'Invalid JSON payload.' }, 400);
      }
      const owner = (readString(value, 'owner') || '').trim();
      const repo = (readString(value, 'repo') || '').trim();
      const path = (readString(value, 'path') || '').trim();
      const branch = (readString(value, 'branch') || '').trim();
      const message = readString(value, 'message') || '';
      const content = readString(value, 'content');
      if (
        !owner ||
        !repo ||
        !path ||
        !branch ||
        !message.trim() ||
        content === undefined
      ) {
        return c.json(
          {
            error:
              'Missing required fields: owner, repo, path, branch, message, content.',
          },
          400
        );
      }
      const out: PushSingleBody = {
        owner,
        repo,
        path,
        branch,
        message,
        content,
      };
      const expectedSha = readString(value, 'expectedSha');
      const createNewBranch = readBoolean(value, 'createNewBranch');
      const newBranchName = readString(value, 'newBranchName');
      const forceWithLatestSha = readBoolean(value, 'forceWithLatestSha');
      if (expectedSha !== undefined) out.expectedSha = expectedSha;
      if (createNewBranch !== undefined) out.createNewBranch = createNewBranch;
      if (newBranchName !== undefined) out.newBranchName = newBranchName;
      if (forceWithLatestSha !== undefined) {
        out.forceWithLatestSha = forceWithLatestSha;
      }
      return out;
    }),
    async (c) => {
      const result = await pushSingleGithubFile(c, c.req.valid('json'));
      if (!result.ok) {
        return c.json(
          { error: result.error, code: result.code },
          result.status
        );
      }
      return c.json(result.data, 200);
    }
  )
  .post(
    '/push-batch',
    validator('json', (value, c): PushBatchBody | Response => {
      if (!isRecord(value)) {
        return c.json({ error: 'Invalid JSON payload.' }, 400);
      }
      const owner = (readString(value, 'owner') || '').trim();
      const repo = (readString(value, 'repo') || '').trim();
      const branch = (readString(value, 'branch') || '').trim();
      const message = readString(value, 'message') || '';
      const rawFiles = Array.isArray(value.files) ? value.files : [];
      const files: PushBatchBody['files'] = [];

      for (const item of rawFiles) {
        if (!isRecord(item)) continue;
        const p = readString(item, 'path');
        const content = readString(item, 'content');
        if (p && content !== undefined) {
          const sha = readString(item, 'expectedSha');
          files.push(
            sha !== undefined
              ? { path: p, content, expectedSha: sha }
              : { path: p, content }
          );
        }
      }

      if (!owner || !repo || !branch || !message.trim() || files.length === 0) {
        return c.json(
          {
            error:
              'Missing required fields: owner, repo, branch, message, and at least one file.',
          },
          400
        );
      }

      const out: PushBatchBody = {
        owner,
        repo,
        branch,
        message,
        files,
      };
      const createNewBranch = readBoolean(value, 'createNewBranch');
      const newBranchName = readString(value, 'newBranchName');
      const forceWithLatestSha = readBoolean(value, 'forceWithLatestSha');
      if (createNewBranch !== undefined) out.createNewBranch = createNewBranch;
      if (newBranchName !== undefined) out.newBranchName = newBranchName;
      if (forceWithLatestSha !== undefined) {
        out.forceWithLatestSha = forceWithLatestSha;
      }
      return out;
    }),
    async (c) => {
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
