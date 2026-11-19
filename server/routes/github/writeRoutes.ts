import { Hono } from 'hono';
import type { AppEnv } from '../../types';
import { encodeBase64Utf8, getGithubSession } from '../../lib/crypto';
import {
  commitInlineTree,
  createBranchRef,
  encodeGithubPath,
  githubApiFetch,
  isGithubRepoEmpty,
  isValidGithubBranchName,
} from '../../lib/githubClient';

export const githubWriteRoutes = new Hono<{ Bindings: AppEnv }>();

githubWriteRoutes.post('/api/github/init-branch', async (c) => {
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

  if (!isValidGithubBranchName(branch)) {
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

    const created = await createBranchRef({
      owner,
      repo,
      newBranch: branch,
      baseSha,
      accessToken: session.accessToken,
    });
    if (!created.ok) {
      return c.json({ error: created.error }, created.status as 400);
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

githubWriteRoutes.post('/api/github/push', async (c) => {
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
      if (!isValidGithubBranchName(cleanBranch)) {
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
        const created = await createBranchRef({
          owner,
          repo,
          newBranch: cleanBranch,
          baseSha: refData.object.sha,
          accessToken: session.accessToken,
        });
        if (!created.ok) {
          return c.json({ error: created.error }, created.status as 400);
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

githubWriteRoutes.post('/api/github/push-batch', async (c) => {
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
        if (!isValidGithubBranchName(cleanBranch)) {
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

      // Bootstrap empty repos with Contents API before creating inline Git trees
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

      const committed = await commitInlineTree({
        owner,
        repo,
        targetBranch,
        baseTreeSha: initCommitJson.tree.sha,
        parentCommitSha: initPutJson.commit.sha,
        message: message.trim(),
        files: cleanFiles.slice(1),
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
      if (!isValidGithubBranchName(cleanBranch)) {
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

      const created = await createBranchRef({
        owner,
        repo,
        newBranch: cleanBranch,
        baseSha: baseRefData.object.sha,
        accessToken: session.accessToken,
      });
      if (!created.ok) {
        return c.json({ error: created.error }, created.status as 400);
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
