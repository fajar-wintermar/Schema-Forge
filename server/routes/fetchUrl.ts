import { Hono } from 'hono';
import type { ApiContext, AppEnv, ParsedGithubUrlMeta } from '../types';
import { decodeBase64Utf8, getGithubSession } from '../lib/crypto';
import {
  encodeGithubPath,
  githubApiFetch,
  isDisallowedHostname,
  parseGithubFileUrl,
} from '../lib/githubClient';

export const fetchUrlRoutes = new Hono<{ Bindings: AppEnv }>();

async function handleFetchUrl(c: ApiContext) {
  let bodyUrl = '';
  if (c.req.method === 'POST') {
    const body = await c.req.json<{ url?: unknown }>().catch(() => ({}));
    if (typeof (body as { url?: unknown }).url === 'string') {
      bodyUrl = (body as { url: string }).url;
    }
  }
  const rawInput = bodyUrl || c.req.query('url') || '';
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return c.json({ error: 'Please provide a URL.' }, 400);
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmed);
  } catch {
    return c.json(
      { error: 'Invalid URL format. Include https:// or http://' },
      400
    );
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return c.json(
      { error: 'Only http:// and https:// URLs are supported.' },
      400
    );
  }

  if (isDisallowedHostname(parsedUrl.hostname)) {
    return c.json(
      { error: 'Local or private network URLs are not allowed.' },
      400
    );
  }

  try {
    let targetUrl = parsedUrl.toString();
    const githubMeta = parseGithubFileUrl(targetUrl);
    if (githubMeta) {
      targetUrl = githubMeta.rawUrl;
    } else if (
      (parsedUrl.hostname === 'gist.github.com' ||
        parsedUrl.hostname === 'www.gist.github.com') &&
      !parsedUrl.pathname.endsWith('/raw')
    ) {
      const gistParts = parsedUrl.pathname.split('/').filter(Boolean);
      const gistId = gistParts[1] || gistParts[0];
      if (gistId) {
        const gistApiRes = await githubApiFetch(
          `/gists/${encodeURIComponent(gistId)}`
        );
        if (gistApiRes.ok) {
          const gistJson = (await gistApiRes.json()) as {
            files?: Record<
              string,
              { filename: string; content?: string; raw_url?: string }
            >;
          };
          const files = Object.values(gistJson.files || {});
          const dbmlFile =
            files.find((f) => f.filename.toLowerCase().endsWith('.dbml')) ||
            files[0];
          if (dbmlFile?.content) {
            return c.json({
              content: dbmlFile.content,
              originalUrl: trimmed,
              resolvedUrl: dbmlFile.raw_url || targetUrl,
              filename: dbmlFile.filename,
              githubMeta: null,
            });
          }
        }
      }
      targetUrl = `${targetUrl.replace(/\/+$/, '')}/raw`;
    }

    const session = await getGithubSession(c);
    if (githubMeta && session) {
      const ghRes = await githubApiFetch(
        `/repos/${encodeURIComponent(githubMeta.owner)}/${encodeURIComponent(
          githubMeta.repo
        )}/contents/${encodeGithubPath(githubMeta.path)}?ref=${encodeURIComponent(
          githubMeta.branch
        )}`,
        session.accessToken
      );
      if (ghRes.ok) {
        const fileData = (await ghRes.json()) as {
          content?: string;
          sha: string;
          html_url?: string;
          name?: string;
        };
        if (fileData.content) {
          const decoded = decodeBase64Utf8(fileData.content);
          return c.json({
            content: decoded,
            originalUrl: trimmed,
            resolvedUrl: targetUrl,
            filename:
              fileData.name ||
              githubMeta.path.split('/').pop() ||
              'schema.dbml',
            githubMeta: {
              ...githubMeta,
              sha: fileData.sha,
              htmlUrl: fileData.html_url,
            },
          });
        }
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'SchemaForge-DBML-Studio',
        Accept: 'text/plain, text/x-dbml, application/octet-stream, */*',
      },
    });
    clearTimeout(timer);

    if (!response.ok) {
      return c.json(
        {
          error: `Remote server returned HTTP ${response.status} ${response.statusText}`,
        },
        response.status as 400
      );
    }

    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();
    if (text.length > 5 * 1024 * 1024) {
      return c.json({ error: 'Remote file exceeds 5 MB limit.' }, 413);
    }

    if (
      contentType.includes('text/html') &&
      /^\s*<!doctype html|^\s*<html/i.test(text)
    ) {
      return c.json(
        {
          error:
            'The URL returned an HTML webpage instead of a raw DBML file. Use a raw file URL or a GitHub blob URL.',
        },
        422
      );
    }

    const pathParts = new URL(targetUrl).pathname.split('/').filter(Boolean);
    const filename =
      decodeURIComponent(pathParts[pathParts.length - 1] || '') ||
      'remote-schema.dbml';

    let enrichedGithubMeta:
      | (ParsedGithubUrlMeta & { sha?: string; htmlUrl?: string })
      | null = githubMeta;
    if (githubMeta) {
      try {
        const metaRes = await githubApiFetch(
          `/repos/${encodeURIComponent(githubMeta.owner)}/${encodeURIComponent(
            githubMeta.repo
          )}/contents/${encodeGithubPath(githubMeta.path)}?ref=${encodeURIComponent(
            githubMeta.branch
          )}`,
          session?.accessToken
        );
        if (metaRes.ok) {
          const metaJson = (await metaRes.json()) as {
            sha?: string;
            html_url?: string;
          };
          enrichedGithubMeta = {
            ...githubMeta,
            sha: metaJson.sha,
            htmlUrl: metaJson.html_url,
          };
        }
      } catch {
        // Ignore optional metadata lookup errors
      }
    }

    return c.json({
      content: text,
      originalUrl: trimmed,
      resolvedUrl: targetUrl,
      filename,
      githubMeta: enrichedGithubMeta,
    });
  } catch (err) {
    return c.json(
      {
        error:
          err instanceof Error
            ? err.name === 'AbortError'
              ? 'Timed out waiting for URL response (15s).'
              : err.message
            : 'Failed to fetch remote DBML file.',
      },
      502
    );
  }
}

fetchUrlRoutes.get('/api/fetch-url', handleFetchUrl);
fetchUrlRoutes.post('/api/fetch-url', handleFetchUrl);
