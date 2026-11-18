import { Hono } from 'hono';
import type { AppEnv } from '../types';
import {
  decodeBase64Utf8,
  encodeBase64Utf8,
  getGithubSession,
} from '../lib/crypto';
import {
  commitInlineTree,
  encodeGithubPath,
  githubApiFetch,
  isGithubRepoEmpty,
} from '../lib/githubClient';

export const githubRoutes = new Hono<{ Bindings: AppEnv }>();

// Explicit single-repo branch initialization (creates `main` on empty repos)
githubRoutes.post('/api/github/init-branch', async (c) => {
  const session = await getGithubSession(c);
  if (!session) {
    return c.json(
      { error: 'Please connect your GitHub account before creating a branch.' },
      401
    );
  }

  const body = await c.req
    .json<{ owner?: string; repo?: string; branch?: string }>()
    .catch(() => ({} as { owner?: string; repo?: string; branch?: string }));

  const owner = (body.owner || '').trim();
  const repo = (body.repo || '').trim();
  const branch = (body.branch || 'main').trim();

  if (!owner || !repo || !branch) {
    return c.json(
      { error: 'Missing required fields: owner, repo, and branch.' },
      400
    );
  }

  if (/[\s~^:?*\[]/.test(branch)) {
    return c.json(
      {
        error:
          'Please enter a valid branch name (no spaces or special characters).',
      },
      400
    );
  }

  try {
    const branchesRes = await githubApiFetch(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
        repo
      )}/branches?per_page=100`,
      session.accessToken
    );
    const branchesData = (await branchesRes.json()) as
      | Array<{ name: string; commit?: { sha: string } }>
      | { message?: string };

    if (!branchesRes.ok) {
      return c.json(
        {
          error:
            (!Array.isArray(branchesData) && branchesData.message) ||
            'Repository not found or inaccessible.',
        },
        branchesRes.status as 400
      );
    }

    const existingBranches = Array.isArray(branchesData) ? branchesData : [];

    // Empty repository: create an initial README.md commit to bootstrap the branch
    if (existingBranches.length === 0) {
      const readmeContent = `# ${repo}\n\nDBML database schema repository managed with SchemaForge.\n`;
      const putRes = await githubApiFetch(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo
        )}/contents/README.md`,
        session.accessToken,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: `Initialize ${branch} branch`,
            content: encodeBase64Utf8(readmeContent),
            branch,
          }),
        }
      );

      const putJson = (await putRes.json()) as {
        commit?: { sha: string; html_url?: string };
        message?: string;
      };

      if (!putRes.ok || !putJson.commit?.sha) {
        return c.json(
          {
            error:
              putJson.message ||
              `Failed to create "${branch}" branch on empty repository.`,
          },
          (putRes.status || 400) as 400
        );
      }

      return c.json({
        branch,
        initialized: true,
        alreadyExists: false,
        commitSha: putJson.commit.sha,
        commitUrl:
          putJson.commit.html_url ||
          `https://github.com/${owner}/${repo}/commit/${putJson.commit.sha}`,
      });
    }

    if (existingBranches.some((b) => b.name === branch)) {
      return c.json({
        branch,
        initialized: false,
        alreadyExists: true,
      });
    }

    const baseSha = existingBranches[0]?.commit?.sha;
    if (!baseSha) {
      return c.json(
        { error: 'Unable to resolve base commit SHA for branch creation.' },
        400
      );
    }

    const createRefRes = await githubApiFetch(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/refs`,
      session.accessToken,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ref: `refs/heads/${branch}`,
          sha: baseSha,
        }),
      }
    );
    const createRefJson = (await createRefRes.json()) as { message?: string };
    if (!createRefRes.ok) {
      return c.json(
        {
          error:
            createRefJson.message || `Failed to create branch "${branch}".`,
        },
        (createRefRes.status || 400) as 400
      );
    }

    return c.json({
      branch,
      initialized: true,
      alreadyExists: false,
      commitSha: baseSha,
    });
  } catch (err) {
    return c.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Failed to initialize repository branch.',
      },
      502
    );
  }
});

githubRoutes.get('/api/github/repo-info', async (c) => {
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
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches?per_page=100`,
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

githubRoutes.get('/api/github/tree', async (c) => {
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

githubRoutes.get('/api/github/file', async (c) => {
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

    const decoded = decodeBase64Utf8(fileJson.content);

    return c.json({
      content: decoded,
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

githubRoutes.post('/api/github/push', async (c) => {
  const session = await getGithubSession(c);
  if (!session) {
    return c.json(
      { error: 'Please connect your GitHub account before pushing changes.' },
      401
    );
  }

  const body = await c.req.json<{
    owner?: string;
    repo?: string;
    path?: string;
    branch?: string;
    message?: string;
    content?: string;
    expectedSha?: string;
    createNewBranch?: boolean;
    newBranchName?: string;
    forceWithLatestSha?: boolean;
  }>();

  const {
    owner,
    repo,
    path: filePath,
    branch,
    message,
    content,
    expectedSha,
    createNewBranch,
    newBranchName,
    forceWithLatestSha,
  } = body;

  if (
    !owner ||
    !repo ||
    !filePath ||
    !branch ||
    !message?.trim() ||
    typeof content !== 'string'
  ) {
    return c.json(
      {
        error:
          'Missing required fields: owner, repo, path, branch, message, content.',
      },
      400
    );
  }

  try {
    let targetBranch = branch.trim();

    if (createNewBranch) {
      const cleanBranch = (newBranchName || '').trim();
      if (!cleanBranch || /[\s~^:?*\[]/.test(cleanBranch)) {
        return c.json(
          {
            error:
              'Please enter a valid new branch name (no spaces or special characters).',
          },
          400
        );
      }

      const refRes = await githubApiFetch(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo
        )}/git/ref/heads/${encodeURIComponent(targetBranch)}`,
        session.accessToken
      );
      const refData = (await refRes.json()) as {
        object?: { sha: string };
        message?: string;
      };
      if (!refRes.ok || !refData.object?.sha) {
        const emptyRepo = await isGithubRepoEmpty(
          owner,
          repo,
          session.accessToken
        );
        if (emptyRepo) {
          targetBranch = cleanBranch;
        } else {
          return c.json(
            {
              error:
                refData.message ||
                `Unable to resolve base branch "${targetBranch}".`,
            },
            (refRes.status || 400) as 400
          );
        }
      } else {
        const createRefRes = await githubApiFetch(
          `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
            repo
          )}/git/refs`,
          session.accessToken,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ref: `refs/heads/${cleanBranch}`,
              sha: refData.object.sha,
            }),
          }
        );

        const createRefJson = (await createRefRes.json()) as {
          message?: string;
        };
        if (!createRefRes.ok) {
          return c.json(
            {
              error:
                createRefJson.message ||
                `Failed to create branch "${cleanBranch}".`,
            },
            createRefRes.status as 400
          );
        }
        targetBranch = cleanBranch;
      }
    }

    let shaToUse = expectedSha || undefined;

    if (forceWithLatestSha) {
      const latestRes = await githubApiFetch(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo
        )}/contents/${encodeGithubPath(filePath)}?ref=${encodeURIComponent(
          targetBranch
        )}`,
        session.accessToken
      );
      if (latestRes.ok) {
        const latestJson = (await latestRes.json()) as { sha?: string };
        shaToUse = latestJson.sha;
      } else if (latestRes.status === 404) {
        shaToUse = undefined;
      }
    }

    const putBody: Record<string, string> = {
      message: message.trim(),
      content: encodeBase64Utf8(content),
      branch: targetBranch,
    };
    if (shaToUse) {
      putBody.sha = shaToUse;
    }

    const putRes = await githubApiFetch(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
        repo
      )}/contents/${encodeGithubPath(filePath)}`,
      session.accessToken,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(putBody),
      }
    );

    const putJson = (await putRes.json()) as {
      content?: { sha: string; path: string; html_url: string };
      commit?: { sha: string; html_url: string };
      message?: string;
    };

    if (putRes.status === 409) {
      return c.json(
        {
          code: 'SHA_CONFLICT',
          error:
            'This file has been modified on GitHub since you loaded it. Pull the latest changes or push to overwrite.',
        },
        409
      );
    }

    if (!putRes.ok || !putJson.content || !putJson.commit) {
      return c.json(
        { error: putJson.message || 'Failed to push commit to GitHub.' },
        putRes.status as 400
      );
    }

    return c.json({
      sha: putJson.content.sha,
      path: putJson.content.path,
      branch: targetBranch,
      htmlUrl: putJson.content.html_url,
      commitSha: putJson.commit.sha,
      commitUrl: putJson.commit.html_url,
    });
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : 'GitHub push failed.' },
      502
    );
  }
});

// Modular Schema Folder Load & Atomic Multi-File Push
githubRoutes.get('/api/github/folder', async (c) => {
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

    // Use GitHub GraphQL batching when authenticated so large modular folders (e.g. 95+ files)
    // fit well within Cloudflare Workers subrequest limits.
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

        if (gqlRes.ok && gqlJson.data?.repository) {
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
              const blobRes = await githubApiFetch(
                `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
                  repo
                )}/git/blobs/${encodeURIComponent(item.sha)}`,
                session.accessToken
              );
              const blobJson = (await blobRes.json()) as {
                content?: string;
                encoding?: string;
                message?: string;
              };
              if (!blobRes.ok || typeof blobJson.content !== 'string') {
                throw new Error(
                  blobJson.message || `Failed to read blob for ${item.path}`
                );
              }
              loadedFiles.push({
                path: item.path,
                content:
                  blobJson.encoding === 'base64'
                    ? decodeBase64Utf8(blobJson.content)
                    : blobJson.content,
                sha: item.sha,
              });
            }
          }
          continue;
        }
        throw new Error(
          gqlJson.errors?.[0]?.message ||
            'Failed to batch-load modular files from GitHub.'
        );
      }
    } else {
      const batchSize = 8;
      for (let i = 0; i < dbmlItems.length; i += batchSize) {
        const slice = dbmlItems.slice(i, i + batchSize);
        const results = await Promise.all(
          slice.map(async (item) => {
            const blobRes = await githubApiFetch(
              `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
                repo
              )}/git/blobs/${encodeURIComponent(item.sha)}`,
              session?.accessToken
            );
            const blobJson = (await blobRes.json()) as {
              content?: string;
              encoding?: string;
              message?: string;
            };
            if (!blobRes.ok || typeof blobJson.content !== 'string') {
              throw new Error(
                blobJson.message || `Failed to read blob for ${item.path}`
              );
            }
            const content =
              blobJson.encoding === 'base64'
                ? decodeBase64Utf8(blobJson.content)
                : blobJson.content;
            return {
              path: item.path,
              content,
              sha: item.sha,
            };
          })
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

githubRoutes.post('/api/github/push-batch', async (c) => {
  const session = await getGithubSession(c);
  if (!session) {
    return c.json(
      { error: 'Please connect your GitHub account before pushing changes.' },
      401
    );
  }

  const body = await c.req.json<{
    owner?: string;
    repo?: string;
    branch?: string;
    message?: string;
    files?: Array<{ path: string; content: string; expectedSha?: string }>;
    createNewBranch?: boolean;
    newBranchName?: string;
    forceWithLatestSha?: boolean;
  }>();

  const {
    owner,
    repo,
    branch,
    message,
    files,
    createNewBranch,
    newBranchName,
    forceWithLatestSha,
  } = body;

  if (
    !owner ||
    !repo ||
    !branch ||
    !message?.trim() ||
    !Array.isArray(files) ||
    files.length === 0
  ) {
    return c.json(
      {
        error:
          'Missing required fields: owner, repo, branch, message, and at least one file.',
      },
      400
    );
  }

  try {
    let targetBranch = branch.trim();
    const cleanFiles = files.map((f) => ({
      ...f,
      cleanPath: f.path.trim().replace(/^\/+/, ''),
    }));

    const repoEmpty = await isGithubRepoEmpty(owner, repo, session.accessToken);

    if (repoEmpty) {
      if (createNewBranch) {
        const cleanBranch = (newBranchName || '').trim();
        if (!cleanBranch || /[\s~^:?*\[]/.test(cleanBranch)) {
          return c.json(
            {
              error:
                'Please enter a valid new branch name (no spaces or special characters).',
            },
            400
          );
        }
        targetBranch = cleanBranch;
      }

      // Empty repositories have no Git refs or trees yet; bootstrap with Contents API
      const first = cleanFiles[0];
      const initMsg =
        cleanFiles.length === 1
          ? message.trim()
          : `${message.trim()} (initialize repository)`;
      const initPutRes = await githubApiFetch(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo
        )}/contents/${encodeGithubPath(first.cleanPath)}`,
        session.accessToken,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: initMsg,
            content: encodeBase64Utf8(first.content),
            branch: targetBranch,
          }),
        }
      );
      const initPutJson = (await initPutRes.json()) as {
        content?: { sha: string; path: string; html_url: string };
        commit?: { sha: string; html_url: string };
        message?: string;
      };
      if (!initPutRes.ok || !initPutJson.content || !initPutJson.commit) {
        return c.json(
          {
            error:
              initPutJson.message ||
              'Failed to initialize empty repository on GitHub.',
          },
          (initPutRes.status || 400) as 400
        );
      }

      const firstFileResult = {
        path: initPutJson.content.path,
        sha: initPutJson.content.sha,
        htmlUrl:
          initPutJson.content.html_url ||
          `https://github.com/${owner}/${repo}/blob/${encodeURIComponent(
            targetBranch
          )}/${initPutJson.content.path}`,
      };

      if (cleanFiles.length === 1) {
        return c.json({
          branch: targetBranch,
          commitSha: initPutJson.commit.sha,
          commitUrl:
            initPutJson.commit.html_url ||
            `https://github.com/${owner}/${repo}/commit/${initPutJson.commit.sha}`,
          files: [firstFileResult],
        });
      }

      const initCommitRes = await githubApiFetch(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo
        )}/git/commits/${encodeURIComponent(initPutJson.commit.sha)}`,
        session.accessToken
      );
      const initCommitJson = (await initCommitRes.json()) as {
        tree?: { sha: string };
        message?: string;
      };
      if (!initCommitRes.ok || !initCommitJson.tree?.sha) {
        return c.json(
          {
            error:
              initCommitJson.message ||
              'Initialized repository but failed to read initial commit tree.',
          },
          (initCommitRes.status || 400) as 400
        );
      }

      const remaining = cleanFiles.slice(1);
      const committed = await commitInlineTree({
        owner,
        repo,
        targetBranch,
        baseTreeSha: initCommitJson.tree.sha,
        parentCommitSha: initPutJson.commit.sha,
        message: message.trim(),
        files: remaining,
        accessToken: session.accessToken,
        refAdvanceErrorMessage:
          'Failed to advance branch reference after initialization.',
      });

      if (!committed.ok) {
        return c.json({ error: committed.error }, committed.status as 400);
      }

      return c.json({
        branch: targetBranch,
        commitSha: committed.commitSha,
        commitUrl: committed.commitUrl,
        files: [firstFileResult, ...committed.files],
      });
    }

    if (createNewBranch) {
      const cleanBranch = (newBranchName || '').trim();
      if (!cleanBranch || /[\s~^:?*\[]/.test(cleanBranch)) {
        return c.json(
          {
            error:
              'Please enter a valid new branch name (no spaces or special characters).',
          },
          400
        );
      }

      const baseRefRes = await githubApiFetch(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo
        )}/git/ref/heads/${encodeURIComponent(targetBranch)}`,
        session.accessToken
      );
      const baseRefData = (await baseRefRes.json()) as {
        object?: { sha: string };
        message?: string;
      };
      if (!baseRefRes.ok || !baseRefData.object?.sha) {
        return c.json(
          {
            error:
              baseRefData.message ||
              `Unable to resolve base branch "${targetBranch}".`,
          },
          (baseRefRes.status || 400) as 400
        );
      }

      const createRefRes = await githubApiFetch(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/refs`,
        session.accessToken,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ref: `refs/heads/${cleanBranch}`,
            sha: baseRefData.object.sha,
          }),
        }
      );
      const createRefJson = (await createRefRes.json()) as { message?: string };
      if (!createRefRes.ok) {
        return c.json(
          {
            error:
              createRefJson.message ||
              `Failed to create branch "${cleanBranch}".`,
          },
          createRefRes.status as 400
        );
      }
      targetBranch = cleanBranch;
    }

    const headRefRes = await githubApiFetch(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
        repo
      )}/git/ref/heads/${encodeURIComponent(targetBranch)}`,
      session.accessToken
    );
    const headRefJson = (await headRefRes.json()) as {
      object?: { sha: string };
      message?: string;
    };
    if (!headRefRes.ok || !headRefJson.object?.sha) {
      return c.json(
        {
          error:
            headRefJson.message ||
            `Could not find branch "${targetBranch}" in ${owner}/${repo}.`,
        },
        (headRefRes.status || 400) as 400
      );
    }
    const parentCommitSha = headRefJson.object.sha;

    const commitRes = await githubApiFetch(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
        repo
      )}/git/commits/${encodeURIComponent(parentCommitSha)}`,
      session.accessToken
    );
    const commitJson = (await commitRes.json()) as {
      tree?: { sha: string };
      message?: string;
    };
    if (!commitRes.ok || !commitJson.tree?.sha) {
      return c.json(
        { error: commitJson.message || 'Failed to read branch commit tree.' },
        (commitRes.status || 400) as 400
      );
    }
    const baseTreeSha = commitJson.tree.sha;

    // Check remote tree for per-file SHA conflicts when not forcing overwrite
    if (!forceWithLatestSha && files.some((f) => Boolean(f.expectedSha))) {
      const treeCheckRes = await githubApiFetch(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo
        )}/git/trees/${encodeURIComponent(baseTreeSha)}?recursive=1`,
        session.accessToken
      );
      if (treeCheckRes.ok) {
        const treeCheckJson = (await treeCheckRes.json()) as {
          tree?: Array<{ path: string; sha: string; type: string }>;
        };
        const remoteShas = new Map<string, string>();
        for (const entry of treeCheckJson.tree || []) {
          if (entry.type === 'blob') remoteShas.set(entry.path, entry.sha);
        }
        const conflicts = files
          .filter((f) => {
            if (!f.expectedSha) return false;
            const currentRemoteSha = remoteShas.get(f.path.replace(/^\/+/, ''));
            return currentRemoteSha && currentRemoteSha !== f.expectedSha;
          })
          .map((f) => f.path);
        if (conflicts.length > 0) {
          return c.json(
            {
              code: 'SHA_CONFLICT',
              conflictPaths: conflicts,
              error: `Remote changes detected in: ${conflicts.join(
                ', '
              )}. Pull latest files or overwrite with your changes.`,
            },
            409
          );
        }
      }
    }

    const committed = await commitInlineTree({
      owner,
      repo,
      targetBranch,
      baseTreeSha,
      parentCommitSha,
      message: message.trim(),
      files: cleanFiles,
      accessToken: session.accessToken,
      refAdvanceErrorMessage:
        'Failed to advance branch reference (concurrent push occurred).',
      conflictOn422: true,
    });

    if (!committed.ok) {
      return c.json({ error: committed.error }, committed.status as 400);
    }

    return c.json({
      branch: targetBranch,
      commitSha: committed.commitSha,
      commitUrl: committed.commitUrl,
      files: committed.files,
    });
  } catch (err) {
    return c.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Failed to push modular files to GitHub.',
      },
      502
    );
  }
});
