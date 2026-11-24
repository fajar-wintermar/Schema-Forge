import type { ApiContext, ParsedGithubUrlMeta } from '../types';
import { decodeBase64Utf8, getGithubSession } from '../lib/crypto';
import {
  encodeGithubPath,
  githubApiFetch,
  isDisallowedHostname,
  parseGithubFileUrl,
} from '../lib/githubClient';
import {
  isRecord,
  readJsonUnknown,
  readString,
  toErrorStatus,
  type ServiceResult,
} from '../lib/http';

export interface FetchRemoteDbmlResult {
  content: string;
  originalUrl: string;
  resolvedUrl: string;
  filename: string;
  githubMeta: (ParsedGithubUrlMeta & { sha?: string; htmlUrl?: string }) | null;
}

export async function fetchRemoteDbmlFromUrl(
  c: ApiContext,
  rawUrlInput: string
): Promise<ServiceResult<FetchRemoteDbmlResult>> {
  const trimmed = rawUrlInput.trim();
  if (!trimmed) {
    return { ok: false, status: 400, error: 'Please provide a URL.' };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmed);
  } catch {
    return {
      ok: false,
      status: 400,
      error: 'Invalid URL format. Include https:// or http://',
    };
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return {
      ok: false,
      status: 400,
      error: 'Only http:// and https:// URLs are supported.',
    };
  }

  if (isDisallowedHostname(parsedUrl.hostname)) {
    return {
      ok: false,
      status: 400,
      error: 'Local or private network URLs are not allowed.',
    };
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
          const gistJson = await readJsonUnknown(gistApiRes);
          if (isRecord(gistJson) && isRecord(gistJson.files)) {
            const files = Object.values(gistJson.files).filter(isRecord);
            const dbmlFile =
              files.find((f) => {
                const name = readString(f, 'filename') || '';
                return name.toLowerCase().endsWith('.dbml');
              }) || files[0];
            const content = dbmlFile ? readString(dbmlFile, 'content') : undefined;
            const filename = dbmlFile ? readString(dbmlFile, 'filename') : undefined;
            if (content && filename) {
              return {
                ok: true,
                data: {
                  content,
                  originalUrl: trimmed,
                  resolvedUrl: readString(dbmlFile, 'raw_url') || targetUrl,
                  filename,
                  githubMeta: null,
                },
              };
            }
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
        const fileData = await readJsonUnknown(ghRes);
        if (isRecord(fileData)) {
          const encodedContent = readString(fileData, 'content');
          const sha = readString(fileData, 'sha');
          if (encodedContent && sha) {
            return {
              ok: true,
              data: {
                content: decodeBase64Utf8(encodedContent),
                originalUrl: trimmed,
                resolvedUrl: targetUrl,
                filename:
                  readString(fileData, 'name') ||
                  githubMeta.path.split('/').pop() ||
                  'schema.dbml',
                githubMeta: {
                  ...githubMeta,
                  sha,
                  htmlUrl: readString(fileData, 'html_url'),
                },
              },
            };
          }
        }
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    let response: Response;
    let currentFetchUrl = targetUrl;
    try {
      const maxRedirects = 3;
      let redirects = 0;
      while (true) {
        response = await fetch(currentFetchUrl, {
          signal: controller.signal,
          redirect: 'manual',
          headers: {
            'User-Agent': 'SchemaForge-DBML-Studio',
            Accept: 'text/plain, text/x-dbml, application/octet-stream, */*',
          },
        });

        if (
          response.status >= 300 &&
          response.status < 400 &&
          response.headers.get('location')
        ) {
          if (redirects >= maxRedirects) {
            return {
              ok: false,
              status: 400,
              error: 'Too many redirects from remote URL.',
            };
          }
          const location = response.headers.get('location') || '';
          let nextUrl: URL;
          try {
            nextUrl = new URL(location, currentFetchUrl);
          } catch {
            return {
              ok: false,
              status: 400,
              error: 'Invalid redirect URL.',
            };
          }
          if (nextUrl.protocol !== 'http:' && nextUrl.protocol !== 'https:') {
            return {
              ok: false,
              status: 400,
              error: 'Redirect to unsupported URL scheme blocked.',
            };
          }
          if (isDisallowedHostname(nextUrl.hostname)) {
            return {
              ok: false,
              status: 400,
              error: 'Redirect to local or private network URL is not allowed.',
            };
          }
          currentFetchUrl = nextUrl.toString();
          redirects++;
          continue;
        }
        break;
      }
    } finally {
      clearTimeout(timer);
    }
    targetUrl = currentFetchUrl;

    if (!response.ok) {
      return {
        ok: false,
        status: toErrorStatus(response.status, 502),
        error: `Remote server returned HTTP ${response.status} ${response.statusText}`,
      };
    }

    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();
    if (text.length > 5 * 1024 * 1024) {
      return {
        ok: false,
        status: 413,
        error: 'Remote file exceeds 5 MB limit.',
      };
    }

    if (
      contentType.includes('text/html') &&
      /^\s*<!doctype html|^\s*<html/i.test(text)
    ) {
      return {
        ok: false,
        status: 422,
        error:
          'The URL returned an HTML webpage instead of a raw DBML file. Use a raw file URL or a GitHub blob URL.',
      };
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
          const metaJson = await readJsonUnknown(metaRes);
          if (isRecord(metaJson)) {
            enrichedGithubMeta = {
              ...githubMeta,
              sha: readString(metaJson, 'sha'),
              htmlUrl: readString(metaJson, 'html_url'),
            };
          }
        }
      } catch {
        // Ignore optional metadata lookup errors
      }
    }

    return {
      ok: true,
      data: {
        content: text,
        originalUrl: trimmed,
        resolvedUrl: targetUrl,
        filename,
        githubMeta: enrichedGithubMeta,
      },
    };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return {
        ok: false,
        status: 504,
        error: 'Timed out waiting for URL response (15s).',
      };
    }
    console.error('[fetchUrlService] Remote fetch failed:', err);
    return {
      ok: false,
      status: 502,
      error: 'Failed to fetch remote DBML file.',
    };
  }
}
