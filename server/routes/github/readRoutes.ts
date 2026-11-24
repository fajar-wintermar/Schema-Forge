import { Hono } from 'hono';
import { validator } from 'hono/validator';
import type { AppEnv } from '../../types';
import {
  getGithubCommitHistory,
  getGithubModularFolder,
  getGithubRepoInfo,
  getGithubRepoTree,
  getGithubSingleFile,
} from '../../services/githubService';

interface RepoInfoQuery {
  owner: string;
  repo: string;
}

interface TreeQuery {
  owner: string;
  repo: string;
  branch: string;
}

interface FileQuery {
  owner: string;
  repo: string;
  path: string;
  ref?: string;
}

interface FolderQuery {
  owner: string;
  repo: string;
  branch: string;
  folder: string;
}

interface CommitsQuery {
  owner: string;
  repo: string;
  branch?: string;
  path?: string;
  per_page?: string;
}

function readQueryStr(
  query: Record<string, string | string[]>,
  key: string
): string {
  const raw = query[key];
  return typeof raw === 'string' ? raw.trim() : '';
}

function readOptionalQueryStr(
  query: Record<string, string | string[]>,
  key: string
): string | undefined {
  const raw = query[key];
  return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;
}

export const githubReadRoutes = new Hono<{ Bindings: AppEnv }>()
  .get(
    '/repo-info',
    validator('query', (value, c): RepoInfoQuery | Response => {
      const owner = readQueryStr(value, 'owner');
      const repo = readQueryStr(value, 'repo');
      if (!owner || !repo) {
        return c.json({ error: 'Missing owner or repo parameter.' }, 400);
      }
      return { owner, repo };
    }),
    async (c) => {
      const result = await getGithubRepoInfo(c, c.req.valid('query'));
      if (!result.ok) {
        return c.json({ error: result.error }, result.status);
      }
      return c.json(result.data, 200);
    }
  )
  .get(
    '/tree',
    validator('query', (value, c): TreeQuery | Response => {
      const owner = readQueryStr(value, 'owner');
      const repo = readQueryStr(value, 'repo');
      const branch = readQueryStr(value, 'branch') || 'main';
      if (!owner || !repo || !branch) {
        return c.json({ error: 'Missing owner, repo, or branch.' }, 400);
      }
      return { owner, repo, branch };
    }),
    async (c) => {
      const result = await getGithubRepoTree(c, c.req.valid('query'));
      if (!result.ok) {
        return c.json({ error: result.error }, result.status);
      }
      return c.json(result.data, 200);
    }
  )
  .get(
    '/file',
    validator('query', (value, c): FileQuery | Response => {
      const owner = readQueryStr(value, 'owner');
      const repo = readQueryStr(value, 'repo');
      const path = readQueryStr(value, 'path');
      const ref = readOptionalQueryStr(value, 'ref');
      if (!owner || !repo || !path) {
        return c.json({ error: 'Missing owner, repo, or path.' }, 400);
      }
      return ref ? { owner, repo, path, ref } : { owner, repo, path };
    }),
    async (c) => {
      const result = await getGithubSingleFile(c, c.req.valid('query'));
      if (!result.ok) {
        return c.json({ error: result.error }, result.status);
      }
      return c.json(result.data, 200);
    }
  )
  .get(
    '/folder',
    validator('query', (value, c): FolderQuery | Response => {
      const owner = readQueryStr(value, 'owner');
      const repo = readQueryStr(value, 'repo');
      const branch =
        readOptionalQueryStr(value, 'ref') ||
        readOptionalQueryStr(value, 'branch') ||
        'main';
      const folder = (readOptionalQueryStr(value, 'folder') || 'schema').replace(
        /^\/+|\/+$/g,
        ''
      );
      if (!owner || !repo || !branch || !folder) {
        return c.json(
          { error: 'Missing required parameters: owner, repo, branch, folder.' },
          400
        );
      }
      return { owner, repo, branch, folder };
    }),
    async (c) => {
      const result = await getGithubModularFolder(c, c.req.valid('query'));
      if (!result.ok) {
        return c.json({ error: result.error }, result.status);
      }
      return c.json(result.data, 200);
    }
  )
  .get(
    '/commits',
    validator('query', (value, c): CommitsQuery | Response => {
      const owner = readQueryStr(value, 'owner');
      const repo = readQueryStr(value, 'repo');
      if (!owner || !repo) {
        return c.json({ error: 'Missing owner or repo parameter.' }, 400);
      }
      const query: CommitsQuery = { owner, repo };
      const branch = readOptionalQueryStr(value, 'branch');
      const path = readOptionalQueryStr(value, 'path');
      const per_page = readOptionalQueryStr(value, 'per_page');
      if (branch) query.branch = branch;
      if (path) query.path = path;
      if (per_page) query.per_page = per_page;
      return query;
    }),
    async (c) => {
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
