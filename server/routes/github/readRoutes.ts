import { Hono } from 'hono';
import type { AppEnv } from '../../types';
import { decodeBase64Utf8, getGithubSession } from '../../lib/crypto';
import {
  encodeGithubPath,
  fetchBlobText,
  githubApiFetch,
} from '../../lib/githubClient';

export const githubReadRoutes = new Hono<{ Bindings: AppEnv }>();

githubReadRoutes.get('/api/github/repo-info', async (c) => {
  const owner = (c.req.query('owner') || '').trim();
  const repo = (c.req.query('repo') || '').trim();
  if (!owner || !repo) {
    return c.json({ error: 'Missing owner or repo parameter.' }, 400);
  }

  const session = await getGithubSession(c);
  try {
    const [repoRes, branchesRes] = await Promise.all([
      githubApiFetch(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
        session?.accessToken
      ),
      githubApiFetch(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo
        )}/branches?per_page=100`,
        session?.accessToken
      ),
    ]);

    const repoJson = (await repoRes.json()) as {
      full_name?: string;
      default_branch?: string;
      private?: boolean;
      html_url?: string;
      permissions?: { push?: boolean };
      message?: string;
    };

    if (!repoRes.ok) {
      return c.json(
        {
          error: repoJson.message || 'Repository not found or inaccessible.',
        },
        repoRes.status as 400
      );
    }

    const branchesRaw = branchesRes.ok
      ? ((await branchesRes.json()) as Array<{ name: string }>)
      : [];

    const branches = branchesRaw.map((b) => b.name);

    return c.json({
      full_name: repoJson.full_name,
      owner,
      repo,
      default_branch: repoJson.default_branch || 'main',
      private: Boolean(repoJson.private),
      html_url: repoJson.html_url,
      canPush: Boolean(session && (repoJson.permissions?.push ?? true)),
      branches,
      isEmpty: branches.length === 0,
    });
  } catch (err) {
    return c.json(
      {
        error:
          err instanceof Error ? err.message : 'Failed to inspect repository.',
      },
      502
    );
  }
});

githubReadRoutes.get('/api/github/tree', async (c) => {
  const owner = (c.req.query('owner') || '').trim();
  const repo = (c.req.query('repo') || '').trim();
  const branch = (c.req.query('branch') || 'main').trim();

  if (!owner || !repo || !branch) {
    return c.json({ error: 'Missing owner, repo, or branch.' }, 400);
  }

  const session = await getGithubSession(c);
  try {
    const treeRes = await githubApiFetch(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
        repo
      )}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
      session?.accessToken
    );

    const treeJson = (await treeRes.json()) as {
      tree?: Array<{ path: string; type: string; size?: number; sha: string }>;
      truncated?: boolean;
      message?: string;
    };

    if (!treeRes.ok) {
      if (treeRes.status === 409 || /empty/i.test(treeJson.message || '')) {
        return c.json({
          files: [],
          truncated: false,
          isEmpty: true,
        });
      }
      return c.json(
        { error: treeJson.message || 'Failed to read repository file tree.' },
        treeRes.status as 400
      );
    }

    const files = (treeJson.tree || [])
      .filter((item) => item.type === 'blob')
      .map((item) => ({
        path: item.path,
        size: item.size || 0,
        sha: item.sha,
        isDbml: item.path.toLowerCase().endsWith('.dbml'),
      }))
      .sort((a, b) => {
        if (a.isDbml !== b.isDbml) return a.isDbml ? -1 : 1;
        return a.path.localeCompare(b.path);
      });

    return c.json({
      files,
      truncated: Boolean(treeJson.truncated),
      isEmpty: false,
    });
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch file tree.' },
      502
    );
  }
});

githubReadRoutes.get('/api/github/file', async (c) => {
  const owner = (c.req.query('owner') || '').trim();
  const repo = (c.req.query('repo') || '').trim();
  const filePath = (c.req.query('path') || '').trim();
  const ref = (c.req.query('ref') || '').trim();

  if (!owner || !repo || !filePath) {
    return c.json({ error: 'Missing owner, repo, or path.' }, 400);
  }

  const session = await getGithubSession(c);
  try {
    const refQuery = ref ? `?ref=${encodeURIComponent(ref)}` : '';
    const fileRes = await githubApiFetch(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
        repo
      )}/contents/${encodeGithubPath(filePath)}${refQuery}`,
      session?.accessToken
    );

    const fileJson = (await fileRes.json()) as {
      type?: string;
      content?: string;
      sha?: string;
      path?: string;
      html_url?: string;
      message?: string;
    };

    if (!fileRes.ok) {
      return c.json(
        { error: fileJson.message || 'Failed to read file from GitHub.' },
        fileRes.status as 400
      );
    }

    if (fileJson.type !== 'file' || typeof fileJson.content !== 'string') {
      return c.json({ error: 'Target path is not a readable text file.' }, 400);
    }

    return c.json({
      content: decodeBase64Utf8(fileJson.content),
      sha: fileJson.sha || '',
      path: fileJson.path || filePath,
      branch: ref || 'main',
      htmlUrl: fileJson.html_url,
      owner,
      repo,
    });
  } catch (err) {
    return c.json(
      {
        error:
          err instanceof Error ? err.message : 'Failed to fetch GitHub file.',
      },
      502
    );
  }
});

githubReadRoutes.get('/api/github/folder', async (c) => {
  const owner = (c.req.query('owner') || '').trim();
  const repo = (c.req.query('repo') || '').trim();
  const branch = (c.req.query('branch') || 'main').trim();
  const folder = (c.req.query('folder') || 'schema')
    .trim()
    .replace(/^\/+|\/+$/g, '');

  if (!owner || !repo || !branch || !folder) {
    return c.json(
      { error: 'Missing required parameters: owner, repo, branch, folder.' },
      400
    );
  }

  const session = await getGithubSession(c);
  try {
    const treeRes = await githubApiFetch(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
        repo
      )}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
      session?.accessToken
    );

    const treeJson = (await treeRes.json()) as {
      tree?: Array<{ path: string; type: string; size?: number; sha: string }>;
      message?: string;
    };

    if (!treeRes.ok) {
      return c.json(
        { error: treeJson.message || 'Failed to read repository tree.' },
        treeRes.status as 400
      );
    }

    const prefix = `${folder}/`;
    const dbmlItems = (treeJson.tree || [])
      .filter(
        (item) =>
          item.type === 'blob' &&
          item.path.startsWith(prefix) &&
          item.path.toLowerCase().endsWith('.dbml')
      )
      .sort((a, b) => a.path.localeCompare(b.path));

    if (dbmlItems.length === 0) {
      return c.json(
        { error: `No .dbml files found inside "${folder}/" on branch "${branch}".` },
        404
      );
    }

    if (dbmlItems.length > 250) {
      return c.json(
        { error: `Folder contains ${dbmlItems.length} .dbml files (max 250 per load).` },
        400
      );
    }

    const loadedFiles: Array<{ path: string; content: string; sha: string }> = [];

    // GraphQL batching keeps large modular folders within Cloudflare Workers subrequest limits.
    if (session?.accessToken) {
      const gqlChunkSize = 40;
      for (let i = 0; i < dbmlItems.length; i += gqlChunkSize) {
        const slice = dbmlItems.slice(i, i + gqlChunkSize);
        const aliasFields = slice
          .map(
            (item, idx) =>
              `f${idx}: object(oid: ${JSON.stringify(
                item.sha
              )}) { ... on Blob { text } }`
          )
          .join('\n');
        const gqlQuery = `query($owner: String!, $repo: String!) {
  repository(owner: $owner, name: $repo) {
    ${aliasFields}
  }
}`;
        const gqlRes = await fetch('https://api.github.com/graphql', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': 'SchemaForge-DBML-Studio',
            Authorization: `Bearer ${session.accessToken}`,
          },
          body: JSON.stringify({
            query: gqlQuery,
            variables: { owner, repo },
          }),
        });

        const gqlJson = (await gqlRes.json().catch(() => ({}))) as {
          data?: {
            repository?: Record<string, { text?: string | null } | null>;
          };
          errors?: Array<{ message?: string }>;
        };

        if (!gqlRes.ok || !gqlJson.data?.repository) {
          throw new Error(
            gqlJson.errors?.[0]?.message ||
              'Failed to batch-load modular files from GitHub.'
          );
        }

        const repoData = gqlJson.data.repository;
        for (let idx = 0; idx < slice.length; idx++) {
          const item = slice[idx];
          const text = repoData[`f${idx}`]?.text;
          if (typeof text === 'string') {
            loadedFiles.push({
              path: item.path,
              content: text,
              sha: item.sha,
            });
          } else {
            loadedFiles.push(
              await fetchBlobText({
                owner,
                repo,
                sha: item.sha,
                path: item.path,
                accessToken: session.accessToken,
                decodeBase64: decodeBase64Utf8,
              })
            );
          }
        }
      }
    } else {
      const batchSize = 8;
      for (let i = 0; i < dbmlItems.length; i += batchSize) {
        const slice = dbmlItems.slice(i, i + batchSize);
        const results = await Promise.all(
          slice.map((item) =>
            fetchBlobText({
              owner,
              repo,
              sha: item.sha,
              path: item.path,
              accessToken: session?.accessToken,
              decodeBase64: decodeBase64Utf8,
            })
          )
        );
        loadedFiles.push(...results);
      }
    }

    return c.json({
      owner,
      repo,
      branch,
      folder,
      files: loadedFiles,
    });
  } catch (err) {
    return c.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Failed to load modular schema folder.',
      },
      502
    );
  }
});
